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

## 0.19.0 — CRM for network marketing, step 4: the network map

- **New "Network map" tab in the CRM:** the whole network on one MindMap, with you in the middle. It reuses the map of the client page (same layout, zoom, mini-map), so it is read in the same way.
- **Three ways to arrange it:** *by sponsors* (partners under their sponsors, each person under whoever brought them; people with no sponsor under "No sponsor"), *by groups* (the group tree with people in their groups; the ungrouped under "No group") and *by who works with whom* (partners side by side, each with the people handed to them; the rest under "Nobody").
- **Colour is the funnel stage** (the legend is above the map); declined and silent people are faded and can be hidden. Cards say the stage, the warmth and the country; roots, groups and partners say how many people are below them.
- **Toggles:** *Show people* (off: only the structure, partners or groups), *Hide declined and silent*. The way of arranging is kept in the page address.
- **Press a person or a partner** to open their card beside the map and change anything there (stage, sponsor, group, hand-over).
- Up to 2,000 people are drawn; above that the map says how many are shown. A sponsor link that would loop (it cannot be made by hand, but a sheet could bring one) never breaks the map: the partner is placed under you.
- **API:** `GET /api/v1/workspaces/:id/network` (people with their links, groups, the name at the centre).
- No database changes.
- Tests: `network.test.ts` (the three arrangements, counts, climbing to the nearest partner, loops) and the network data in the partners integration test.

## 0.20.0 — CRM for network marketing, step 5: the plan of the day, scripts and auto-plans

- **New "Plan of the day" tab in the CRM** (first). At the top, **the week against its targets**: people added, reached, presentations, clients, partners, calls and meetings held. They are counted from what happened (each move into a stage is an event), by the person's own time zone, Monday to Sunday; the arrows go to earlier weeks. *Set the week's targets* gives each number a goal and a progress bar.
- **To do today:** everyone of yours whose next step is due today or late. A row has **Done** (closes the step), **Next in 1 / 3 / 7 d** (closes it and sets the next date) and the **scripts** for the person's stage to copy. Closing a step writes a done note to the person's feed and marks them as touched now.
- **The team this week** (shown when partners hold people): for each partner, the moves into reached, presentation, client and partner among the people they work with.
- **New "Scripts" tab:** a ready text for each stage of the funnel (or for any moment). `{name}` is the person's first name, `{full_name}` the whole name, `{my_name}` yours. In a person's card, *Scripts* shows those for their stage with **Copy**, names filled in.
- **Auto-plans** (same tab): for each stage, what the next step is and in how many days. When a person moves into the stage, the next step and its date fill in by themselves, unless the change already says what is next. *Fill with a suggestion* offers a start in your language.
- The CRM tab bar scrolls sideways when there are many tabs.
- **API:** `GET /api/v1/workspaces/:id/tracker?week=`, `PUT …/tracker/goals`, `GET|POST …/scripts`, `PATCH|DELETE /api/v1/scripts/:id`, `GET|PUT …/stage-rules`, `POST /api/v1/contacts/:id/step-done`.
- Database migration `0015_scripts_rules_goals` (scripts, auto-plan rules, weekly targets).
- Tests: `tracker.test.ts` (weeks in a time zone, targets, dates, script names) and `network-routine.test.ts` (scripts, auto-plans, the week's counts, the team summary, closing a step, permissions).

## 0.21.0 — Priority: travel or business

- The "П or Б" mark of a person now means **what matters more to them: Travel or Business**. It is a choice of two (✈️ Travel, 💼 Business) in the person's card, in *Add a list* (for the whole list) and as a filter on the People board; a card on the board shows it.
- **Import:** the column is read by its words and letters (П, Б, Путешествия, Бизнес, Travel, Business, Podróże, Biznes); a value that cannot be read goes into the person's note, not lost.
- **Data migration `0016_priority_codes`:** the letters and words already saved (П, Б and the like) become the codes, so nothing has to be re-entered. A value that is neither stays as it was and is shown as plain text.
- The API accepts the letters as before and keeps the code; `priority` filters `GET …/people`.
- Tests: reading the letters and words, the code kept through the API and the filter.

## 0.22.0 — Quick wins in creating tasks

- **"Due date for all" starts as today** (in the person's own time zone) when tasks are created, in My tasks and in every section of a project. Change it, or clear the field to add dates later.
- **"Create and add next"** (Ctrl+Enter in the list): saves the tasks and leaves the dialog open with an empty list for the next ones, keeping the project, the list, the assignee and the date. It says how many were just made. It works the same in My tasks and in the project's header (map, board, list, calendar, timeline), so the board has it too.
- What the person types while the previous tasks are still being saved is kept, not wiped by the answer. A new epic made on the way is reused for the next batch instead of making another one.
- Tests: no new server code; the dialog was run in the browser (default date, button, shortcut, typing during a save).

## 0.23.0 — Notes and links

- **New "Notes and links" section** in the left menu (after Time): a notebook of one's own. **Private: only the person who writes a note can see it**, not other members and not the workspace owner.
- **Notes** save as they are typed (like a paper pad); the title, the text and a pin to keep a note on top. **Links** are notes with a web address: a button opens the site in a new tab, and the note says why the link is useful.
- The web addresses written inside a note's text show as clickable chips under it. Only `http` and `https` addresses are made clickable; anything else stays text.
- **Search** across titles, texts and addresses; filters *All / Notes / Links / Pinned*. On a phone the list and the note take turns.
- Up to 500 notes and links per person in a workspace, 50,000 characters in a note. A note is deleted with its workspace or its author's account, and it is part of the account data export.
- **API:** `GET|POST /api/v1/workspaces/:id/notes`, `GET|PATCH|DELETE /api/v1/notes/:id` (personal; not in the public API or for Claude).
- Database migration `0017_notes`.
- Tests: `notes.test.ts` (addresses) and `notes.test.ts` in integration (kinds, order, search, addresses, limits, privacy between members and from outsiders, removal with the workspace).

## 0.24.0 — The working timer

- **A Start button on every page** (top bar): press it, say what you are working on or pick one of your tasks, and the timer runs until **you** stop it. While it runs the bar shows what it is on, the clock and a Stop button. Over 8 hours it shows a warning mark (it never stops on its own).
- **A timer with no task:** time can be spent on "calls to the list" or "reading" with no task at all. It shows in your totals, with a "no task" mark, but not in client reports.
- **Time page, rebuilt:** a big Start/Stop at the top; four totals (**today, this week, this month, all time**) that open their period; and **Day / Week / Month / All time** tabs with arrows to go back. Each shows the total, the time per day (per month for all time) as bars, where the time went (by task or label) and the entries, which can be deleted. The old table by task and day is kept in the Week tab.
- **Days by your own clock:** time is counted in the day of your time zone, and a timer left on over midnight is cut into both days (a day never holds more than 24 hours).
- Starting a timer while another runs stops the first and keeps its time; under 30 seconds records nothing (as before).
- **API:** `POST /api/v1/timer/start` takes `{ nodeId }` or `{ workspaceId, label }`; `GET /api/v1/workspaces/:id/time-summary?period=day|week|month|all&date=`.
- Database migration `0018_timer_without_task` (the task of an entry becomes optional; entries and timers keep their workspace and a label; existing rows get their workspace from their task).
- Tests: `time-period.test.ts` (periods, cutting time into days), `time-tracking.test.ts` (timer without a task, Warsaw midnight, the 24-hour limit, totals for day, week, month and all time, the other person's and workspace's time kept out) and the clock.

## 0.25.0 — Getting started (onboarding)

- **New "Start" section** (second in the menu): the way from the first login to a working day, in two blocks. **The platform in four steps:** time zone, a first task, the timer, a first note. **Working with people:** a dream and goal, the list of 100, moving people through the funnel, a next step for everyone, scripts and auto-plans, the week's targets, a first day by the plan; and, for those who want to go further, groups and partners with a sponsor.
- **Steps tick themselves** from what you have done (counted from your own data), with counts for the steps that are counts (for example 40 of 100 names). Each step says what to do and why, and opens the place to do it. A step can be **skipped** and brought back; optional steps never hold the progress back.
- **My dream and goal:** write the dream, why it matters, the date, and how many clients and partners it takes. The **distance to the dream** is measured from the clients and partners you have won (your own people in the Client and Partner stages): the share of the way, how many are left, the days left (or how long past the date) and the weekly pace needed.
- **A reminder on My day** while getting started is not finished: how far you are, the next step with a button to do it, and a link to all steps. It can be hidden (and shown again) from the Start page.
- Without CRM access only the platform steps and the dream are shown.
- **API:** `GET /api/v1/workspaces/:id/onboarding`, `PUT …/onboarding/goal`, `POST …/onboarding/skip`, `POST …/onboarding/hide`.
- Database migration `0019_onboarding` (the dream and goal; skipped steps and the hidden list).
- Tests: `onboarding.test.ts` (the steps, the distance to the dream) and `onboarding.test.ts` in integration (each step ticking by data, the dream and its distance, skipping and hiding, a member without CRM, strangers).

## 0.26.0 — Knowledge base

- **New "Knowledge base" section** in the menu (after Notes and links): 15 articles in four groups, with search. **Getting started:** quick start (the first 10 minutes), how the app is laid out, tasks and projects. **Working with people:** the funnel and its stages, the list of 100, scripts and auto-plans, the plan of the day and the week's targets, groups and subgroups, partners and sponsors and handing over contacts, the network map, dream and goal. **Tools:** the timer and time, notes and links. **Rhythm:** the daily rhythm and the weekly rhythm.
- **Russian and English;** Polish shows the English articles with a note, until they are translated.
- Articles link to the pages of the app ("Open [Plan of the day]"), to each other and to the web, and end with "Read next". The text is drawn by the page, never as raw HTML, and only app, article and web addresses become links.
- **From Start:** each unfinished step has a **"How to do it"** link to the article that explains it.
- The articles are kept with the app (no database change), so they appear with the update.
- Tests: the Markdown subset, links in every article resolve, every article exists in both languages, every step of Start has an article, and search.

## 0.27.0 — The guide and the presentation

- **The knowledge base offers two downloads:** the guide as a **PDF** (22 pages: cover, contents, the four parts with all 15 articles, and a cheat sheet by funnel stage) and a **presentation** (16 slides, for showing to newcomers). Russian and English; Polish gets the English files.
- The files are kept in `public/guide/` and are made from the same texts as the knowledge base.
- Tests: the four files exist, the PDFs are PDFs and the presentations are packages.

## 0.28.0 — Access levels for the CRM (account management, part 1)

- **A member's CRM access has levels:** *no CRM*, *own people*, *own team*, *everything*. Owners and admins always see everything. The level is chosen when inviting and changed any time in **Settings → Members**; every change is written to the history.
- **Own people:** the ones the member owns, the ones their partner card holds, and the card itself. **Own team:** the same for the whole line below them in the sponsor tree, and the people brought through that line.
- The rule applies everywhere people appear: the board, the table, groups, the network map, the team tree, the week's team summary, plan of the day, activities, hand-overs, getting started. Another person's card is a 404, to read or to change.
- A member who sees only their people has no deals, companies, pipelines, reports, exports or merging: those need the whole CRM. Their CRM tabs show only what they may use.
- Existing members keep what they had (*everything*). Migration `0020_crm_scope`.

## 0.29.0 — Teams (account management, part 2)

- **Settings → Teams** (owners and admins): make a team with a name, a leader and members, and choose what it gives them in the CRM: *nothing*, *members see each other's people* (a shared pool: what the members own and what their partner cards hold), or *everything*.
- A member's level is the better of what they were given personally and what their teams give; a team can open the CRM to a member who had none. Taking someone out of a team, loosening it or deleting it takes the grant away at once. Members show "team: ..." next to their level.
- Removing a member from the workspace takes them out of their teams and clears a leader's seat. Team changes are written to the history. Migration `0021_teams`.

## 0.30.0 — Access to single people and groups (account management, part 3)

- **Who has access** in a person's card: give a member or a team *view* or *edit* access to that one person, and take it away with one press. The same in the edit window of a group: a share on a group covers its people and those of its subgroups.
- A person's card shows only what the viewer may do: with view access the fields are locked, and changing the card, handing it over, putting it in a group or writing a note about it is refused.
- Who may give access: owners and admins (everything); the owner of a person (their own people); groups only by those who see the whole CRM. The receiver must be a member who sees part of the CRM (a member who sees everything needs no share, one with no CRM must be given CRM access first).
- Deleting a group, or taking the member's CRM access away, ends the access. Every grant and revoke is written to the history. Migration `0022_contact_shares`.
- This completes account management: levels (0.28), teams (0.29), single people and groups (0.30).

## 0.30.1 — Quick add on the project board

- Every column of a project's **Board** has **Add a task**: type a title, Enter adds it (to that column, under the project's first list, assigned to you) and the field stays open for the next one; Esc closes it. A project with no list gets one called Tasks.
- Fixed: the label of the list field in the Create tasks window, opened from inside a project, showed a missing-text key instead of its name.

## 0.30.2 — Fold the groups

- The groups panel on the **People** board has a button to fold it to a thin strip on the left (with the number of people), and another to show it again. The choice is remembered on the device. The board takes the room.

## 0.30.3 — Me as a sponsor or as the partner who works with someone

- In a person's card, **Sponsor** and **Works with them** offer **Me (make my card)** when the signed-in member has no partner card yet; choosing it makes the card (a person in the Partner stage linked to their account, named after them) and picks it. Once it exists it is listed with the other partners as "Name (me)". Asking twice never makes two.

## 0.31.0 — A profile card and member cards

- **Your account** opens with a profile card: first name, last name, phone and Telegram (a @name or a t.me link), with a round avatar of your initials, checks as you type, and a Save button that wakes only when something changed. The display name shown everywhere is made from the first and last name. Names already in use are split at the first space (migration `0023_profile_fields`).
- **Settings → Members** shows every member as the same card: avatar, name, e-mail, a tap-to-call phone and a Telegram link (teammates see them; guests and clients do not), and below it role, CRM access and hourly rate under the same captions, with the actions on the right.
- Your own partner card, when made, takes the name, e-mail, phone and Telegram from the profile.

## 0.31.1 — Change the stage in the Contacts table

- In **CRM → Contacts** the **Stage** pill is a choice list: pick another stage right in the row, the row changes at once and the change is saved (auto-plans and the history work as when the stage is changed in the card or on the board). Without the right to edit the pill stays plain.

## 0.32.0 — Smart sort on the timeline, and story points

- **Smart sort** button on the project's **Timeline**: it puts the open tasks one after another on working days (Monday to Friday), each person's tasks in their own queue, by the size of each task. A story point is 10 minutes, an hour is 60. Tasks that block others come first, then the earlier deadline, then the order they had.
- You choose **whose tasks** (yours, or all of the project's), **the first day** (today by default) and **the hours in a working day** (8). The window shows every task as it is now and as it will be, and says which tasks have no estimate and which would end after their own deadline. Nothing changes until **Apply**; **Undo** puts every date back in one step.
- A task blocked by another starts the day after its blocker ends, so the timeline shows no red clash. A blocker outside the chosen tasks that is not finished holds the task until the day after its due date.
- **Story points are optional.** The estimate of a task has a unit, **Story points** or **Hours**; a task without its own unit follows the project's (set on the project card). A task with no estimate counts as one working day. The list shows the unit.

## 0.33.0 — Creating an account, and invitation links

- **The sign-in page has two tabs: Sign in and Create account.** Both send a one-time link by e-mail; creating an account also asks for the first name (and, optionally, the last name). The e-mail with the link is in the language the person was using on the page (English, Russian or Polish), and the account gets that language.
- **After the first sign-in, one form:** first name, last name and the name of the workspace (suggested from the name), then straight to **Getting started**. A **welcome e-mail** with the first three steps is sent when the first workspace is made.
- **Protection:** a hidden field that only bots fill (the link is not sent, and the answer looks like success), and temporary mailboxes (mailinator, 10minutemail and the like) are refused, in the form and on the server. The daily limits stay.
- **One workspace of your own on the free plan;** more need a paid plan. Being invited into other workspaces is not limited.
- **Invitation link for a sponsor** (CRM → Team): copy it and send it to people you know. Whoever creates an account through it lands in your people as a **new lead** you own (under your partner card, if you have one), with a note and a notification, and the page they came through says who invited them and that the inviter will see their name and e-mail. The same person is never added twice. Migration `0024_signup_referral`.

## 0.34.0 — Inviting users to the platform, and the platform admin

- **A second link, for people who will use MeetOwl on their own** (Account → *Invite people to the platform*): each person who creates an account through it gets their own workspace, client base, CRM, reports and projects. They are **not** added to your CRM or your workspace. You see that they joined and how far they have got (joined, made a workspace, added people) and you get **one bonus point** for each. You never see their clients or projects. The link for leads in CRM → Team stays as it was.
- **Bonus points** are kept as a list of changes whose sum is the balance; what they can be spent on is not decided yet.
- **Platform admin** (user menu → *Platform admin*, only for the addresses in `SUPERADMIN_EMAILS`; for anyone else the page does not exist): all accounts with search, and for each the registration data (e-mail, name, phone, Telegram, language, when the terms were agreed), who invited them and whom they invited, every workspace they belong to with their role, CRM access, members and people counts. The owner can **block an account** (it cannot sign in and open sessions end; nothing is deleted) and let it back, **set a workspace's plan**, and **change bonus points** with a note. Everything done is recorded. Migration `0025_platform_invites`.

## 0.34.1 — Dark drop-down lists

- In the dark theme the open list of every choice field (stage, owner, language, unit and the rest) is dark too, with light text; date pickers and scrollbars follow the theme the same way.

## 0.35.0 — The plan in force, the Pro trial and the new Free limits (tariffs, part 1)

- **The whole paid system is behind a master switch, `PAID_PLANS`, and ships OFF.** Off (the default): every workspace has everything, with no limits, no trial, no upgrade button and nothing to buy; the billing page says *Open beta*. **Preview** (`PAID_PLANS_PREVIEW_EMAILS`, a list of addresses, while the switch is off): only the workspaces of those people live under the paid rules, to test them. **On**: the paid rules apply to everyone. After changing the switch, press **Recalculate plans** in the platform admin (it also runs daily); the admin shows the current mode.

- **A workspace's plan now comes from several sources:** the lasting plan (a Stripe subscription, the administrator's list, a permanent gift) and three time-limited kinds of Pro: the **14-day trial**, **bonus points** and a **gift with an end date**. The plan in force is the best of them, recomputed whenever one changes and every day, so an ended source falls away by itself. Migration `0026_plan_sources`.
- **Every new person's first workspace starts with 14 days of Pro, no card needed** (once per workspace and once per person; not for those who already have Pro from the list of addresses). The owner sees a bar with the days left (yellow in the last three days) and a link to choose a plan, gets a reminder in the last three days, and when it ends the workspace goes to Free: nothing is deleted, the Free limits apply to new items.
- A subscription can be started during the trial; ending a subscription keeps Pro while a trial, bonus or gift still runs.
- **New Free limits:** 300 people, 3 members, 3 projects, 1 pipeline (were 500 and 5). Pro is unlimited.
- The billing page shows where Pro comes from and keeps the Upgrade button during a trial.

## 0.36.0 — Block A: meetings from the CRM count in the plan of the day

- **Fix:** a meeting done or planned in the CRM now shows in "Meetings and calls" of My day. Before, that number counted only calendar events of projects, and the CRM side was fixed at 0, so a meeting marked done stayed at "planned 0, held 0".
- **A meeting logged afterwards counts for the day it happened.** A call or meeting written down as done, without a date of its own (or planned for another day and marked done today), used to fall out of every number. It is now counted on the day it was completed. Tasks finished today that were due earlier still count as cleared backlog, as before.
- Meetings (`MEETING`) count with the meetings and only there; calls, e-mails and messages stay with the follow-ups, so nothing is counted twice and the "3 presentations a day" figure is not inflated by calls. Efficiency and productivity use the corrected numbers.
- The "CRM contacts and activities" card of My day no longer lists meetings (they are in the meetings number).
- Tests: a new integration file covers a done and a planned CRM meeting, a meeting without a date, one done on another day, a project event, calls and messages, and the efficiency and productivity after the fix (it fails on the old code).

## 0.36.1 — A visible "Done" button for meetings

- **My day, "Meetings today":** the check mark without a label is now a button with the word **Done**, on every meeting from the CRM. The same in the contact card (planned items) and in the Activities tab, which already had it.
- **Calendar events of projects can be marked done too.** The row of an event now has a **Done** button; the meeting is counted as held at once, without waiting for its end time, and the row then shows "Done" in green. A series has no single "done": its dates count as held when their time is over, so no button is shown for it.
- Tests: a project event marked done counts as held before it ends; a series is not made "held" by the status of its node.

## 0.37.0 — Block H: people's contacts are private

- **Migration 0029 (additive):** `Workspace.contactPrivacy` (`PRIVATE` | `OPEN`), default `PRIVATE`, also for the workspaces that exist now. Nothing is deleted or renamed.
- **Private is the default.** In a private workspace nobody sees another person's contacts, whatever the role or CRM level: owners, admins and members with the whole CRM see only the people they own, those held by their own partner card, what was shared with them, and what a hand-made team pools. The "team" level no longer shows the line below as people; the people above see numbers (touches, meetings, stages), not names. **Open** restores the old behaviour, level by level. Only the owner of the workspace can switch (CRM settings → "Who sees people's contacts"); the change is written to the log.
- **Closed ways round, at the level of the queries, not the screens:** the calendar (activities and deals of others), the CSV export, the duplicate list and merging, the people of a company page and the Client Map, the card, the table, the map, the groups, My day and the team tree (they all go through one rule). Tests call the services directly as the owner, an admin, a whole-CRM member and a "team" leader, and each gets a 404 for another person's card.
- **Sharing is the only way in.** A person's keeper can share them with anyone, owners and admins included (in a private workspace they appear in the list of people to share with); what was shared to someone cannot be passed on by them. A whole group can be shared only when all its people are the sharer's own, so a group share cannot open other people's contacts.
- **A person's data can be exported and erased by whoever keeps that person** (and still by owners and admins who see them), so a partner can answer a request about their own contact; the people above cannot, as they do not see it.
- The demo workspace is open (a showcase). Existing tests of the old rules now run in an open workspace; a new test file (15 tests) covers the private one.

## 0.38.0 — Block C: the temperature of a person is worked out

- **Migration 0030 (additive):** `Contact.temperatureManualUntil`, `CrmActivity.outcome` and `CrmActivity.signals` (both empty until the touch queue records what came of a touch), an index on workspace + temperature.
- **`computeTemperature(contact, activities)`** (pure, in `modules/crm/temperature.ts`, 14 tests): points from the stage of the funnel, the touches of the last 30 days, replies, an agreed meeting, a meeting held in the last 60 days, a question about the price in the last 14 days, a move forward in the funnel in the last 14, minus the silence since the last contact and minus messages left without an answer. 6 or more is hot, 3 or more is warm, the rest cold; those who said no or do not answer are cold; clients and partners have none. It also gives the reasons, so the screen can say why.
- **It is kept up to date:** after every touch that is marked done, after a move in the funnel, every night (job `crm/temperature`, 03:40, so people cool as the days pass), and once for everybody: the admin has a **Recalculate temperatures** button, which also fills in the people who had none. A person added now gets a temperature at once (a name with no history is cold).
- **A temperature set by hand holds for 14 days** and is marked in the card ("set by you until 12 Nov; then it is worked out again"); a new touch or the nightly job do not change it. Tapping the chosen value again, or "Work it out for me", clears it and the computed one is back at once.
- **The icon is visible** on the board of people, in the Contacts table (new), in the plan of the day and in My day (next to a person due today).
- Tests: 24 new (the rules; the service on a real database: a new person, a meeting held, a move in the funnel, a person who said no, a hand-set value that holds, expires and is cleared, cooling over 40 days, the nightly job, the one-time pass).

## 0.39.0 — Block B: the touch queue

- **Migration 0031 (additive):** `Contact.city` and `Contact.returnAt`, `Script.situation` and `Script.ownerId`, `Membership.touchSettings`.
- **A new screen, "Touches"** (CRM tab, and a **Start touches (N)** button at the top of My day): the people whose next step is today or late, one card at a time. Order: late first, then the hottest, then those closest to a decision. A progress line ("7 of 20"), the person (stage, temperature, where from, last touch, the last three things that happened), the message ready for this moment, buttons for Telegram, WhatsApp and Copy, and five answers: **Replied**, **No reply**, **Meeting set**, **Said no**, **Skip**. At the end a summary compared with the plan of the day. Works at 375 px; every button is at least 44 px.
- **Sending:** WhatsApp opens the chat with the text in the link; Telegram's link cannot carry a text, so the text is copied and the chat is opened ("Text copied"); Copy is always there.
- **Each answer is written down in one go** and sets the next step with a text that says what to do: *replied* gives tomorrow ("Continue the conversation"); *no reply* gives 3 days (2 by choice), and the third touch in a row without an answer puts the person on the **quiet** stage for 30 days; *meeting set* asks for the day and time, puts a meeting in the calendar, moves the person to Presentation (a rule that can be turned off) and makes the meeting day the next step; *said no* asks for the reason from the list, and the person is out of the queue for 75 days (60 to 90 by choice). The touch goes into the person's feed with its result, the text sent and the channel; the temperature is worked out again at once. The words follow the language of the screen.
- **A day to come back:** people who said no or went quiet come back into the queue, My day and the "due today" filter on their own day (`returnAt`); an old date on someone out of the funnel does not bring them back.
- **Settings of the queue** (the gear): days after a reply, after no reply, after a no, and whether a meeting moves the person on; each member has their own.
- **Scripts: the team's and the member's own.** Owners and admins make scripts for the whole team (everyone sees and can copy them, only the leaders change them); everybody else's scripts are their own and nobody else sees them. "Copy to mine" makes an own copy. A script has a **moment** (first touch, a reminder after silence, after a presentation, back to someone who went quiet); the queue picks by moment and stage, and shows the other fitting ones as switches. The ready-made set carries its moments; scripts added earlier get them by title.
- **Script variables:** `{name}`/`{имя}`, `{full_name}`, `{my_name}`, and new `{city}`/`{город}` and `{link}`/`{личная_ссылка}` (your personal invitation link); a city or link that is not known stays in the text to be filled by hand. A person has a **City** field.
- Tests: 14 for the rules, 14 for the queue on a real database (the order, the card, the scripts, every answer, the quiet stage and its return, a no and its return, privacy, the settings, the plan of the day), 6 for the script library.


## 0.40.0 — Block D: "My team" map

- **Migration 0032 (additive):** `Workspace.teamHeat` (the thresholds of the colours).
- **A new CRM tab, "My team":** the partners as a mind map with you in the middle. The first 3 levels are open (1 to 6 by choice); a deeper line opens by a click on its partner ("Open their line"), loaded branch by branch (up to 400 partners per answer).
- **Each card:** name, city, the date the person became a partner, and the numbers of the last 7 days (touches, meetings, partners invited personally; the size of the line when it is cut off). Numbers only: nothing of the partner's people is shown. What you see follows the contact privacy of the workspace.
- **Colours:** green when there was a sign of work in the last 3 days, yellow up to 7, red after; a newcomer with no work at all 7 days after joining is red. Owners and admins change the days ("Colour thresholds"); the change is written to the log.
- **Filters:** by level, by city and by colour (with the number of partners in each colour); a match keeps its way up to you so the map does not fall apart.
- **Panel of a partner** (a bottom sheet on the phone): colour and last action, four numbers, **Write** (Telegram, WhatsApp or phone from the card), **Plan a call** (the usual planning dialog), **Open their line**, **Open the card**.
- The demo workspace now has a small team (8 partners, three colours).
- Not yet in the panel (they come with blocks F and E): onboarding progress and rank progress.
- Tests: 9 for the rules (colours, thresholds, slicing the tree, filters), 6 on a real database (levels, branch on request, the numbers, colours moved by the thresholds and who may change them, privacy).

## 0.41.0 — Block F: the first 30 days of a new partner in one click

- **Migration 0033 (additive):** `Workspace.onboardingPlan` (the leader's steps; empty means the standard plan).
- **"Start onboarding"** in the partner's panel on the "My team" map: one project "First 30 days: Name" with a task for each step, assigned to the newcomer and dated from today. A step with a checkpoint also gives the mentor (who pressed the button) a task of their own to check it. Pressing it twice returns the same project. It needs a partner who has an account on the platform; for one without, the panel says to invite them first.
- **The standard plan** (in ru/en/pl/uk): get to know the product, register and fill in the profile, a warm list of at least 50 names, the first 10 touches by the scripts, the first presentation with the mentor, the first invitation, and a review of each of the four weeks.
- **The leader's own plan:** CRM settings → "Onboarding of a new partner": rename, add or remove steps, set the day and length, mark which ones the mentor checks; owners and admins change it, everybody sees it, and "Back to the standard plan" resets it. Onboardings already started keep their steps.
- **Progress** (done of the newcomer's tasks) shows on the partner's card ("onboarding 40%") and in the panel with the next step and a link to the project. A newcomer whose onboarding started more than the "newcomer" days ago (7 by default) and is not finished turns **red** on the map.
- **The newcomer's own view:** a "First 30 days" card at the top of the Start page, with the percent, the next step and a button into the project.
- Tests: 8 for the plan rules, 7 on a real database (who may change the plan, the checks of an account and a partner, who gets which task, no second project, progress, the red colour, the leader's own plan).

## 0.42.0 — Block E: the rank tracker

- **Migration 0034 (additive):** `Workspace.rankPlan` (the ladder) and `Membership.rankState` (each person's place on it).
- **The ladder is the leaders' to write:** CRM settings → "Ranks of the team": ranks from the lowest to the highest (move up and down), each with criteria (a name and a number needed). A criterion is **counted by the platform** (my clients; partners of my first line; everybody in my line; new partners this month) or **filled in by hand** by each person. Owners and admins change it, everybody sees it.
- **The widget on My day:** "Starter → Builder", the overall percent, a bar for each criterion with the value and the target, and for hand-filled ones the date they were last set ("updated 4 days ago") with a field to update them. A target day with the countdown ("21 days") and, for what is left, **what each day has to bring** ("0.3 a day to make it"); a past target day says how long ago it passed. When every condition is met the widget says so and to confirm the rank with the leader. A link leads on to the norms of the day.
- **Each person sets** their own current rank, the day they aim for and their hand-filled numbers; nobody else's are touched. Until a ladder exists only owners and admins see a pointer to set it up.
- The demo workspace has a ladder of three ranks.
- Tests: 9 for the rules (cleaning, the next rank, counted and hand-filled values, per-day need, after the target day, the top), 5 on a real database (who writes the ladder, the counts from the team, each person's own state, refusals).

## 0.43.0 — Block G: the simple mode

- **Migration 0035 (additive):** `User.uiMode`.
- **A switch in the account** ("How the app looks"): **Simple** or **Advanced** mode. Somebody who came through a platform invitation starts in the simple mode; everybody else in the advanced one; the person's own choice always wins and works on every device.
- **A layer over the same data:** in the simple mode epic is a **Goal**, sprint a **Week**, task an **Action**, subtask a **Step** (in all four languages, in the menu, the map, the drawer, My actions). Nothing in the data changes. The estimate and its unit, dependencies, the Timeline view, the burndown and the agile reports are hidden.
- **The simple home page:** the "Start touches" button, the rank widget, **+ Contact** and **+ Meeting** at the top (they open the usual forms right there), and a line about the team ("2 in your team went quiet") when there are partners.
- **Empty screens** tell what to do and give one button: scripts (add the starter scripts), the team and the team map (open People).
- Tests: 6 (the default mode, the overlay does not touch the original, the replaced lines exist in every language with the same placeholders).

## 0.44.0 — Block I: the phone

- **Install and offline:** the manifest is completed (id, scope, portrait, shortcuts) and a **service worker** keeps the shell (scripts, styles, icons) so the app opens fast; without a network a page of its own ("No connection", with a Retry button) is shown. The worker never touches `/api` or other sites and stores nothing private; it runs in production only.
- **Bottom bar on a phone:** Day, Touches, Contacts, Team and More (opens the usual menu), with a round **+** above it. Hidden from tablet width up and for those without the CRM.
- **Quick add of a person:** a name and a phone *or* a Telegram name, nothing else; it tells at once if somebody with this phone or Telegram is already there (with "Add anyway"), and offers "Add one more" or "Open the card".
- **Voice note** on a person's card: press, talk, stop. The recording is kept as an attachment of the card; where the browser can write speech down (Chrome, Edge, Safari) the words become a note that can be corrected before saving. The connected AI works with text only, so the writing-down is done by the browser itself, with nothing sent to our server.
- **Thumb size:** on a phone every button and field is at least 44 px (the map canvas excepted); the card drawer already covers the whole screen. The top bar no longer pushes the page wider than the screen (it was 423 px on a 375 px phone).
- Tests: 5 (the manifest, the worker never caches the API, the offline page exists).

## 0.45.0 — Block J: leads through a personal link

- **Two personal links with a QR code each**, on the Team page: **for clients and acquaintances** (the workspace's first open lead form with the person's own label, `/f/<form>?ref=<code>`) and **an invitation to the team** (`/r/<code>`). The QR is drawn in the browser (no service, no library) with the person's name under it, and **Download PNG** saves it. The label (`ref`) is shown with the words to give to outside forms.
- **A lead through a link or a form with `ref`** (Marquiz, Tilda, Make or the hosted form) belongs to that member: a person in the funnel at "New lead", with the source, the Telegram name and **the answers of the quiz in the note**; no deal is made. A wrong or missing label sends it to the leader of the workspace as before.
- **The member is told** (a notification; Telegram if the bot is connected) and the person stands at the head of today's touches with the line **"New: reply within the hour"** (in the language of the member), unless a nearer step is already planned.
- **Doubles:** a person is recognised by phone, e-mail and now by **Telegram name** however it is typed (`@name`, `name`, `t.me/name`); the same goes for the quick form, the hand-made card and the lead intake. A repeat of a lead adds to the same person and tells the member; a retry with the same key makes nothing twice.
- A **Telegram** field can be put on a lead form; a lead with only a Telegram name is accepted.
- Tests: 8 (the QR code: sizes, finder patterns, timing lines; the intake) and 7 on a real database (the owner by the label, the note, no deal, the notification and the queue, privacy, no label or a wrong one, doubles by every way). The codes were also read back with an independent decoder (OpenCV) in five sizes, all correct.

## 0.46.0 — Block K: the library of materials

- **Migration 0036 (additive):** the `Material` table.
- **A new CRM tab, "Materials":** presentations, videos (links), pictures for stories, PDFs and others, each with a **kind, a language (RU / PL / EN / DE / UA) and a category**; filters by all three. A material is a link or an uploaded file (up to 25 MB, kept in the same storage as attachments).
- **Shared and own:** owners and admins add materials **for the whole team** (everybody sees and sends them, only the leaders change them); every member can add their own, which only they see. The kind is guessed from the link or the file.
- **Send material:** a button in a person's card (the line "Title: link" is copied, ready for any chat) and in the touch queue (the line is added to the text of the message), the person's language first. For an uploaded file the link is ours (`/m/<key>`): it opens the file in the browser without a sign-in, and it is hard to guess; a deleted material stops working.
- **Pictures for stories with the owner's own QR code:** the leader marks a picture ("everybody may put their QR code on it": the corner and the width), and each member gets **"With my QR (PNG)"**: the picture with their personal link's QR in that place, made in the browser.
- The demo workspace has four materials.
- Tests: 8 for the rules (the QR place, links, kinds) and 8 on a real database (who shares, who sees what, link or file, the way a file is read and given out, the QR place on pictures only, who changes or deletes, the file removed with the material).
