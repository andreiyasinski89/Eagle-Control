# Final audit (after Phase 5)

What was checked, what was found, what was fixed, and what is still open. Findings are ranked by what an attacker or an outage could do, not by effort. Everything below was verified by running code (tests, the production build in a browser, `npm audit`), not only by reading it.

**State:** 430 tests pass (unit and real-SQL integration), `tsc` and `eslint` are clean, the production build runs. Line coverage of `src/server`, `src/modules`, `src/lib` is 89% (branches 76%) before this audit's additions. Nothing external (Stripe, Claude, Google, Slack, Telegram, S3, Inngest) was ever called for real, and the Playwright specs have never been run.

## 1. Fixed in this audit

| # | Severity | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | High | Rate limits and lead-form abuse tracking keyed on the **first** entry of `X-Forwarded-For`, which is whatever the client sends. Anyone could dodge every limit by changing a header. | `clientIp()` takes the entry added by our own proxy (`TRUSTED_PROXY_HOPS`, default 1) | `http-layer.test.ts`; also checked against the running server |
| 2 | High | Sign-in by e-mail was not limited: a script could flood any mailbox with sign-in links and burn the mail quota. | 30 sign-in POSTs per 15 min per address of the caller, 5 e-mails per 15 min per mailbox | 6th request for one mailbox answered 429 on the production server, even with forged headers |
| 3 | Medium | No cap on request bodies; JSON was parsed whatever its size, and the lead form only trusted `Content-Length` (chunked bodies passed). The `zod` advisory (memory exhaustion on oversized collections) made this exploitable. | `readJson`/`readText` stop reading at the limit (1 MB; 64 KB lead form; 512 KB webhooks) regardless of headers | tests for lying and chunked bodies |
| 4 | Medium | Presigned uploads bound the content type but not the length, so the 25 MB limit applied to a claim, not to the bytes. | `ContentLength` is signed into the URL | signed headers asserted in `storage.test.ts`; **not tried against a real bucket** |
| 5 | Medium | No CSP, HSTS, Permissions-Policy or COOP. | Added (CSP and HSTS in production only). The CSP allows inline scripts because Next.js needs them; it blocks loading code from, or sending data to, any other origin. | production build loaded in a browser: pages, realtime stream, uploads origin; no violations |
| 6 | Low | `syncNow` (Google) answered "not connected" instead of "not found" to strangers, without a membership check. | membership check first | `tenant-isolation.test.ts` |
| 7 | **Launch blocker** | A production build behind no Vercel/`AUTH_URL` answered every request with `UntrustedHost`: nobody could sign in. Invisible in development. | `AUTH_URL` documented and added to `.env.example`; in the checklist as a blocker | seen in the production server log, then fixed by setting it |
| 8 | Operational | Without Inngest nothing scheduled the nightly jobs, reminders, delivery or billing grace expiry: the README said "inline" but gave no trigger. | `/api/jobs/<name>` with `CRON_SECRET` (off when unset), documented with a schedule | `jobs-route.test.ts` |

## 2. What was reviewed and found sound

- **Tenant isolation.** About 80 service calls (nodes, comments, files, tags, time, CRM, reports, metrics, API tokens, webhooks, billing, AI, portal, integrations) were run as a paying customer of *another* workspace: all refused, and the data was unchanged afterwards. Realtime rooms refuse them too. (`tenant-isolation.test.ts`)
- **Nothing public by accident.** A test lists every `route.ts` and fails if one appears that neither uses the session wrapper nor is on a reviewed list with its own protection (signature, secret, signed state, rate limit). 15 routes are on that list; each webhook verifies a signature or token.
- **Client portal.** Clients are refused by policy everywhere in the workspace API; the portal answers "not found" for anything not shared; hidden parents, descriptions, assignees, estimates, internal comments and unshared files never appear in its responses; approvals cannot be decided by staff or twice. Checked in tests and in a browser.
- **Public API.** Tokens are hashed, bound to one workspace, die with the owner's membership and the plan; every id in a path is checked against the token's workspace; idempotency, rate limit, scope and audit are in one dispatcher.
- **Webhooks out.** https only, no credentials in URLs, private/loopback/link-local/CGNAT ranges refused at save *and* at send, redirects not followed, HMAC-signed, secrets encrypted at rest.
- **Secrets.** `.env` and `.env.local` are ignored by git; only `.env.example` is tracked. Integration tokens are AES-256-GCM encrypted. Stripe, Slack, Telegram and Google webhooks compare in constant time. API tokens and the Telegram link code are stored hashed.
- **Injection.** No `dangerouslySetInnerHTML`, `eval` or string-built SQL (the only raw query is `SELECT 1`). CSV exports neutralise formulas. User text goes to the AI wrapped as data, and AI output is never executed or posted automatically.
- **Open redirects.** Sign-in `callbackUrl` is handled by Auth.js (same origin only); OAuth `state` is signed, expiring and bound to the signed-in user.
- **Files.** Names are sanitised inside object keys; downloads are forced to `attachment`; upload keys must start with `<workspace>/<node>/` of the node they were minted for.

## 3. Open items (not fixed)

Ordered by how much they should worry you before launch.

1. ~~No account-level data export or deletion~~ **Done after the audit** (see section 5).
2. **Never run against the real services.** Stripe (including the grace-period flow), Claude, Google Calendar (including push channels), Slack, Telegram, S3 uploads with a signed length, Inngest. Budget a test-mode pass for each (see `docs/PRODUCTION.md`, section 3).
3. **Single instance only.** Rate limits (including sign-in and the API), realtime events, presence and the AI limiter are in process memory. Two instances behind a load balancer would give each caller double limits and split the live updates.
4. **Dependency advisories (11, from `npm audit --omit=dev`).** Assessed one by one:
   - `nodemailer` ("raw" option reads files): we never pass user-controlled message options. Not reachable. No fix available upstream yet (`@auth/core` depends on it).
   - `zod` < 4.6.6 (memory with huge collections): mitigated by the body caps above; upgrading to zod 4 is a breaking change across every schema.
   - `next` → `postcss` (moderate; `</style>` in CSS stringify, source-map path): affects CSS processing at build time, not request handling. Fix needs Next 16.
   - `prisma` → `@prisma/config` → `deepmerge-ts`, `inngest` → `zod`: CLI-side or covered by the zod note.
   Plan: Next 16, Prisma 7 and zod 4 as one scheduled upgrade; run `npm audit` in CI and treat new *reachable* advisories as blockers.
5. **No account activity trail.** Writes through the API and many node changes are in `ActivityLog`, but sign-ins, token creation, plan changes and exports are not, and there is no screen or export for the log.
6. **CSP keeps `'unsafe-inline'` for scripts** (needed by Next.js hydration). It limits where code and data can go, not injected inline code. A nonce-based policy is possible with a custom middleware.
7. **Webhook DNS rebinding.** Addresses are checked before sending, but the connection is not pinned to the checked address.
8. **No error tracking or metrics.** Logs are `console` only.
9. **Sessions** are database sessions with Auth.js defaults (30 days); there is no "sign out everywhere" screen.
10. **Google sign-in links accounts by e-mail** (`allowDangerousEmailAccountLinking`). Safe with Google (verified addresses); do not add another identity provider without revisiting it.
11. **Performance targets** (500 nodes in 1.5 s, 60 fps at 2,000) were never measured; the whole project tree loads in one request.
12. **No component or end-to-end tests run.** The React UI is covered only by manual browser checks; `e2e/` specs exist but have not been executed.
13. **Migration 0004 was edited after being applied on the author's development database** (deal-history backfill). Databases created from the migrations are correct; that one development database got the same rows by hand.
14. **Quality gaps left by the coverage run:** `crm/companies` 64%, `crm/activities` 65%, `jobs/tasks` 69%, `crm/pipelines` 69%, `comments` 61%, `tags` 62%, `attachments` 18% (its security-relevant paths are now covered through the portal and isolation tests, not its happy path).

## 4. Tests added by this audit

`http-layer.test.ts` (wrapper, error shapes, rate limits, client address, body limits, route inventory), `tenant-isolation.test.ts`, `storage.test.ts`, `jobs-route.test.ts`. Before this, `src/server/http/handler.ts` (authentication and error mapping for every route) had **no direct test**.

## 5. Update: account export and erasure (GDPR)

Built after the audit, because it was the one open launch blocker that did not depend on a provider.

- **Export** and **deletion** of a signed-in person's account, both gated by an e-mailed one-time code (hashed, single use, 10 minutes, five tries, three codes an hour).
- **Deletion** is scheduled with a cancellable grace period and carried out by an hourly job. It deletes credentials, sessions, tokens, integrations (revoking Google), notifications, memberships and every workspace with no one else on the team (cancelling its Stripe subscription first, and waiting if Stripe is down); it anonymises authorship elsewhere instead of deleting shared work, and refuses a sole owner whose team would be left without an owner (**Make owner** hands a workspace over).
- Tested on a real database (14 integration tests, 12 unit tests) and by hand in a browser: the real e-mail with the code, scheduling, the banner, cancelling, and a download that rejects wrong and reused codes and contains no secrets.
- **Still manual or open:** names typed inside other people's comments, retention of old activity logs, deleting the account from the public API, and an automated "sign out everywhere". Take legal advice on the privacy policy wording; the product now does what a policy would promise.
