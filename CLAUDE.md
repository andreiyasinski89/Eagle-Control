# MLM CRM — how we work

Read at the start of every session. Short on purpose: details live in the files linked below, read them only when the task needs them.

## The owner
- Russian-speaking, runs an MLM business, **not a programmer**. Answer in Russian, plainly, step by step for anything done in a console (Vercel, Neon, GitHub, Google, Resend, Backblaze).
- Never ask for, paste or print passwords, keys, tokens or connection strings. Never log in to the owner's consoles: give instructions instead.

## Delivery rule (mandatory)
1. Build and check (tsc, eslint, vitest), then show the result in Russian.
2. Wait for an explicit **«Одобряю»**. Only then `git fetch`, commit, push to `main` (merge `origin/main` first if behind).
3. Commit message ends with the Co-Authored-By line for the current model.
4. After the push, check CI through the GitHub API and say honestly what is and is not verified (e.g. "not looked at in a browser").

## Code conventions
- Next.js 15, React 19, TypeScript strict, Prisma + Neon Postgres, Auth.js v5, next-intl (en/ru/pl/uk), Vitest (PGlite integration tests), Tailwind v4, Vercel.
- **All UI text via i18n fragments**: `scripts/i18n/pNN-*.mjs`, merged with `node scripts/i18n-merge.mjs <file>`; locales must stay in sync. No `<...>` inside ICU texts. Use the next free `pNN` number.
- Every screen must work at **375px** width.
- Migrations are **additive only**.
- Every delivery updates `CHANGELOG.md` (new version) and `DECISIONS.md` (next row number).
- Tests with a fixed "now" must use a date far in the future (rows created by code carry the real clock).
- Technical names that stay `meetowl` on purpose: webhook headers `MeetOwl-*`, bot `MeetOwlBot`, localStorage `meetowl:*`, Google key `meetowlNodeId`, export format `meetowl-account-export/1`, Inngest id, Vercel project `meetowl-app`, MCP `serverInfo.name`.

## Never without the owner's explicit request
- Turn on `PAID_PLANS`.
- Start the Neon → Frankfurt move, and do not remind about it (a deferred optimization in the dev-project backlog).

## Where things are
- `CHANGELOG.md`: what changed, by version. `DECISIONS.md`: why, one row per decision.
- `docs/context/` (private, not in git, only on the owner's computer): `open-tasks.md` (what is left), `infrastructure.md` (services and setup state, no secrets), `history.md` (a few lines per working day). Read the one you need; when a task is finished or decided, update `open-tasks.md` and add a line to `history.md`.
- Product name for people: **MLM CRM**, domain `mlmcrm.app`. Repo `andreiyasinski89/Eagle-Control` is **public**: nothing private goes into tracked files.
