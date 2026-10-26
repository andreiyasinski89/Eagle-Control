# Changelog

## 0.1.0 — Phase 1: foundation

- Next.js 15 (App Router), TypeScript strict (`noUncheckedIndexedAccess`), ESLint with `no-explicit-any`.
- Docker Compose: Postgres 16, Mailpit, MinIO. `.env.example` only; secrets stay out of git.
- Prisma schema for all entities (platform, Node tree, CRM, pipelines, reminders, templates, integrations, AI usage, subscription) + initial migration with CHECK constraints.
- Auth.js: email magic link and optional Google, database sessions.
- Workspaces (create/rename/delete, default pipeline and lost reasons), memberships with roles and `crmAccess`, invitations (hashed tokens, 7-day expiry, plan-limit aware).
- API under `/api/v1` with a shared handler: auth, Zod validation, uniform errors, rate limiting.
- Plan limits and feature flags (`modules/plans`), authorization policies (`server/policies`).
- UI: sign-in, onboarding, invite acceptance, workspace shell (sidebar, topbar, workspace switcher), empty dashboard, members settings, light/dark theme, en/ru/pl.
- Seed: demo owner/member, `demo-studio` workspace, built-in project templates.
- Tests: 36 Vitest unit tests (policies, plans, helpers, membership/invitation services with mocked DB); Playwright signup→workspace→invite flow.

## 0.2.0 — Phase 2: mind map core

- Migration 0002: `Node.rootId`.
- Pure shared rules with table-driven tests: nesting (`node-rules`), estimation-weighted progress (`progress`), `computeHealth` / `computeTreeHealth` (`health`), tidy-tree layout, fractional positions, filters, burndown, templates.
- Node API (create, patch, move, archive/restore, complete, batch, links, health override, activity, search), comments with mentions and notifications, tags, saved filters, presigned attachments. Authorization per request, guests/clients limited to their projects.
- UI: projects list and *New project* dialog (4 templates), React Flow map with level-of-detail rendering, heatmap, focus mode, filters (dim / hide, saved), `Ctrl+K` search, keyboard editing, drag & drop with validity hints, undo/redo (50), drawer for tasks, documents (Tiptap), events, sprints/epics (status summary, burndown), shareable `?node=` URLs.
- Demo project "New Product Launch" in the seed, with a test pinning its colours and progress.
- Docker-free dev database (`npm run db:pglite`), dev session helper.
- Tests: 128 (unit, plus 18 integration tests on real SQL).

## 0.3.0 — Phase 3: CRM

- Migration 0003: denormalised `workspaceId` on Company/Contact/Deal, `Contact.phonesNorm`, `Company.domain`, `Deal.stageEnteredAt`, `LeadIngest`.
- Pure CRM modules with tests: stage transitions and validation, per-currency totals, deal health (stagnation), duplicate detection and merge plans, CSV decoding/parsing/mapping/classification, lead payload parsing, dated project templates.
- Services and 42 new API routes: pipelines and stages, lost reasons, deals (move, win, lose, reopen, create project), companies, contacts (consent, GDPR export/erase), duplicates and merge, activities, My Day, CSV import/export, lead forms, inbound webhook, project templates ("save project as template"), Client Map.
- Public endpoints: hosted form `/f/[key]`, `POST /api/public/leads/:key`, `POST /api/public/hooks/leads` (CORS allow-list, honeypot, idempotency, rate limits).
- UI: pipeline board with drag & drop, optimistic moves, win/lose dialogs and "create project"; deal / contact drawers; companies and contacts tables with search, sort, bulk actions, import wizard, duplicate merge; company page with Client Map; pipeline as a map; Activities; My Day (replaces the empty dashboard); CRM and lead-capture settings; en/ru/pl.
- Seed: demo CRM (companies, contacts, deals in every state, a lead form) linked to the demo project.
- Tests: 209 (unit + real-SQL integration, including the lead → won → project → Client Map scenario and the public routes).

## 0.4.0 — Phase 4: realtime, views, reports, time, integrations

- Migration 0004: status and deal-stage history (backfilled), running timers, user integrations, calendar links, notification preferences and outbox columns.
- Notifications: outbox with channels (in-app, e-mail, Slack, Telegram), per-event preferences, bell with live updates; job runner (`inline` or Inngest) with health refresh, reminders, delivery and calendar poll.
- Views: Board, List (sort, filter, inline and bulk edit), Calendar, Timeline (drag, dependency arrows); workspace calendar merging tasks, events, CRM activities and deal dates.
- Time tracking: timer, manual entries, task totals, weekly timesheet, per-client report with rates (owners and admins), CSV and print.
- Reports (Pro): velocity, burndown, cumulative flow, cycle time, throughput; funnel, weighted forecast, win/loss, sources, manager activity; CSV.
- Realtime: SSE stream, presence (avatars, selection and editing markers, pointers), live comments, board and notifications; merge of remote changes that protects local edits.
- Integrations (Pro): Google Calendar two-way sync with Meet links, Slack announcements and DMs, Telegram bot with commands; secrets encrypted at rest; settings page.
- Tests: 339 (unit and real-SQL integration; providers against a fake HTTP layer). Not run against the real providers or in Playwright.

## 0.5.0 — Phase 5: billing, public API, client portal, AI

- Migrations 0005–0007: subscription details and Stripe event log; API tokens, idempotency keys, webhook endpoints and deliveries; approvals, client visibility on comments and files.
- Billing: Stripe Checkout and Customer Portal, signed idempotent webhook, grace period and daily enforcement, billing page with usage.
- Public API v1: personal tokens, 26 endpoints (projects, nodes, comments, time, contacts, companies, deals, activities), OpenAPI document, cursor pagination, idempotency, rate limits, signed outgoing webhooks, Developers settings page.
- Client portal: separate shell for clients, shared work only, comments, files, approvals with notifications; clients are locked out of the workspace app and API; staff controls in the drawer.
- AI: team summary, client update, project Q&A, subtask suggestions, deal reply drafts; Claude via the Messages API, canned provider for development; monthly allowance with warnings.
- Tests: 406 (unit and real-SQL integration; Stripe and Claude against fakes). Not run against the real services or in Playwright.

## 0.5.1 — Final audit

- Security: trusted client address for rate limits, rate-limited sign-in, request body caps, signed upload length, HSTS/CSP/Permissions-Policy, membership check on calendar sync.
- Operations: `AUTH_URL` documented (self-hosted sign-in failed without it), `/api/jobs/<name>` with `CRON_SECRET`, `docs/PRODUCTION.md` launch checklist, `docs/AUDIT.md` findings.
- Tests: HTTP wrapper and route inventory, tenant isolation across about 80 service calls, storage signing, jobs route (430 in total).

## 0.6.0 — Account export and deletion (GDPR)

- Migration 0008: deletion state on users, one-time confirmation codes, account event log.
- Download my data (JSON) and delete my account, both behind an e-mailed code; cancellable grace period; hourly erasure job; Google access revoked and Stripe subscription cancelled where applicable; anonymisation of authorship; optional removal of own comments and uploads.
- Ownership handover (**Make owner**) so a sole owner can leave; Account page for everyone including clients; pending-deletion banner.
- Tests: 452 in total (new: erasure planning, 14 integration tests for codes, export, handover, scheduling and erasure with fakes for Stripe, Google and storage).

## 0.6.1 — Public demo and one-click hosting

- `DEMO_MODE`: "Open the demo" button, shared sample workspace built on first visit, daily reset job.
- `vercel.json` (cron), `vercel-build` (applies migrations), `postinstall` generates the Prisma client; `docs/DEPLOY.md` step by step.
- The seed moved into a service so the app and `npm run db:seed` share it.
