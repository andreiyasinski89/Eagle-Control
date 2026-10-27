# MeetOwl.ai

Agile mind map + CRM in one tree, for teams and their clients. Next.js (App Router), TypeScript strict, Prisma/Postgres, Auth.js, React Flow; English, Russian and Polish.

**What works:** mind-map projects with progress roll-up and heatmap, Kanban/List/Calendar/Timeline views, CRM (pipelines, deals, companies, contacts, My Day), time tracking and reports, realtime presence, Google Calendar/Slack/Telegram integrations, Stripe billing, public API with webhooks, client portal, AI assistant, and account export/deletion (GDPR). 452 automated tests; see [CHANGELOG.md](CHANGELOG.md), [DECISIONS.md](DECISIONS.md), [docs/AUDIT.md](docs/AUDIT.md) and [docs/PRODUCTION.md](docs/PRODUCTION.md) before going live.

**Fastest start** (needs Node 20+ and Docker; details below): `npm install`, `cp .env.example .env` and set `AUTH_SECRET` (`openssl rand -base64 32`), `docker compose up -d`, `npx prisma migrate deploy`, `npm run db:seed`, `npm run dev`, then open http://localhost:3000 and sign in as `demo@meetowl.local` (the magic link arrives in Mailpit, http://localhost:8025).

The history by phase:

**Phase 1** (foundation): auth, workspaces, invitations, layout, full schema.
**Phase 2** (mind map core): projects from templates, node tree with nesting rules, progress roll-up, heatmap, drawer, comments with @mentions, tags, attachments, filters, search, undo/redo.
**Phase 3** (CRM): pipelines and deal board, companies, contacts, activities, My Day, CSV import/export, duplicate merge, GDPR tools, lead forms and webhook, deal → project from a template, Client Map.

**Connect Google Calendar, Telegram and website leads:** [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) (Russian, step by step).

**A real installation with sign-up by e-mail link and Pro for you:** [docs/GO-LIVE.md](docs/GO-LIVE.md) (Russian, step by step).

**Want a link to click instead of installing anything?** Publish a demo on Vercel in about ten minutes: see [docs/DEPLOY.md](docs/DEPLOY.md).

## Run locally (with Docker)

Requirements: Node 20+, Docker (Postgres, Mailpit, MinIO).

```bash
npm install                   # also runs `prisma generate`; if you see "@prisma/client did not initialize", run `npx prisma generate`
cp .env.example .env          # set AUTH_SECRET: openssl rand -base64 32 (Windows: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up -d          # postgres :5432, mailpit :8025 (inbox UI), minio :9001
npx prisma migrate deploy     # applies prisma/migrations (includes CHECK constraints)
npm run db:seed               # demo workspace + the "New Product Launch" demo project
npm run dev                   # http://localhost:3000
```

Sign in with any email; the magic link lands in Mailpit at http://localhost:8025.
Seeded: `demo@meetowl.local` (owner of workspace `demo-studio`), `member@meetowl.local`.
Google sign-in appears when `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set.
Attachments need MinIO (or R2) and the `S3_*` variables from `.env.example`; without them the upload endpoints answer `503 storage_unconfigured`.

## Run locally (without Docker)

An embedded Postgres (PGlite) stands in for the database. It is single-connection, so use it only for quick local checks.

```bash
npm run db:pglite             # terminal 1: PGlite on :5433, applies migrations, data in ./.pglite
# .env.local:  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true"
npx tsx prisma/seed.ts        # stop `npm run dev` first: only one connection is allowed at a time
npx tsx scripts/dev-session.ts   # prints a session token; set cookie `authjs.session-token` to skip the magic link
npm run dev
```

## Scripts

| Command | What |
|---|---|
| `npm run typecheck` / `npm run lint` | strict TS, ESLint (`no-explicit-any` is an error) |
| `npm test` | Vitest: unit tests + integration tests on real SQL (PGlite, no Docker needed) |
| `npm run test:e2e` | Playwright (needs the Docker stack above running) |
| `npm run db:migrate` | create a new dev migration after schema edits |

## Using the map

| Action | How |
|---|---|
| Open node details | click a node (URL becomes `?node=<id>`, shareable) |
| Add child / sibling | `Tab` / `Enter`, the hover **+** button, or the drawer buttons |
| Rename | double-click, or `F2` |
| Delete (archive, undoable) | `Delete` |
| Move | drag a node onto a new parent, or up/down among siblings; invalid drops show a red hint |
| Undo / redo (50 steps) | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Search | `Ctrl+K` |
| Navigate | arrow keys select parent / child / sibling |
| Heatmap, Focus branch, Filters | toolbar |

## Layout

`prisma/` schema, migrations, seed · `src/modules/nodes/` framework-free rules (nesting, progress, health, layout, filters, templates) shared by server and browser · `src/server/` auth, policies, services, http wrapper, mail, storage · `src/features/mindmap` and `src/features/drawer` the UI · `src/app/` pages and `api/v1` routes · `messages/` en/ru/pl.

## API

Phase 1: `GET /api/health` · `GET|PATCH /api/v1/me` · workspaces, members, invitations, usage (see `CHANGELOG.md`).

Phase 2 (all under `/api/v1`, checked per request):

| | |
|---|---|
| `GET\|POST /workspaces/:id/projects` | list; create (templates: `empty`, `agile-sprint-map`, `product-roadmap`, `agency-client-project`) |
| `GET /projects/:id/tree` | whole project, flat, with progress/health recomputed for today |
| `GET /nodes/:id` | drawer payload (tags, links, attachments, breadcrumb, burndown) |
| `POST /nodes` · `PATCH /nodes/:id` · `DELETE /nodes/:id` | create · edit changed fields · archive subtree |
| `POST /nodes/:id/move` · `/restore` · `/complete` | reorder/reparent · undo archive · finish subtree |
| `POST\|DELETE /nodes/:id/health-override` | manual health, comment required |
| `POST /nodes/batch` | atomic list of ops (used by undo/redo) |
| `POST /nodes/:id/links` · `DELETE /links/:id` | `BLOCKS`, `RELATES`, `ATTACHED` |
| `GET\|POST /nodes/:id/comments` · `PATCH\|DELETE /comments/:id` | threads, @mentions notify members |
| `POST /nodes/:id/attachments/presign` · `POST /nodes/:id/attachments` · `GET\|DELETE /attachments/:id` | presigned upload, confirm, download redirect, delete |
| `GET\|POST /workspaces/:id/tags` · `PATCH\|DELETE /tags/:id` · `PUT /nodes/:id/tags` | tags |
| `GET\|POST /workspaces/:id/saved-filters` · `DELETE /saved-filters/:id` | saved filters |
| `GET /workspaces/:id/search?q=&projectId=` · `GET /nodes/:id/activity` | search, history |

Errors: `{ "error": { "code", "message" } }`; plan limits return `402 plan_limit`; invalid nesting/moves return `422` with a `reason`.

## CRM (Phase 3)

Sidebar → **CRM** (needs the `crmAccess` flag, or an owner/admin role): **Pipeline** (board or map view), **Companies**, **Contacts**, **Activities**. **My day** is the workspace home page. Settings → **CRM** (pipelines, stages, lost reasons, project templates) and **Lead capture** (forms, webhook) are for owners and admins.

- **Deal → project:** mark a deal won (or drag it to *Won*) and a dialog offers a project from a template; name and dates come from the deal. The project is linked to the deal and shows up, dashed, in the company's **Client Map**; a red project flags the client.
- **Lead capture:** create a form in Settings → Lead capture and paste the iframe or HTML snippet on your site, or POST to the webhook (`Authorization: Bearer <token>`, `Idempotency-Key` for safe retries). Public endpoints: `/f/<key>`, `POST /api/public/leads/<key>`, `POST /api/public/hooks/leads`.
- **CSV and Excel:** *Import Excel / CSV* on the Companies / Contacts pages (.xlsx first sheet or CSV; preview, column mapping, other columns into the note, duplicate policy, atomic commit); *Export CSV* respects the active filters.
- **Privacy:** consent history per contact, personal-data export (JSON) and permanent erase (owner/admin, typed confirmation).
- The seed adds a small demo CRM; the lead form key is in Settings → Lead capture.

New API routes (all under `/api/v1` unless noted): `workspaces/:id/{pipelines,lost-reasons,deals,companies,contacts,activities,my-day,lead-forms,lead-webhook,lead-ingests,project-templates}`, `imports/preview|commit`, `contacts|companies/{duplicates,merge,export}`, `pipelines/:id/{stages,board}`, `deals/:id/{move,win,lose,reopen,create-project}`, `companies/:id/map`, `contacts/:id/{consent,gdpr-export,gdpr-erase}`, `projects/:id/save-as-template`; `/api/public/{forms,leads,hooks/leads}`.

`node scripts/i18n-merge.mjs <fragment>` merges translation fragments and fails if en/ru/pl drift apart.

## Realtime, views, reports, time, integrations (Phase 4)

- **Views:** a project opens as **Map**, **Board**, **List**, **Calendar** or **Timeline** (`?view=`; the open node stays in `?node=`). List: sort, filter, inline edit, bulk edit. Board and Calendar: drag a card, or use the select on the card. Timeline: drag a bar to move both dates; red arrows mark a blocker that ends after the blocked task starts. **Calendar** in the sidebar merges deadlines, events, CRM follow-ups and the dates of deals.
- **Time:** *Start timer* or log time on a task (`90`, `1:30`, `1h 30m`); the running timer shows in the top bar; **Time** is your week; the company page has **Time & billing** (hours, amounts for owners and admins, CSV, print). Hourly rates: Settings → Members; a project can override with `data.hourlyRate`.
- **Reports** (Pro): Agile — velocity, burndown, cumulative flow, cycle time, throughput; CRM — funnel, weighted forecast per currency, won/lost reasons, sources, manager activity, CSV per section.
- **Realtime:** other people's changes appear without a reload; avatars, selection/editing markers and pointers show who is where; comments and notifications arrive live. Server-Sent Events, one stream per tab (`/api/realtime/stream`). Events are hints: the browser re-reads through the normal API.
- **Notifications** reach in-app, e-mail, Slack and Telegram per event (Settings → Notifications). Delivery runs through an outbox and a job runner: `JOBS_MODE=inline` (default) runs jobs in-process; with Inngest keys the same functions run as Inngest jobs (`/api/inngest`).
- **Integrations** (Pro; Settings → Integrations). Add the provider keys from `.env.example`, then:
  - **Google Calendar:** create an OAuth client (Web application), redirect URI `<APP_URL>/api/integrations/google/callback`, scope `calendar.events`. Events created here are pushed to the creator's calendar (attendees invited, optional Meet link); edits and deletions in Google come back. Push notifications need an `https` `APP_URL`; otherwise changes are polled every 10 minutes.
  - **Slack:** create an app with the scopes `chat:write, chat:write.public, channels:read, users:read, users:read.email`, redirect URL `<APP_URL>/api/integrations/slack/callback`, event URL `<APP_URL>/api/integrations/slack/events` (subscribe to `app_uninstalled` and `tokens_revoked`). Choose a channel per event in the settings.
  - **Telegram:** create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and a random `TELEGRAM_WEBHOOK_SECRET`, then register the webhook once: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url=<APP_URL>/api/integrations/telegram/webhook -d secret_token=<TELEGRAM_WEBHOOK_SECRET>`. People link their chat in the settings; commands: `/today /task /done /lead /help`.
  - Secrets are stored encrypted with `SECRETS_KEY` (`openssl rand -base64 32`).

New API (under `/api/v1`): `nodes/:id/time`, `time/:id`, `timer[/start|/stop]`, `workspaces/:id/{timesheet,calendar,reports/crm,integrations[/…]}`, `companies/:id/time-report`, `projects/:id/{metrics,links}`; outside `/v1`: `/api/realtime/{stream,presence}`, `/api/inngest`, `/api/integrations/{google,slack,telegram}/…`.

## Billing, public API, client portal, AI (Phase 5)

- **Billing** (Settings → Billing, owner only): Free and Pro (Enterprise is a manual contract). Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` and `STRIPE_WEBHOOK_SECRET`, and point a Stripe webhook at `<APP_URL>/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed` and `invoice.paid`. The plan changes **only** when the webhook arrives, never from the page you return to after paying. A failed payment keeps Pro for 7 days, then the workspace drops to Free; nothing is deleted, limits apply to new items again.
- **Public API** (Pro; Settings → Developers): personal tokens (`mo_…`, read or read/write, optional expiry) that act as their owner inside one workspace. Base URL `/api/public/v1`, OpenAPI at `/api/public/v1/openapi.json`. Cursor pagination (`limit`, `cursor`), `updatedSince` on `GET /nodes`, `Idempotency-Key` on POST, 600 requests per minute per token. Outgoing webhooks (`project.changed`, `deal.won`, `lead.created`) are signed (`MeetOwl-Signature: t=…,v1=HMAC-SHA256("t.body")`), retried for about 15 hours, https only, and never sent to private addresses.
- **Create tasks** (My tasks): type a list, subtasks by indent or dash, pick the project and epic; each task shows its branch of subtasks with a counter. Also one call for the API and for Claude (`create_tasks`).
- **My day** is clickable: the three cards show their own lists, each list opens its section (to-do list, calendar on that day, contacts, pipeline), and the bottom shows plan against fact with efficiency and productivity. **My tasks** is the to-do list across projects.
- **People (CRM):** a funnel board of everyone you talk to (New lead to Partner), "List of 100" quick add by names, funnel fields in the contact card and import of your own sheet columns. Stage changes are kept as history.
- **Groups (CRM → People):** split the list into groups and subgroups (three levels), move people in bulk, filter the board by a group with its subgroups; deleting a group never deletes people.
- **Team (CRM):** partners as a sponsor tree with the size of each line; hand people over to a partner in bulk or from the card (with an account they become the partner's own, without one you copy a handoff card), with the full history of hand-overs.
- **Network map (CRM):** everyone on one MindMap with you in the middle, arranged by sponsors, by groups or by who works with whom; colour is the funnel stage, a press opens the card.
- **Plan of the day (CRM):** the week against its targets (counted from what happened), everyone whose next step is due with one-press Done and next date, scripts to copy with the name filled in, auto-plans that fill the next step when a person moves into a stage, and the team's week.
- **Working timer:** a Start button on every page, with or without a task; it runs until you stop it; time by day, week, month and all time, counted by your own clock.
- **Start (onboarding):** steps from the first login to a working day that tick themselves from your data, and a dream with targets whose distance is measured from your funnel; a reminder on My day.
- **Knowledge base:** 15 articles (ru/en) on how things work and the daily and weekly rhythm, with search; Start links to the article for each step.
- **Access levels:** a member sees no CRM, their own people, their team's (by the sponsor tree) or everything; set when inviting and in Settings → Members. Those who see only people have no deals, companies or reports.
- **Teams:** Settings → Teams: a named group with a leader that can give its members shared people or everything in the CRM, on top of their personal level.
- **Sharing:** in a person's card (and a group's edit window) give a member or a team view or edit access to just that person or group, and take it away; every change is in the history.
- **Smart sort:** a button on the Timeline lays the open tasks one after another by their estimates (story points or hours), a queue per person, with a preview and one-step undo.
- **Notes and links:** a private notebook per person (notes that save as you type, links with a button to open them, search, pins).
- **Schedule a call or meeting:** *Schedule contact* in the contact card (type, day, start, length); it shows in the calendar at once, in My day and in the card's *Planned* list.
- **Time zones:** each person picks their own in Settings → Account; the calendar and the new-meeting form use it, everything stored stays UTC.
- **Claude connection (MCP)** (Pro; Settings → Developers → Connect Claude): an MCP server at `/api/mcp` with 29 tools over projects, calendar, My day and the CRM, signed in with OAuth 2.1 + PKCE so Claude's *Add custom connector* needs only the address. Read-only or read-and-write is chosen on the consent page; every call goes through the public API's dispatcher. Setup in [docs/CLAUDE-CONNECTOR.md](docs/CLAUDE-CONNECTOR.md).
- **Client portal** (Pro): invite a person as **Client** to a project and tick *Share with clients* on the nodes they may see. Clients land in `/portal/<workspace>`: progress, shared work, comments and files marked for them, their own comments and uploads, and approvals you request (*Ask for approval* in the drawer). Clients cannot use the workspace app or its API at all. Owners and admins can open the portal as a preview.
- **AI** (Pro): set `ANTHROPIC_API_KEY` (model `AI_MODEL`, default `claude-sonnet-5-5`). In a project: **AI** button (team summary, client update from shared nodes only, questions); in the drawer: suggest subtasks (you pick which to add); in a deal: draft a reply. Everything is a draft; nothing is posted or sent. 1,000,000 tokens per workspace per month on Pro, owners are warned at 80% and 100%. Without a key, development answers with canned text; production refuses.

New API routes: `workspaces/:id/{billing[/checkout|/portal],api-tokens,webhooks,ai}`, `api-tokens/:id`, `webhooks/:id[/test]`, `portal/{projects,nodes,attachments,approvals}/…`, `nodes/:id/approvals`, `attachments/:id` (PATCH sharing), `ai/{summary,ask,breakdown[/apply],lead-reply}`; `/api/billing/webhook`, `/api/public/v1/…`.

## Your account, your data (GDPR)

**Account** (Settings → Account, or the link in the client portal) works for everyone who signs in, clients included.

- **Download my data:** a JSON file with your profile, memberships, what you created and wrote (tasks, comments, time entries, CRM activities), reminders, notifications, settings, integrations (without secrets), API token names, AI usage counts and your activity log. Other people's content and secrets are not in it. Both this and deletion need a 6-digit code sent to your e-mail (valid 10 minutes, five tries), so a stolen browser session is not enough.
- **Delete my account:** scheduled for `ACCOUNT_DELETION_GRACE_DAYS` (default 7; 0 = at once), cancellable until then from the banner or the account page; an hourly job (`account~erase`) carries it out.
  - *Erased:* sign-in, sessions, Google link, API tokens, integrations (Google access is revoked at Google), notifications, preferences, reminders, memberships, project access, invitations to your address, and every workspace where nobody else on the team remains, with its files; its Stripe subscription is cancelled first (if Stripe cannot be reached the deletion waits and retries).
  - *Kept, anonymised:* tasks, comments, files and time entries you made in other people's workspaces. The account row stays as "Deleted user" with an unreachable address, so your e-mail can be registered again. Tick *also remove my comments and files* to replace your comment text with "[removed]" and delete your uploads.
  - *Blocked while:* you are the only owner of a workspace that still has team members. **Make owner** (Settings → Members) hands it over.
  - A record that the deletion happened (no personal data) is kept.
- Not covered: text of your name inside other people's comments (for example "@Name" mentions) and old notifications sent to others that mention you (those carrying your id are removed). Customer data you entered as CRM contacts belongs to the workspace and is erased with its own tools (Settings → CRM).

## Before you go live

Read `docs/PRODUCTION.md` (launch checklist: environment, jobs, third-party services, verification, scaling, privacy) and `docs/AUDIT.md` (what the final security audit found, fixed and left open). Two things bite everyone: set `AUTH_URL` to the public address, and run the scheduled jobs (Inngest or `CRON_SECRET` + a cron).

## Known limitations

- **Not run here:** the Playwright specs (`e2e/`) and anything needing Docker (`docker compose`, real Postgres, MinIO uploads). The SQL migrations and all service logic *were* run against PGlite in tests and in a dev server.
- **Browser-verified by hand:** open project, colours, drawer, deep link, `Tab` add, inline rename, undo, heatmap, filters (hide mode), `Ctrl+K`, invalid-drop hint. **Not verified in a browser:** a *successful* drag & drop move (the automation could not deliver the final mouse move), comment composer / @autocomplete, tag creation, document editor, file upload. Their server side is covered by integration tests.
- Performance targets (500 nodes < 1.5 s, 60 fps at 2000 nodes) are **not measured yet**; layout of 2000 nodes takes < 200 ms in a unit test, rendering is untested at that size. The tree loads whole per project (progress needs it); "lazy" means collapsed branches are not rendered.
- PDF preview for documents is not built. Pricing is one Pro price per workspace (no seats, no yearly plan).
- Rate limiter is in-memory (single instance); the PGlite dev database is single-connection.

### Phase 3 specifics

- **Browser-verified by hand:** pipeline board (totals, health, next-step warning), deal drawer, *Mark won* → project dialog → project created and linked, contacts list, CSV import preview (delimiter and encoding detection), My day, Client Map with heatmap and risk banner, public form submission creating a deal, lead-capture and CRM settings pages.
- **Not verified in a browser:** dragging cards between board columns (same automation limit as the project map), committing a CSV import, duplicate merge dialog, GDPR erase dialog, pipeline map view, stage editor saving, form editor. Their services and routes are covered by the 209 tests; `e2e/crm.spec.ts` is written but has not been run.
- Rate limits are per process; the hosted form cannot be embed-restricted per site (only posting is); no CAPTCHA.
- Not built: e-mail reminders and any background job (Phase 4), CRM reports (Phase 4), Gmail/Telegram links, client portal (Phase 5), time-tracking UI (hours on the company page read existing entries).
- Rate/limit notes: Free plan = 1 pipeline, 500 contacts, 3 projects, enforced on create, import and lead intake.

### Phase 4 specifics

- **Verified with real services:** nothing external. Google, Slack and Telegram are tested against a fake HTTP layer that follows their documented request and response shapes (OAuth, token refresh, sync tokens, 410/409/429 handling, signatures, webhooks). **Not verified against the real providers:** all three, Inngest Cloud, and Google push notifications (they need a public HTTPS URL). Expect small mismatches on first contact with the live APIs.
- **Browser-verified by hand:** list, board (status change), timeline (drag moves both dates), workspace calendar, drawer time entry and timer chip, timesheet, company *Time & billing*, both report tabs and the Pro paywall, the integrations page (unconfigured state), and a second person editing a node, commenting and moving a pointer while the first watched (live title, comment, bell, avatar, pointer). **Not verified in a browser:** drag & drop on the board and calendar (automation limit; the select on the card does the same), the connected states of the integration cards, CSV downloads, print.
- **Realtime runs on one server instance.** The in-memory bus and presence do not cross instances; several instances need a shared pub/sub (Redis, or Postgres `LISTEN/NOTIFY`). Liveblocks is not implemented (`REALTIME_PROVIDER` accepts only `sse`). Pointers exist on the map only; the CRM board has live updates but no presence.
- Remote edits are merged by re-reading the project; the node you are typing in is kept as you have it, and refreshes wait while your own writes are in flight. Two people changing the same field still resolve as last write wins.
- Metrics need history: events recorded before migration 0004 are reconstructed (creation as "To do"; deals get one entry into their current stage), so old burndowns and funnels are approximate.
- Slack announcements are best effort (one retry on rate limiting, then logged). Google Calendar imports no events that were not created here.
- Playwright specs are still not run (`e2e/`).

### Phase 5 specifics

- **Not verified against the real services:** Stripe (Checkout, Customer Portal, webhooks), Anthropic, and file uploads from the portal (they need S3/MinIO). Everything is tested against fakes that follow the documented shapes; do a pass in Stripe test mode with the Stripe CLI before going live.
- **Browser-verified by hand:** the client portal end to end (client login lands in the portal, shared work only, comment, request changes, internal API calls answer 403, hidden node answers 404), the staff side of sharing in the drawer, the AI assistant (with canned answers), and the billing and developers pages. **Not verified in a browser:** Stripe redirects, the connected API-token flow (create/copy/revoke) and webhook form, portal file upload, subtask suggestions.
- The webhook event for project changes is called `project.changed` (it carries the project id, not a node id).
- Webhook address checks resolve DNS before sending; a hostile DNS server could still answer differently between the check and the send (no connection pinning).
- The API rate limiter and the AI rate limiter are in memory (single instance), like the others.
- Clients see no live updates (they refresh every 30 seconds), have no notification bell (they get e-mail), and the portal has no custom branding or domains.
- Portal comments are plain text; staff comments shown to clients keep their text but lose formatting and mentions.
- AI quality is not measured here: tests cover the prompts, parsing, permissions and quotas, not what the model writes.
