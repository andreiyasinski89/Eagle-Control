# Going to production: checklist

Work top to bottom. Items marked **blocker** stop a safe launch. Everything here is about running MeetOwl; what it does is in `README.md`.

## 1. Before the first deploy

- [ ] **Blocker – Postgres 16** (managed, with automatic backups and point-in-time recovery). PGlite is for local checks only (single connection).
- [ ] **Blocker – `DATABASE_URL`**, and run `npm run db:deploy` (applies migrations 0001–0007). Never run `db:seed` or `scripts/dev-session.ts` against production: they create demo users and mint sign-in sessions.
- [ ] **Blocker – `AUTH_SECRET`** (`openssl rand -base64 32`) and **`AUTH_URL`** = the public https address. Without `AUTH_URL` (or `AUTH_TRUST_HOST=true`) Auth.js answers every request with `UntrustedHost` and nobody can sign in. This was found by running the production build.
- [ ] **Blocker – `SECRETS_KEY`** (`openssl rand -base64 32`). It encrypts Google, Slack and webhook secrets. Keep a copy in your secret manager: **losing it makes every stored integration token unreadable**; rotating it needs a re-encryption script (not built).
- [ ] **Blocker – mail:** `RESEND_API_KEY` (or SMTP) and `MAIL_FROM` on a domain with SPF, DKIM and DMARC set. Sign-in links, invitations, reminders and client notifications all go by e-mail.
- [ ] **Blocker – object storage** (S3, R2 or MinIO): `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Block public access to the bucket and add a CORS rule that allows `PUT` and `GET` from `APP_URL`. Uploads and downloads use 5-minute presigned links; downloads are forced to `attachment`.
- [ ] **`TRUSTED_PROXY_HOPS`** = number of proxies in front of the app that append to `X-Forwarded-For` (1 behind one load balancer or Vercel). Wrong value = rate limits keyed on the wrong address. Make sure your proxy appends, not passes through, the header.
- [ ] **`APP_URL`** = the same public address (links in e-mails, OAuth redirects, webhook URLs).
- [ ] Run **one** app instance until the items in section 5 are done.

## 2. Background jobs

Two ways to run them; use one.

- **Inngest:** set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (the signing key is mandatory in production) and register `<APP_URL>/api/inngest`. The schedules are built in.
- **Your own scheduler:** set `CRON_SECRET` (16+ characters) and call `GET` or `POST <APP_URL>/api/jobs/<job>` with `Authorization: Bearer <CRON_SECRET>`. Write the slash in a job name as `~`. With no `CRON_SECRET` the endpoint does not exist.

| Job (URL name) | Every | Does |
|---|---|---|
| `notify~deliver` | minute | sends e-mail, Slack and Telegram notifications from the outbox |
| `webhooks~deliver` | minute | sends and retries outgoing webhooks |
| `reminders~dispatch` | 5 minutes | reminders, "going cold" notices |
| `calendar~poll` | 10 minutes | pulls Google Calendar changes, renews push channels |
| `health~refresh` | night (02:00) | recomputes project health, "turned red" and "sprint ended" notices |
| `maintenance~run` | night (03:30) | removes expired sessions and tokens, old lead submissions, old read notifications |
| `api~purge` | night (03:45) | drops old idempotency keys and webhook deliveries |
| `billing~expire` | night (04:15) | moves workspaces whose payment grace period ran out to Free |
| `account~erase` | hour | erases accounts whose deletion grace period (default 7 days) is over |

(`calendar~push` is event-driven and needs no schedule.) Without a scheduler, notifications are never delivered and plans never expire. Alert if pending `Notification.pendingChannels` or `WebhookDelivery` rows keep growing.

## 3. Third-party services (each one is optional; skip what you do not sell)

| Service | Set | Check once, in the provider's test mode |
|---|---|---|
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET`; webhook to `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`; enable the Customer Portal | Stripe CLI: pay with `4242…`, then `4000 0000 0000 0341` (fails later); watch the plan change and the 7-day grace |
| Claude | `ANTHROPIC_API_KEY`, `AI_MODEL` | one summary, one client update, one subtask suggestion; compare cost per call with the 1,000,000-token allowance |
| Google Calendar | `GOOGLE_CAL_CLIENT_ID/SECRET`; redirect `<APP_URL>/api/integrations/google/callback`; publish the OAuth consent screen (calendar scope needs Google's verification for external users) | create an event, edit it in Google, delete it in Google |
| Slack | `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET`; redirect and events URLs from the README | install, route one event, uninstall |
| Telegram | `TELEGRAM_BOT_TOKEN/USERNAME/WEBHOOK_SECRET`; run `setWebhook` once (README) | link, `/today`, `/task`, `/done` |
| Google sign-in | `AUTH_GOOGLE_ID/SECRET` | sign in with an existing e-mail address and confirm it joins the same account |

None of these were run against the real service during development.

## 4. Verify the deployed app (30 minutes)

- [ ] `GET /api/health` is `ok` through the public address.
- [ ] Response headers on any page include `Strict-Transport-Security`, `Content-Security-Policy` (production only), `X-Frame-Options: DENY`, `Permissions-Policy`. The CSP allows inline scripts (Next.js needs them) and only the storage origin for uploads; if you add a third-party script or image host, add it to `next.config.ts` first.
- [ ] Sign in by e-mail link; a second request for the same address within 15 minutes more than 5 times returns 429.
- [ ] Create a workspace → project → task; open it in two browsers: changes and presence appear live.
- [ ] Upload a file (≤ 25 MB) and download it. If the upload is refused with a signature error, the storage provider does not accept the signed `Content-Length`: remove `size` from `presignUpload` in `src/server/storage.ts` and rely on the 25 MB check at confirm time.
- [ ] Invite a client to a project, share one node, sign in as the client: only that node is visible and `/api/v1/projects/<id>/tree` answers 403.
- [ ] Create an API token (Pro), call `/api/public/v1/projects`, revoke it, call again (401).
- [ ] Send a test webhook from Settings → Developers to a receiver that checks the signature.
- [ ] Trigger a test lead from the public form and confirm the CORS allow-list.

## 5. Scaling and operations

- [ ] Rate limits, realtime events, presence and the AI limiter live **in memory**: one instance only. Before running several, move rate limits to Redis/Upstash and put a pub/sub behind `src/server/realtime` (Redis, or Postgres `LISTEN/NOTIFY`).
- [ ] Connection pool: Prisma uses a pool per instance; set `connection_limit` to fit your Postgres, or put pgbouncer in front.
- [ ] **Error tracking and logs:** the app logs with `console`. Add Sentry (or similar) and ship stdout to a log service; do not log request bodies.
- [ ] **Backups:** restore a backup into a scratch database once and run the app against it. Test before you need it.
- [ ] **Uptime monitor** on `/api/health` (it checks the database) and on the Stripe/Inngest webhook endpoints' logs.
- [ ] **CI:** run `npm run typecheck`, `npm run lint`, `npm test` and `npm audit --omit=dev` on every change; run `npx playwright test` once against a staging copy (the e2e specs have never been run).

## 6. Legal and privacy

- [x] Data subject requests: people can download their data and delete their account themselves (Settings → Account). Deletion runs from the hourly `account~erase` job: **if that job is not scheduled, nobody's deletion ever completes**. Set `ACCOUNT_DELETION_GRACE_DAYS` (default 7) and say the same number in your privacy policy. CRM contacts are erased from Settings → CRM.
- [ ] Make sure the mail provider can deliver the confirmation codes quickly (both actions depend on them).
- [ ] Privacy policy and terms; list the processors: hosting, Postgres, mail provider, storage, Stripe, Anthropic (workspace text is sent to it when AI is used), Google/Slack/Telegram when connected.
- [ ] Data region: `Workspace.region` is stored but nothing routes by it; everything is in one database.
- [ ] Retention: decide how long to keep activity logs, notifications (maintenance job prunes old ones) and soft-deleted nodes.
- [ ] Cookie notice: the app sets only the session cookie and a theme/locale preference (no analytics, no ad trackers).

## 7. Known risks you accept at launch

See `docs/AUDIT.md`, section "Open items".
