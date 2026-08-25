# Testing

MVP testing scope is deliberately narrow — cover what's cheap to test and
high-value to get right; do not build a large test suite before the core
loop is validated by real usage.

## Services (required)

- **Unit tests (required, Phase 3):** `lib/services/verdictEngine.ts` — this
  is a pure function and the highest-value thing to test. Write fixtures
  covering each of the 4 rule branches in `docs/backend.md`, plus edge cases
  (missing data for part of the week, exactly-boundary values like
  -0.8kg/wk).
- **Unit tests (required, Phase 2):** `lib/services/planParser.ts` output
  validation — test that malformed/unexpected model output is correctly
  rejected as `PARSE_FAILED` rather than silently passed through.
- **Unit tests (Phase 2):** `lib/services/planRotation.ts` — pure day-
  rotation function; assert correct day resolution across plan-start
  boundaries and multi-day offsets.
- Test runner: **Vitest**. Service modules are plain TS with no Next.js
  runtime dependency, so they run under Vitest directly.

## Route Handlers (recommended, not blocking MVP)

- **Integration tests (recommended):** use `supertest` (or Next.js'
  `node-mocks-http`/`route` test harness) against key Route Handlers
  (`/api/logs/daily/[date]` upsert behavior, auth rejection on missing
  session) using a test Neon branch or local Postgres.
- Test runner: Vitest with a test Prisma datasource.

## Frontend

- Manual QA against `docs/requirements.md` acceptance criteria per phase is
  sufficient for MVP. Automated component/E2E tests (Playwright) are
  explicitly post-MVP — do not spend Phase 1-3 budget on E2E setup.

## What must be tested before Phase 3 is considered done

Every acceptance criterion listed in `docs/requirements.md` R1-R6 must be
manually verified end-to-end in a browser, plus the `verdictEngine.ts`
(unit, all 4 branches) and `planParser.ts`/`planRotation.ts` unit tests
passing.
