# Inter-Departmental Ticketing System — Prototype

> **Status: prototype, not production-ready.** Authentication is mocked (pick a seeded identity
> — no passwords), persistence is `localStorage` only (no backend, no database, single browser),
> and the client is not an authorization boundary. This build is ready for **UAT and stakeholder
> demonstration**, and was never intended to be deployed as-is. See
> [Known Limitations](#known-limitations) below and
> `../ticketing-system/docs/ENTERPRISE_QA_STRATEGY.md` for the full verdict.

Version **0.5.0-prototype** · frontend-only Vite + React app · no git repository (neither this
project nor the sibling docs repo is under version control — there are no commits, branches,
tags, or remotes to reference).

## Project Overview

A single-page application for routing and tracking support tickets between departments (e.g.
Sales → Finance, Marketing → HR). A requester raises a ticket against a destination department's
queue; the destination works it through a governed status lifecycle with SLA tracking; the
original requester closes it once resolved. This repository is a **new, standalone rebuild**
(ratified decision R6) — the legacy Next.js/Prisma app under `../ticketing-system/src` is
untouched and out of scope.

There is currently no server component: every "backend" concern (auth, persistence, audit,
notifications) is simulated client-side behind seams designed so a real backend can be dropped
in later without a UI rewrite. See [Future Backend Notes](#future-backend-notes).

## Business Purpose

Replaces ad hoc email/chat requests between departments with a structured, auditable workflow:
a ticket always has a clear owner, a due date derived from priority and business hours, and a
two-step closure so the requester — not the department that did the work — confirms the ticket
is actually resolved. The full business case, requirements, and domain model are specified in
`../ticketing-system/docs/` (`BUSINESS_REQUIREMENTS_SPECIFICATION.md`,
`BUSINESS_DOMAIN_MODEL.md`, `PROJECT_CONSTITUTION.md`); this prototype implements that spec's
Phase 0–3 scope on a new stack (see `docs/phase-0-functional-spec.md` onward).

## Technology Stack

| Layer | Choice | Version |
|---|---|---|
| UI framework | React + ReactDOM | 18.3.1 |
| Language | TypeScript (strict) | 5.6.3 |
| Build tool | Vite (`@vitejs/plugin-react`) | 5.4.11 |
| Routing | react-router-dom | 6.28.0 |
| State | zustand | 5.0.1 |
| Forms | react-hook-form | 7.53.2 |
| Validation | zod | 3.23.8 |
| Charts | recharts | 2.13.3 |
| Icons | lucide-react | 0.454.0 |
| Styling | Tailwind CSS | 3.4.15 |
| Tests | vitest + @vitest/coverage-v8 + jsdom | 2.1.9 / — / 25 |
| Lint / format | eslint 8.57.1 + prettier 3.3.3 | — |

Full dependency list with exact ranges: `package.json`. There is no server-side language,
framework, ORM, or database in this repository.

## Architecture Summary

Strict layering, one direction only:

```
UI (features/*, components/*)
  -> Service (services/*Service.ts)
    -> Repository (services/ticketRepository.ts, etc.)
      -> StorageAdapter (services/storage/localStorageAdapter.ts)
        -> localStorage
```

`StorageAdapter` is the **only** module that touches `localStorage` for **business/domain data**
(12 keys: `tickets`, `ticketSeq`, `session`, `audit`, `notifications`, `config.sla`, `config.org`,
`config.flags`, `config.categories`, `config.versions`, `admin.users`, `theme`); everything above
it is storage-agnostic, so a future `HttpAdapter` is a drop-in replacement at the bottom of the
stack without touching UI or services. `ThemeProvider` writes its `tps.theme` preference directly
to `localStorage`, bypassing the adapter — a deliberate, narrow exception for a UI-only setting,
not business data (defect ARCH-001, resolved by narrowing the invariant rather than the code).

Key domain rules (implemented in `src/domain/`, config-driven from `src/config/`):

- **Permissions are route-derived, not role-derived.** There is no stored role→permission table.
  `src/domain/permission/can.ts` exposes `canStatic(session, perm)` for identity-level checks and
  `canOnTicket(session, verb, ticket)`, which derives the actor's authority from their relationship
  to the ticket's route (source department / destination department / creator / assignee), plus a
  `SUPER_ADMIN` overlay.
- **Workflow chokepoint.** Ticket status changes only through the workflow engine
  (`src/domain/workflow/workflowEngine.ts`) plus `ticketService.commitAction`; there is no other
  path that can mutate a ticket's status.
- **10-status lifecycle, 23 legal transitions**: Draft, Submitted, Assigned, InProgress,
  AwaitingInformation, Resolved, Closed, Rejected, Cancelled, Reopened
  (`src/config/statusTransitions.config.ts`). A completeness test
  (`workflowEngine.test.ts`, *"completeness vs the canonical set (WF-001 regression)"*) asserts
  the implemented edge set matches the canonical 23 exactly.
- **Two-step closure.** The destination department resolves a ticket; only the original requester
  closes it. The destination never closes its own ticket.
- **SLA engine** (`src/domain/sla/slaEngine.ts`) computes due dates against an injected
  `BusinessCalendar` — `workingDays`, `workingHours` and `holidays`, sourced from
  `src/config/org.config.ts` `DEFAULT_ORG_CONFIG` via `calendarOf()`/`DEFAULT_CALENDAR` (defect
  CFG-001, now **fixed**: these were previously dead config, hardcoded in the engine as
  `DAY_START`/`DAY_END` literals plus a Mon–Fri assumption) — combined with resolution targets
  from `src/config/sla.config.ts` `DEFAULT_SLA_POLICY` (`resolutionHours` Urgent 8 / High 16 /
  Medium 40 / Low 80, `dueSoonThreshold` 0.2). The default calendar is still Mon–Fri 09:00–18:00
  with no holidays, but an administrator can now edit any of the three (`/admin/system`) and it
  genuinely governs SLA. `timezone` (`Europe/London` by default) is still **not** honoured — the
  engine uses the host machine's local zone regardless of configuration. `AwaitingInformation`
  pauses the clock. "Overdue" is a derived flag (`OnTrack | DueSoon | Overdue`), never a status and
  never a transition target.
- **Routing** (`src/config/routes.config.ts`): 14 fixed department→department routes across 6
  departments (Sales, Marketing, Academics, HR, Finance, Administration); Finance and Academics
  are the only queue-holding ("destination") departments plus HR.

Deeper architecture reference: `../ticketing-system/docs/FRONTEND_ARCHITECTURE.md` and
`DYNAMIC_TICKETING_ENGINE.md`. Day-to-day extension patterns: `DEVELOPER_GUIDE.md` (this
project's own docs — see [Related Documentation](#related-documentation)).

## Folder Structure

Derived from the actual `src/` tree (`find src -type f`, current as of this README):

```
src/
├── app/                        App.tsx — root component
├── components/
│   ├── auth/                   Can.tsx (permission-gated rendering), RouteGuard.tsx
│   ├── common/                 PageHeader.tsx, EmptyState.tsx, InlineError.tsx, ChartCard.tsx,
│   │                            chartStyles.ts, PagePlaceholder.tsx (now only the 404 route)
│   └── shell/                  Header.tsx, Sidebar.tsx (app chrome; version footer lives here)
├── config/                     Pure data: departments, routes, mock users, permissions,
│                                SLA policy, status transitions, org settings, navigation,
│                                attachment limits (`attachments.config.ts`)
├── domain/                     Pure functions, no I/O — the engines and their tests
│   ├── dashboard/               metrics.ts (+ metrics.test.ts), scope.ts (+ scope.test.ts)
│   ├── permission/               can.ts (+ can.test.ts)
│   ├── reports/                  filters.ts, reportMetrics.ts
│   ├── routing/                  routingEngine.ts (+ .test.ts)
│   ├── sla/                      slaEngine.ts (+ .test.ts)
│   ├── types/                    auth.types.ts, ticket.types.ts
│   └── workflow/                 workflowEngine.ts (+ .test.ts)
├── features/                   Route-level pages, grouped by module
│   ├── admin/                    6 pages (Users, Roles, Categories, SLA, Audit, System);
│   │                              `components/` is now empty (`AdminHeader` deleted)
│   ├── auth/                     LoginPage.tsx, UnauthorizedPage.tsx
│   ├── dashboard/                DashboardPage.tsx + components/ (KpiCard, charts)
│   ├── notifications/            NotificationsPage.tsx
│   ├── reports/                  ReportsPage.tsx + components/ReportChartsPanel.tsx
│   └── tickets/                  CreateTicket, MyTickets, DepartmentQueue, TicketDetails
│                                  + components/ (TicketBadges, TicketList — table at ≥md, card
│                                  list below md — TicketListControls, useFilteredTickets)
├── hooks/                       useAuth.ts, usePermissions.ts, usePrefersReducedMotion.ts
├── layouts/                     AuthenticatedLayout.tsx
├── lib/                         cn.ts (classnames), id.ts (id/timestamp helpers)
├── providers/                   AppProviders.tsx, ErrorBoundary.tsx, ThemeProvider.tsx
├── routes/                      AppRouter.tsx — the single route table
├── services/                    Business logic; the only callers of the repositories below
│   ├── storage/                  localStorageAdapter.ts — the ONLY module touching localStorage
│   │                              for business/domain data (+ storage.test.ts, ST-001 regression)
│   ├── AuditService.ts, AuthService.ts, configService.ts, exportService.ts,
│   │   notificationService.ts, ticketRepository.ts, ticketService.ts, userService.ts
│   └── governance.test.ts        deactivated-user sign-in, re-assignment, feature-flag coverage
├── stores/                      Zustand stores: authStore, notificationStore, ticketStore
├── styles/                       globals.css, tokens.css
├── main.tsx                     Entry point
└── vite-env.d.ts                Vite client types + __APP_VERSION__ declaration
```

Top level: standard Vite/TS config files (`vite.config.ts`, `vitest.config.ts`,
`tsconfig*.json`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.cjs`,
`.prettierrc.json`), `index.html`, `package.json`. `dist/` (build output) and `node_modules/`
are generated and gitignored (a `.gitignore` exists even though this is not a git repository).

Import paths use aliases (`@`, `@app`, `@components`, `@features`, `@config`, `@domain`,
`@services`, `@stores`, `@hooks`, `@layouts`, `@providers`, `@routes`, `@lib`, `@styles`),
defined in both `vite.config.ts` and `tsconfig.app.json` — keep the two in sync when adding one.

## Installation

Requires Node.js and npm (no specific version pinned in this repo).

```bash
npm install
```

There is nothing else to configure — no `.env` file to create, no database to provision, no
service to point at (see [Environment Variables](#environment-variables)).

## Development Commands

```bash
npm run dev            # start Vite dev server at http://localhost:5173
```

`vite.config.ts` sets `strictPort: false`, so if 5173 is taken Vite will pick the next free port
and print it to the terminal.

## Environment Variables

**There are none.** There is no `.env` file anywhere in this repository, and no `import.meta.env`
usage in `src/` (verified by search). This is not an oversight:

- There is no backend or API to point a base URL at.
- There are no secrets, keys, or credentials in a client-only, mocked-auth prototype — anything
  placed in a Vite env var is shipped to the browser bundle in plaintext regardless, so this
  prototype simply has nothing that belongs there.
- The one build-time value the app does need — the app version — is injected a different way
  (see [Version Information](#version-information)), not via `.env`.

**Category C — proposed only, not implemented today.** When a real backend exists, it will need
its own environment configuration (at minimum an API base URL, and however it chooses to handle
auth tokens/session config). No such list exists yet in this codebase; do not treat any variable
name as real until a backend project actually defines one. See
`BACKEND_HANDOFF.md` for the proposed backend contract this would attach to.

## Build Commands

```bash
npm run build           # tsc -b && vite build   — type-checks, then produces dist/
npm run preview          # vite preview           — serves the dist/ build locally
```

Last verified build output (this phase):

| Asset | Size | Gzip |
|---|---|---|
| `dist/assets/index-*.js` (main bundle) | 351.34 kB | 104.24 kB |
| `dist/assets/chartStyles-*.js` (Recharts, lazy/code-split) | 394.88 kB | 107.51 kB |
| `dist/assets/ReportChartsPanel-*.js` | 19.46 kB | — |
| `dist/assets/DashboardChartsPanel-*.js` | 3.19 kB | — |
| `dist/assets/index-*.css` | 24.13 kB | 5.64 kB |

Recharts is the dominant payload; it is already lazy-loaded behind the chart panels rather than
bundled into the main chunk.

## Run Commands

```bash
npm run dev        # development, http://localhost:5173
npm run build && npm run preview   # production build, served locally
```

There is no other runtime target (no Docker image, no server process, no deployment config in
this repo). Deployment options for a static build are discussed, not implemented, in
`DEPLOYMENT_STRATEGY.md`.

## Testing Commands

```bash
npm run test             # vitest run            — single run
npm run test:watch       # vitest                — watch mode
npm run test:coverage    # vitest run --coverage — with @vitest/coverage-v8
```

Current state (verified this phase): **116 tests passing across 8 files**, under `src/domain/`
and `src/services/`:

- `domain/permission/can.test.ts`
- `domain/workflow/workflowEngine.test.ts` (includes the WF-001 completeness regression test)
- `domain/routing/routingEngine.test.ts`
- `domain/sla/slaEngine.test.ts`
- `domain/dashboard/scope.test.ts`
- `domain/dashboard/metrics.test.ts`
- `services/governance.test.ts`
- `services/storage.test.ts` (includes the ST-001 silent-write-failure regression test)

These are **domain- and service-level unit tests**, exercising pure functions and service logic
with no rendering. There are currently no component tests, no integration tests, no end-to-end
tests, no axe/screen-reader accessibility audit, and no Lighthouse/performance profiling — see
[Known Limitations](#known-limitations).

```bash
npm run lint      # eslint . --max-warnings 0   — currently clean
npm run typecheck # tsc -b --noEmit             — currently clean
npm run format    # prettier --write "src/**/*.{ts,tsx,css}"
```

## Future Backend Notes

Everything below is a **proposal for a future backend team (Category C)**, derived from the
shapes of the existing repository/service methods — none of it exists as a running service today.
Full detail: `BACKEND_HANDOFF.md`.

- **Replace the storage seam, not the app.** `src/services/storage/localStorageAdapter.ts` is
  the single point of contact with persistence. An `HttpAdapter` implementing the same
  `read/write/remove/append` shape (or a repository-level swap) is the intended integration
  point — UI and domain code should not need to change.
- **The client must not remain the authorization boundary.** `canStatic`/`canOnTicket` and the
  workflow engine's legal-transition checks are enforced only in the browser today. A backend
  must re-check every permission and every status transition server-side; nothing client-side
  should be trusted.
- **Method signatures as a starting contract.** `ticketService.ts`, `AuditService.ts`,
  `userService.ts`, `configService.ts`, and `notificationService.ts` describe, in their current
  function signatures, roughly what a REST/RPC surface would need to cover (create ticket,
  commit workflow action, add comment/attachment, manage users/categories/SLA policy, record and
  read audit events, publish/read notifications). None of these are implemented as network
  endpoints; treat any endpoint list derived from them as a proposal only.
- **Attachments** are currently stored as base64 `data:` URLs embedded directly in the ticket
  record in `localStorage` (limits — max 3 per ticket, 1 MB per file, a 4 MB store-wide budget,
  and a PDF/PNG/JPEG MIME allow-list — live in `src/config/attachments.config.ts`
  `ATTACHMENT_LIMITS` and are enforced in `ticketService`/`TicketRepository.attachmentBytes()`). A
  real backend should move file bytes to object storage and store a reference/URL instead.
- **Audit retention.** The audit log is append-only but capped at the last 1000 entries
  client-side (`StorageAdapter.append(..., 1000)`); a backend must implement durable, unbounded
  (or policy-retained) audit storage — the business requirement is 24-month retention (BR-086),
  which this client-side cap cannot satisfy.

## Known Limitations

Stated plainly, per this project's engineering-honesty standard:

- **Mocked authentication.** Signing in means picking one of 7 seeded identities
  (`src/config/mockUsers.config.ts`) — there are no passwords, credentials, tokens, or session
  expiry. This is fine for a demo and disqualifying for production.
- **`localStorage`-only persistence.** Single browser, single user, no concurrency, no
  durability guarantees. Clearing browser data or site storage discards all tickets, users,
  audit history, and configuration permanently.
- **The client is not an authorization boundary.** All permission and workflow-legality checks
  run in the browser; a determined user with dev tools can bypass them. A real backend must
  re-enforce everything.
- **`/app/profile` and `/app/settings` no longer exist (decision D01).** They were removed rather
  than built out: Profile had no business decision to support ahead of real auth, and Settings was
  nav-gated only by `VIEW_PROFILE` — a permission everyone held — with no route guard at all, so
  the recorded plan to host sysadmin System Configuration there would have shipped org config and
  feature flags to every user. That surface now lives at **`/admin/system`**, guarded by
  `SYSTEM_CONFIGURATION`: a business-calendar editor plus a read-only feature-flag list. This
  removal conflicts with `INFORMATION_ARCHITECTURE.md` §17, which still lists Profile as one of 15
  canonical pages — an open decision for the stakeholder, noted rather than silently resolved.
- **Test coverage is domain- and service-level only.** 116 passing unit tests cover the pure-logic
  domain engines plus service-layer governance and storage behaviour. There are no component
  tests, no integration tests, no end-to-end tests, no screen-reader/axe accessibility audit, and
  no Lighthouse/performance profiling.
- **Audit log is bounded** — append-only but capped at 1000 entries, with older entries silently
  evicted once the cap is reached — not the durable, long-retention store the business
  requirements call for (see above).
- **Timezone is not honoured.** `slaEngine.ts` uses native `Date.getHours()`/`getDay()` — the host
  machine's local zone, not the configured `Europe/London` (`org.config.ts` `timezone`). Fixing
  this needs a real timezone implementation and belongs with a backend that owns an authoritative
  clock; a client clock is spoofable regardless. (Defect CFG-001's other two components —
  `workingDays` and `workingHours` being dead config — are now **fixed**: see the SLA engine bullet
  in [Architecture Summary](#architecture-summary). `holidays[]` is likewise no longer reserved —
  it is read and genuinely excluded from business time via the injected `BusinessCalendar`.)
- **No auto-close job.** The 7-day auto-close and its day-5 warning (BR-044/BR-094) are specified
  but not implemented; nothing ever invokes the `system` actor.
- **Two categories marked `provisional: true`** in `src/config/routes.config.ts`: 'Status and
  Final Documentation' and 'Academic Status Updates' (OQ-25 / OQ-26 unratified).
- **Duplicate Academics field schema.** Separately, 'Status Module' and 'Student Module' share an
  identical field set (`ACA_MODULE_FIELDS`) — an open question in its own right — but neither is
  marked provisional.
- **Attachments live inline in `localStorage`** as base64 `data:` URLs — see
  [Future Backend Notes](#future-backend-notes); this is workable at prototype scale (limits now
  centralised in `src/config/attachments.config.ts` `ATTACHMENT_LIMITS`: 1 MB/file, 3/ticket, a
  4 MB store-wide budget across all tickets, and a PDF/PNG/JPEG MIME allow-list, all enforced in
  the service) and not a real storage strategy.
- **Silent write failure on quota overflow (defect ST-001) — fixed.** `StorageAdapter.write`/
  `.append` now return `boolean` instead of swallowing a failed write; `TicketRepository.save` and
  every `ticketService` persist path check the result and fail loudly rather than reporting false
  success.
- **No multi-organisation support.** `OrgConfig` is a single global object; nothing in its shape
  strictly blocks adding an `orgId` later, but no such support exists today.

**Verdict** (from `../ticketing-system/docs/ENTERPRISE_QA_STRATEGY.md`): this prototype is
**not production-ready and was never intended to be** — it is ready for **UAT and stakeholder
demonstration**.

## Version Information

- **Current version:** `0.5.0-prototype`
- **Single source of truth:** the `version` field in `package.json`. It is injected into the
  client bundle at build time via Vite's `define` (`vite.config.ts` and, in parallel,
  `vitest.config.ts` for tests) as the global constant `__APP_VERSION__`, declared in
  `src/vite-env.d.ts` and re-exported as `APP_VERSION` from `src/config/org.config.ts`. It is
  displayed in the sidebar footer (`src/components/shell/Sidebar.tsx`) as `v0.5.0-prototype`.
  There is deliberately no second hand-maintained version literal anywhere in the app.
- **No git history.** Neither this repository nor `../ticketing-system` is a git repository (no
  `.git` directory in either) — there are no commits, tags, or releases to reference. Version
  history prior to this file is tracked only informally through the phased build process
  documented in `../ticketing-system/docs/` (phase-0 through the current phase).

## Related Documentation

Deeper, audience-specific guides live in `../ticketing-system/docs/`:

| Guide | Audience |
|---|---|
| `DEVELOPER_GUIDE.md` | Engineers extending this codebase |
| `USER_GUIDE.md` | End users (requesters and department staff) |
| `ADMINISTRATOR_GUIDE.md` | Sysadmins / SUPER_ADMIN users |
| `CONFIGURATION_GUIDE.md` | Editing `src/config/*` (departments, routes, SLA policy, etc.) |
| `BACKEND_HANDOFF.md` | The proposed contract for a future backend team |
| `DEPLOYMENT_STRATEGY.md` | Options for deploying the static build |
| `KNOWLEDGE_TRANSFER.md` | Onboarding / project handover notes |

Business and architecture specifications: `BUSINESS_REQUIREMENTS_SPECIFICATION.md`,
`BUSINESS_DOMAIN_MODEL.md`, `PROJECT_CONSTITUTION.md`, `FRONTEND_ARCHITECTURE.md`,
`DYNAMIC_TICKETING_ENGINE.md`, `ENTERPRISE_QA_STRATEGY.md`, and the phase specs
(`phase-0-functional-spec.md` onward), all in the same `docs/` directory.
