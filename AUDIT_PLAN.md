# Audit Plan — Log App

Baseline (2026-10-15):
- Backend: `vitest run` 11 files / 191 tests PASS; `tsc --noEmit` clean.
- Mobile: `tsc --noEmit` clean.
- Git: clean except `M .commandcode/taste/taste.md` (unrelated); no commit/push per rules.

Scope: two apps, one architecture. Mobile never talks to Neon/Gemini directly.
Source of truth: `docs/*.md` + `phase-*.md`. Do not invent endpoints/tables/screens.

## Feature inventory (audit order = severity first, then core-flow order)

| # | Feature | Backend surface | Mobile surface | Priority | Rationale |
|---|---------|----------------|----------------|----------|-----------|
| 1 | Lift logging + idempotency | `routes/liftLogs.ts`, `services/liftLogs.ts`, `validation/schemas.ts` (lift) | `app/(tabs)/lift.tsx`, `src/hooks/useLiftLogs.ts`, `src/components/ExerciseRow.tsx`, `src/api/liftLogs.ts` | **P0 — fix first** | Data integrity: duplicate sets corrupt trends + verdict. Confirmed unstable idempotency key in `ExerciseRow`. |
| 2 | Auth + user scoping | `middleware/auth.ts`, `app.ts` (clerkMiddleware), all `where: {userId}` | `_layout.tsx`, `src/api/client.ts` (token, 401 path) | P0 | Security foundation; verify every query scoped, no client `user_id`, token never logged. |
| 3 | AI coach streaming + cost guards | `routes/coach.ts`, `services/coach.ts`, `services/coachDecisions.ts`, `middleware/rateLimit.ts` | `app/coach/*`, `src/hooks/useCoachChat.ts`, `src/api/coach.ts` | P0 | Security/cost: prompt injection, SSE error path, timeouts, unbounded `foodCache`, file-size 500 vs 413. |
| 4 | Meal photo analyze | `routes/meals.ts` (`receiveImage`), `services/coach.ts` (`analyzeMeal`) | `src/api/meals.ts`, meal sheets | P1 | Correct 413 path exists here — use as reference fix for coach `/analyze`. Unvalidated `description`/`date`. |
| 5 | Plan import (AI parsing, server-only key) | `routes/plans.ts`, `services/planParser.ts`, `services/planRotation.ts` | `app/plan/*`, `src/state/parsedPlan.ts` | P1 | Server-only Gemini/OpenAI key; oversized PDF; verbatim AI JSON (XSS contract); volatile pending-plan singleton. |
| 6 | Daily log (weight/nutrition/sleep) | `routes/dailyLogs.ts`, `routes/activityLogs.ts` | `app/(tabs)/today.tsx`, `src/hooks/useTodayLog.ts`, sheets | P1 | Core input to verdict; retry banner drops N-1 fields; `take:5000` no pagination. |
| 7 | Weekly verdict (rule-based, deterministic) | `routes/verdict.ts`, `services/verdictEngine.ts` | `app/verdict.tsx`, `src/hooks/useWeeklyVerdict.ts` | P1 | The product: GET-with-write + ledger race; UTC vs local week; silent `catch {}` on ledger. |
| 8 | Trends + insights perf | `routes/trends.ts`, `services/trends.ts`, lift metrics/summary | `app/(tabs)/insights.tsx`, `src/hooks/useInsights.ts`, `useTrends.ts` | P2 | Perf: fan-out (8 GETs Today, dual trends), `getLiftMetrics` correctness, cache races/over-invalidation. |
| 9 | Onboarding + config hygiene | `routes/users.ts` | `app/onboarding/*`, `src/state/onboarding.ts`, `eas.json`, `app.json`, `.env*` | P2 | Prod ships `pk_test`; `RECORD_AUDIO` unjustified; volatile draft; all-null payload accepted. |
| 10 | Cross-cutting: errors, cache, a11y | `middleware/errorHandler.ts`, `middleware/validate.ts`, `src/api/cache.ts`, `src/api/client.ts` | Global | P2 | `validate.ts` `Object.assign(req.query)`; 401 `clearAllCache` no broadcast; SSE bypasses 401 path. |

## Per-feature checklist (applies to each feature)

- Invalid inputs, empty data, boundary values (0, max, malformed UUID/date).
- Duplicate requests (double-tap, timeout-retry, idempotency keys).
- Network failures (timeout, abort, offline) + optimistic rollback.
- Permissions (unauth, cross-user IDOR, expired token).
- Race conditions (concurrent writes, focus-refetch vs inflight).
- Measurable perf (slow queries, N+1, over-fetch, re-render, bundle).

## Rules

- One feature at a time. Highest severity first.
- Minimal, safe changes. No new deps, no speculative refactors, no UI redesign.
- Never expose secrets; no destructive prod ops; no commit/push/deploy without permission.
- Distinguish CONFIRMED bugs (reproduced or code-proven) from SUSPECTED issues.
- Verify every fix: relevant tests + `tsc --noEmit` (+ lint/build where applicable). Never claim success without verification.
- Stop for user review after each feature.
