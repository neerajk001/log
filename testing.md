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
- **Lift service tests:** client request-ID validation, exact retry replay,
  distinct identical sets, ownership-safe conflicts, concurrent UUID
  collisions, numeric serialization, and database readiness timeouts.
- Test runner: Vitest.

## Frontend

- Manual QA against `docs/requirements.md` acceptance criteria per phase
  is sufficient for MVP. Automated component/E2E tests are explicitly
  post-MVP — do not spend Phase 1-3 budget on Detox/Maestro setup.

## Lift logging regression checklist

Verify on Expo web and at least one native target:

- Editing/saving one planned set leaves every sibling row unchanged.
- Multiple identical weight×reps sets each persist once.
- Immediate blur saves the final typed value; debounce plus blur creates one set.
- Concurrent set saves may resolve out of order without moving values/statuses.
- A failed save retains values and exposes row-local Retry.
- Retrying after a committed-but-lost response does not duplicate the set.
- Collapse/reopen and refresh do not erase or duplicate active drafts.

## Integration tests (real database) — release-confidence gate

`tests/integration/` boots the **real Express app against a real Postgres**.
Only `requireAuth` is mocked (it maps the `x-test-user-id` header to
`req.userId`); routing, validation, services, Prisma and ownership checks are
the production code paths.

They self-skip unless `TEST_DATABASE_URL` is set, so local unit runs are
unchanged. Safety rails:

- `TEST_DATABASE_URL` must not equal the application `DATABASE_URL`
  (helpers throw otherwise) — tests never touch the Neon production database.
- CI sets `VITEST_REQUIRE_DB=1`, so a missing test URL **fails** the run
  instead of silently skipping.

Run locally against a scratch Postgres:

```bash
docker run -d --name log-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=log_test -p 55432:5432 postgres:16
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/log_test?sslmode=disable" npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/log_test?sslmode=disable" VITEST_REQUIRE_DB=1 npm test
```

Current coverage: meal ledger + idempotency + concurrent creates (atomic
increment regression), lift replay/conflict/isolation, daily-log upsert +
isolation, weekly verdict compute/persist/scoping, coach provider-outage SSE
path (no assistant row stored), and coach session/message isolation across two
accounts.

## AI evaluations (meal accuracy)

`evals/` is a standalone harness (not part of the build or CI):

```bash
npx tsx evals/runMealEval.ts                          # score the shipped sample predictions
npx tsx evals/runMealEval.ts --predictions my.jsonl   # score captured predictions
npx tsx evals/runMealEval.ts --live                   # call the configured provider (costs credits)
```

It scores per-case kcal/protein error, item recall and invented items against
`evals/mealDataset.json`, and exits non-zero when any acceptance gate fails
(±15% kcal on ≥70% of cases, ±20% protein on ≥75%, invented-item rate ≤2%,
item recall ≥80%). The dataset's ground-truth numbers are explicit
placeholders — re-adjudicate against IFCT/USDA before publishing an accuracy
claim. The scorer itself is unit-tested in `tests/mealEval.test.ts`.

## What must be tested before Phase 3 is considered done

Every acceptance criterion listed in `docs/requirements.md` R1-R6 must be
manually verified end-to-end on a real device/simulator, plus the
`verdictEngine.ts` unit tests passing for all 4 branches.
