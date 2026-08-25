# Testing

MVP testing scope is deliberately narrow — cover what's cheap to test and
high-value to get right; do not build a large test suite before the core
loop is validated by real usage.

## Backend

- **Unit tests (required, Phase 3):** `verdictEngine.ts` — this is a pure
  function and the highest-value thing to test. Write fixtures covering
  each of the 4 rule branches in `docs/backend.md`, plus edge cases
  (missing data for part of the week, exactly-boundary values like
  -0.8kg/wk).
- **Unit tests (required, Phase 2):** `planParser.ts` output validation —
  test that malformed/unexpected model output is correctly rejected as
  `PARSE_FAILED` rather than silently passed through.
- **Integration tests (recommended, not blocking MVP):** `supertest`
  against key routes (`/api/logs/daily/:date` upsert behavior, auth
  rejection on missing token) using a test Neon branch or local Postgres.
- Test runner: Vitest.

## Frontend

- Manual QA against `docs/requirements.md` acceptance criteria per phase
  is sufficient for MVP. Automated component/E2E tests are explicitly
  post-MVP — do not spend Phase 1-3 budget on Detox/Maestro setup.

## What must be tested before Phase 3 is considered done

Every acceptance criterion listed in `docs/requirements.md` R1-R6 must be
manually verified end-to-end on a real device/simulator, plus the
`verdictEngine.ts` unit tests passing for all 4 branches.
