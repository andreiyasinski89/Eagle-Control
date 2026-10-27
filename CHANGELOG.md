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

## 0.6.2 — Hourly calendar

- Calendar: new **Day** view and a rebuilt **Week** view with an hour-by-hour time grid (like Google Calendar): events at their start time and as tall as they last, overlapping events side by side, an "All day" strip for deadlines and items without a time, a red line for the current time, and the grid opens on the working hours.
- Month view and drag-to-reschedule (project calendar) are unchanged. Pure layout logic in `src/modules/views/timegrid.ts` with 12 tests.

## 0.7.0 — Go live: e-mail sign-up, Pro for the administrator

- Migration 0009: sign-in attempt log (hashes only) and the date terms were agreed.
- Sign-in link opens a confirmation page; only its button (a POST) uses the one-time link, so mail scanners cannot burn it. Links to localhost are refused in production.
- Agreeing to the terms is required before a link is sent (checked on the server); draft privacy policy and terms pages with the operator from `LEGAL_*`.
- Daily sign-in limits kept in the database: 20 per address of the caller, 10 per mailbox, `MAIL_DAILY_LIMIT` in total.
- `PRO_OWNER_EMAILS`: workspaces owned by those addresses are Pro without Stripe (on sign-in, workspace creation, ownership handover and daily); the billing page says so.
- SMTP with login and TLS (Gmail app password), with timeouts.
- `docs/GO-LIVE.md`. Tests: 496; the test runner is capped at 6 workers because many in-memory databases at once crashed workers.

## 0.7.1 — Integrations made connectable

- Telegram: **Connect the bot** button registers the webhook (no `setWebhook` by hand) and the card shows whether Telegram delivers to this installation, with its last delivery error.
- Lead forms: allowed origins are compared as origins (a pasted trailing slash or path no longer blocks the site).
- `docs/integrations/gmail-leads.gs`: Google Apps Script that turns lead e-mails from the website form into CRM leads (English, Russian, Polish field labels, one send per e-mail, dry run).
- `docs/INTEGRATIONS.md` (Russian): Inngest, Google Calendar (Google Cloud setup, publishing to avoid the 7-day token expiry), Telegram, website leads.

## 0.8.0 — New look: Violet Dusk, app shell, command palette

- Theme: the **Violet Dusk** palette from 21st.dev (light and dark) mapped onto the app's tokens, softer corners, the Inter typeface (covers English, Polish and Russian), a focus ring that components can still override.
- App shell: sidebar with a workspace switcher, grouped navigation and an account menu (Account, Sign out); a top bar with search, timer, notifications, language and theme; a drawer menu on phones.
- **Command palette** (Ctrl+K / ⌘K or the search box): pages, projects, other workspaces, switch theme, account.
- Sign-in: two-column layout with the product pitch. My day: greeting, three summary tiles, loading skeletons and a friendlier empty state.
- Tests: 3 for the shell helpers.

## 0.8.1 — Mind map cards

- A **status pill** (Backlog, To do, In progress, In review, Done, Cancelled) on task and subtask cards.
- Three levels of detail: dots only when far away, a **light card with title and status** in between (it used to be dots below 50% zoom), the full card up close.
- The first view of a map opens at a **readable zoom** with the root at the left, instead of a zoomed-out overview of dots; the fit button still shows the whole tree.
- Softer cards, themed mini map and controls.
- Tests: 6 for the first view and the status tones.

## 0.8.2 — Loading states and phone layout

- Loading skeletons instead of a bare ellipsis in 15 places (deal board, deal/contact/company pages, client map, reports, time, billing, integrations, account, portal, calendar); a test keeps new bare loaders out.
- Phone: the view switcher and the map toolbar fit (icons only, labels from tablet width), the mini map is hidden, member rows stack inside their card, settings tabs scroll with a fade at the edge.

## 0.9.0 — Meetings from the calendar, Excel import

- Calendar: **New meeting** button and a click on an empty day (month) or hour (week and day, half-hour steps) open a form: title, day, from/to or all day, project, place, video-call link or a Google Meet request, agenda. The creator is the attendee so the meeting shows under "only mine"; with no project yet the form offers to create "Meetings". Times stay UTC.
- CRM import takes **.xlsx** as well as CSV: the first sheet is read, blank rows above the table and one-cell titles are skipped, blank rows and columns are dropped, repeated headers are numbered. The workbook is turned into CSV text on the server, so preview, column mapping, duplicate policy and the atomic commit are the same as for CSV (reader: `read-excel-file`).
- Columns without a field of their own can be kept in the contact's note as "Column: value" (ticked by default, so nothing is lost silently).
- Contacts without e-mail or phone (a list of names) are matched by full name, so importing the same list twice does not double it.
- Tests: new meeting form and Excel parsing (`new-event.test.ts`), Excel upload end to end on PGlite with a synthetic fixture (`import-xlsx.test.ts`).
## 0.10.0 — Claude connection (MCP)

- **MCP server** at `/api/mcp` (Streamable HTTP, stateless JSON-RPC): 28 tools for projects and nodes, search, comments, time, calendar, My day, contacts, companies, deals and CRM activities. Every tool runs through the public API's dispatcher, so it has the same token, plan, scope, workspace boundary, rate limit and audit as REST. A read-only connection is offered only the reading tools.
- **OAuth 2.1** so Claude's "Add custom connector" works with just the address: discovery documents (`/.well-known/oauth-protected-resource`, `…/oauth-authorization-server`), dynamic client registration, consent page (`/oauth/authorize`: pick the workspace and read or read-and-write), token endpoint with PKCE S256, one-hour access tokens, rotating refresh tokens with replay detection. New tables: `OAuthClient`, `OAuthGrant`, `OAuthCode`, `OAuthRefresh` (migration `0010_oauth_mcp`), `ApiToken.grantId`.
- Settings → Developers: *Connect Claude* (address to copy, Claude Code command) and the list of connected applications with *Disconnect*. OAuth tokens stay out of the personal token list.
- Public API: new `GET /calendar`, `/my-day` and `/search`.
- Daily job `api/purge` also removes spent codes, used or expired refresh tokens, expired OAuth access tokens and applications nobody approved.
- Tests: `mcp-oauth.test.ts` (26: registration, PKCE, code and refresh rules, consent form checks, protocol, scope, workspace boundary, revoke, purge) and the route inventory.
## 0.11.0 — Your own time zone in the calendar

- **Settings → Account → Time zone**: every person picks their own zone (all zones the browser knows, grouped by region, with the current offset; a button takes the device's zone). It is saved on the profile (`User.timezone`, validated on `PATCH /api/v1/me`).
- The workspace calendar draws events and CRM activities on the day and hour of that zone, the red now-line and the opening scroll follow it, and *today* is today there. Deadlines, milestones and deal dates stay on their own date, and an "all day" event stays all day. The header shows the zone and links to the setting.
- The new-meeting form takes hours in that zone and stores the right UTC instant (daylight saving included); an all-day meeting is a date and ignores the zone. The project calendar highlights today in the zone too.
- Someone who never picked a zone while their device is not on UTC gets a one-time notice offering to use the device's zone.
- Nothing stored changes: events stay UTC, so colleagues in different zones see the same meeting at their own hour, and the MCP tools and the public API still speak UTC.
- Tests: `timezone.test.ts` (offsets, daylight saving, half-hour zones, midnight crossings, item placement, the form) and `profile-timezone.test.ts` (saving and refusing zones).
## 0.11.1 — Big imports no longer stall

- **Fix:** importing a few hundred contacts (an Excel file of ~320 people) seemed to do nothing on the hosted version. Creating each person took about four database calls inside one transaction, so ~1300 round trips to a remote database; the host stopped the request, and the answer (an empty timeout page) was shown as nothing at all.
- The import now writes new people and companies in batches (nodes, contacts, notes, audit entries; companies are looked up once and the missing ones created together): about 25 calls for 325 contacts with 120 companies instead of ~1300. Updates of existing records still go one by one.
- The import routes ask for the longest function time the plan allows (60 s).
- The wizard shows *Importing…* while it works, and a timeout or any empty server answer is now reported ("Nothing was imported. Try again…") instead of being silent.
- Tests: `import-bulk.test.ts` pins the number of database calls for 325 contacts, 120 companies and 250 company rows, and checks that everything the one-by-one path wrote is still written.
## 0.12.0 — Schedule a call or a meeting from the contact card

- **Contact card → Schedule contact:** pick *Call* or *Meeting*, a title (filled in for you), the day, the start and the length (15 min to 2 h), optional notes. Hours are the person's own time zone (Settings → Account).
- It is saved as an open CRM activity with a date and a length (`CrmActivity.durationMin`, migration `0011_activity_duration`), so it appears **at once** in the workspace calendar as a block from start to end, in *My day*, and on the contact.
- The card has a **Planned** section: the contact's open calls and meetings, soonest first, each linking to its day in the calendar (`/calendar?day=YYYY-MM-DD`), with *Mark done* (counts as a touch) and *Remove*.
- The generic *Log call / e-mail / note* dialog now reads its date and time in the same zone.
- The public API and the MCP tools accept `durationMin` on activities; the calendar feed returns `endAt` for them.
- Tests: `schedule.test.ts` (form, defaults, zones, calendar placement) and `contact-schedule.test.ts` (open, shown with length, mine/others, move, done, remove, permissions).
## 0.13.0 — A My day you can click through, with plan and fact

- **The three cards are buttons.** *Tasks to do*, *Meetings* and *Need attention* show exactly their own lists when pressed (press again, or *Show everything*, to go back). Every list has a link into its section: tasks to the new to-do list, meetings and calls to the calendar on that day, deals to the pipeline, cold contacts to the contacts. Each row opens its own thing: a task in its project, a meeting at its day in the calendar, a call or follow-up at its contact (or deal, or company), a deal in the board.
- **My tasks** (`/w/<slug>/tasks`, in the sidebar under *My day*): every task assigned to you in every project, in tabs *Overdue / Today / Next 7 days / Later or no date / Done*, with a tick to finish or reopen a task. `GET /api/v1/workspaces/:id/my-tasks`.
- **Plan and fact for today**, at the bottom: planned against done for tasks, meetings and calls, and CRM follow-ups, each with a bar and a link; two rings, **Efficiency** (done of planned) and **Productivity** (everything finished today, planned or from the backlog, of everything that wanted attention: the plan plus the backlog, open or cleared); and the time tracked today.
- "Today" on My day is now the day in the person's own time zone (deadlines by their date, meetings and calls by the real span of the day); meeting times and the greeting follow it too.
- Tests: `day-score.test.ts` (the percentages) and `my-day-plan.test.ts` (plan, fact, backlog, Auckland day, drill-down lists, guests, the to-do groups).
## 0.14.0 — Create tasks with subtasks, and the owl icon

- **My tasks → Create tasks:** type a list, one task per line; an indented line (or a line starting with a dash under a plain one) is a subtask of the task above. A live preview shows the tasks with their subtasks and the counts. Pick the project and the epic or sprint (or a new epic), who gets them (by default you, so they show up in My tasks) and an optional deadline for all. Up to 40 tasks and 100 lines at once; they are created in one go (about 25 database calls however many lines).
- **A task shows its branch.** In My tasks every task carries its subtasks, folded or open, with a counter (done of total); tick a subtask to finish it, or press *+* on a task to add a small task on the spot. A subtask of mine under somebody else's task stands on its own and says which task it belongs to. After creating, the list opens on the tab where the new tasks are.
- **API and Claude:** `POST /api/v1/nodes/task-tree` (and the public `POST /nodes/task-tree`) and the MCP tool `create_tasks` make several tasks with subtasks in one call (29 tools now).
- **Icons for the site:** favicon (`favicon.ico` with 16, 32 and 48 px), an SVG icon, the Apple touch icon and a web app manifest with 192 and 512 px icons, all the violet owl. They are drawn by a small script with no image library; the SVG holds the same shapes.
- Tests: `task-outline.test.ts` (the typed list and the icon files) and `task-tree.test.ts` (creation, order, history, limits, nesting, permissions, the call count, the to-do hierarchy, the public API and the MCP tool).
## 0.15.0 — Create tasks and lists inside a project

- **Every section of a project** (map, board, list, calendar, timeline) has two buttons in its header: **Create tasks** (the typed list with subtasks, already known from My tasks, but for this project and its lists) and **New list**. A list is an epic, a named group of tasks; right after making one, the tasks dialog opens with it chosen.
- The list picker names where a sprint sits ("Sprint 1 · Frontend"), so two sprints with the same name can be told apart.
- **List view:** a *List* column (the epic or sprint a task belongs to, also for subtasks) and a filter by list.
- After creating, the project reloads and says how many tasks and subtasks were made.

## 0.16.0 — CRM for network marketing, step 1: people and the funnel

- **New "People" tab in the CRM** (first tab): a board of everyone you talk to, by stage: New lead, First contact, Warming up, Presentation, Deciding, Client, Partner; Declined and No reply sit in a folded side column. Move a card by dragging or with the stage menu on it; every move is written to a stage history.
- **"List of 100":** *Add a list* takes names one per line (`Name; @telegram; phone`, or `Name — note`), sets stage, warmth, source, interests, country and owner for all of them at once, skips names already in the funnel, and shows progress toward 100 names.
- **Funnel in the contact card:** stage, warmth (hot, warm, cold), next step with a date, source, country, influence 0-100, type letter, sponsor name and interests; every change saves at once. Filters on the board: search, owner, warmth, source and "To do today" (time-zone aware).
- **Import of your own sheets:** the import wizard maps the funnel columns (stage, warmth, interests, source, next step, country, sponsor, type) and reads sheet words such as "Средний", "Запланировать"; words it cannot read stay in the note instead of being lost. Contacts without email or phone are matched by name.
- Database migration `0012_people_funnel` (new columns on contacts and the `ContactStageEvent` table). The GDPR export includes the stage history.
- Tests: `people.test.ts` and `people-funnel.test.ts` (fields, stage history, filters, bulk add with call count, MLM sheet import).

## 0.17.0 — CRM for network marketing, step 2: groups and subgroups

- **Groups of people** on the left of the People board: a tree three levels deep ("Cold market" > "Gym" > "Morning class"). Press a group to see its people, subgroups included; *Everyone* and *No group* are always on top. Each group shows how many people it holds.
- **Make and change groups:** the *+* button makes a group, the folder icon on a group makes a subgroup, the pencil renames, recolours, moves it under another group or deletes it. A group cannot go inside itself or its own subgroup, nor past three levels; two groups on one level cannot share a name.
- **Deleting a group deletes nobody:** its people and its subgroups move up to the parent group (or to *No group*).
- **Putting people in groups:** tick the cards (the box at the top left of a card) and *Move to group*; or choose the group in the contact card; or choose it in *Add a list* (it starts on the group you are looking at). Cards show their group while you look at everyone.
- A person is in one group at a time. The selected group is kept in the page address, so a link opens the board on that group.
- **API:** `GET|POST /api/v1/workspaces/:id/contact-groups`, `PATCH|DELETE /api/v1/contact-groups/:id`, `POST …/contact-groups/assign` (many people in one call); `groupId` on contacts, `group` filter on `GET …/people`.
- Database migration `0013_contact_groups`.
- Tests: `groups.test.ts` (tree rules) and `contact-groups.test.ts` (creation limits, assignment, counts, filtering, moving, deleting, access).

## 0.18.0 — CRM for network marketing, step 3: partners, the team and hand-overs

- **Partners:** a person in the *Partner* stage is a partner. In the card, *Partner* section: the **sponsor** (whose line the person is in; a loop, with someone above themselves, is refused) and, for a partner, the **MeetOwl account** they work in (if any).
- **New "Team" tab in the CRM:** the sponsor tree of partners, each with how many people they work with, how many stand in their whole line and how many of those are partners; a badge shows who has a MeetOwl account. Press a partner to open the card; branches fold.
- **Hand people over to a partner:** tick people on the board and choose *Hand over to partner* (up to 500 at once), or choose the partner in a person's card (*Works with*). The board can be filtered by who holds the people (any partner, nobody, one partner), and a card shows its partner.
- **Two kinds of partner:** one **with an account** receives the people as their own (they become the owner, so they show in the partner's own lists); one **without an account** is worked through you, and the person's card makes a **handoff card**, a ready text (contact, stage, warmth, interests, next step, last notes) to copy into a messenger. Taking people back returns them to you.
- **History:** every hand-over is kept (who, to whom, when, by whom, the note) and shown in the card; a note is also written to the activity feed. Deleting a partner does not delete anyone or the history.
- **API:** `GET /api/v1/workspaces/:id/partners`, `POST …/people/transfer`, `GET /api/v1/contacts/:id/handoff`; `sponsorId`, `linkedUserId` on contacts, `held` filter on `GET …/people`.
- Database migration `0014_partners_transfers`.
- Tests: `partners.test.ts` (loops, team sizes, the handoff text) and `partners.test.ts` in integration (sponsor tree, team list, hand-over in bulk with the call count, account partner and taking back, history, permissions, removing a partner).
