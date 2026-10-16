# Audit Findings — Log App

Legend: **[CONFIRMED]** = code-proven or reproduced. **[SUSPECTED]** = needs repro.
Severity: P0 critical (security / data loss / down) → P2 hardening.

## Feature 1 — Lift logging + idempotency (AUDITED 2026-10-15, 1 fix applied)

- **[CONFIRMED] P0 — `ExerciseRow` remints idempotency key after error → silent duplicate sets.**
  `log-app-mobile/src/components/ExerciseRow.tsx:205`:
  `const requestId = entry.status === "error" ? Crypto.randomUUID() : entry.requestId;`
  Contract elsewhere is stable keys: `app/(tabs)/lift.tsx:35-36,128-129`
  ("Stable per draft, so retrying a partial failure can't log the set twice") and
  `src/hooks/useLiftLogs.ts:66-125` (dedup by id, replay same request).
  Scenario: POST succeeds server-side, response lost (timeout) → draft `error` →
  user edits/retries → NEW uuid → backend treats as distinct set
  (`services/liftLogs.ts` allows identical sets with different IDs — covered by
  test "allows identical sets when request IDs differ") → duplicate row corrupts
  volume/PRs/verdict. Fix: keep `requestId` stable across retries (remove remint).
  Worst case after fix is a visible 409 (same ID, edited payload) instead of a
  silent duplicate — recoverable, not corrupting.
- **[SUSPECTED] P2 — theoretical UUID-oracle via client-supplied lift PK.**
  `log-app-backend/src/services/liftLogs.ts:70-87`: `findExisting` is
  `findUnique({where:{id}})` unscoped; `sameLiftRequest` then 409s on another
  user's row vs 201 on unknown ID. UUIDs are 128-bit unguessable so practical
  exploitability is ~nil, and existing test (`tests/liftLogs.test.ts:234-245`)
  encodes the 409 behavior. No change — documented, not fixed (minimal-change rule).

## Backlog (from baseline exploration — to verify feature-by-feature)

## Feature 2 — Auth + user scoping (AUDITED 2026-10-15, 1 fix applied)

- **[CONFIRMED + FIXED] P1-defense-in-depth — internal coach history query scoped by
  session only.** `log-app-backend/src/services/coach.ts:2060` was
  `where: { sessionId: session.id }`, while the public route
  (`routes/coach.ts:149`) uses `where: { sessionId, userId }`. Session ownership
  was verified just above (`findFirst {id, userId}` → 404), so not currently
  exploitable — but a future reorder could leak cross-user messages. Fix: added
  `userId` to the internal `findMany` (comment added, no behavior change for
  legitimate users). Verified: `vitest` 191 PASS, `tsc` clean.
- **[INVESTIGATED, no bug] All 51 route handlers carry `requireAuth`.**
  No public data route found. `validation/schemas.ts` contains no `user_id` field —
  no client-supplied owner trust.
- **[INVESTIGATED, no bug] Sentry `setUser` scope bleed.** `@sentry/node@11` uses
  AsyncLocalStorage isolation + `setupExpressErrorHandler(app)`; `getCurrentScope()`
  inside a request handler is request-scoped per Sentry docs. No fix.
- **[INVESTIGATED, no change] Per-request auth DB lookup (no cache).** Adds latency
  but is correct; caching `clerkUserId→userId` would be a speculative optimization
  with invalidation risk. Deferred per minimal-change rule.
- **[INVESTIGATED, no change] Unauth floods bypass per-user rate limit.** By design:
  limiter keys on `req.userId` (cost metering); unauth fails fast at JWT verify
  with no DB hit, so 401 is cheap. IP-based pre-auth limiting is a larger change —
  deferred, flagged for product review.
- **[INVESTIGATED, no change] `updateMeal`/`deleteMeal` + session `update` use
  `where: {id}` after a scoped ownership check.** Safe: `userId` is immutable so
  no TOCTOU; Prisma `update`/`delete` require a unique `where` (can't add `userId`
  without schema change). Pattern matches Prisma docs; left as-is.

## Feature 3 — AI coach streaming + cost guards (AUDITED 2026-10-15, 3 fixes applied)

- **[CONFIRMED + FIXED] P0 — `POST /api/coach/analyze` returned 500 on oversize image.**
  `routes/coach.ts` used bare `upload.single("file")`; raw `MulterError` fell through
  to generic 500, while `routes/meals.ts:120-138` (`receiveImage`) correctly maps
  `LIMIT_FILE_SIZE → 413 FILE_TOO_LARGE`. Fix: added identical `receiveImage`
  wrapper in `routes/coach.ts` and wired it into `POST /analyze`. Same 5 MB contract.
- **[CONFIRMED + FIXED] P1 — unbounded `foodCache` (process-lifetime leak).**
  `services/coach.ts:1251` was a never-evicted `Map` keyed by athlete-controlled
  query strings (two `set` sites, zero `delete`/`clear`). Fix: `MAX_FOOD_CACHE_ENTRIES=500`
  + `cacheFood()` oldest-first eviction; both `set` sites now go through it.
  Rate limit (30 chat/hr) already bounded growth rate; cap bounds total.
- **[CONFIRMED + FIXED] P1 — AI upstream `fetch` with no timeout held connections.**
  `callModel` (non-streaming: plan/physique/meal) and `streamRound` (SSE chat) only
  aborted on client disconnect. Fix: `AbortSignal.timeout(60000)` on `callModel`;
  per-round `AbortSignal.timeout(90000)` combined with the client signal via
  `AbortSignal.any()` in `streamRound`. Semantics preserved: client Stop still
  returns partial text; timeout throws `502 COACH_UNREACHABLE` (incl. mid-stream
  `TimeoutError` mapping) so a truncated reply is never stored as complete.
  Verified: `tsc` clean, `vitest` 191 PASS (fetch is stubbed in tests; signal is transparent).
- **[INVESTIGATED, no change] Stored-XSS via verbatim AI JSON.** Shape-validated but
  stored raw — safe because every render site is React Native `<Text>` (plain-text,
  no HTML interpreter). Contract already documented in `planParser.ts:136-140`.
  No fix; contract stands.
- **[INVESTIGATED, deferred] Mobile SSE bypasses `useApiClient` 401 path.**
  `src/api/coach.ts:83` uses raw `expo/fetch` (needs real `ReadableStream`); a 401
  surfaces as a chat-bubble error instead of sign-out + cache clear. Fix needs a hook
  signature change (thread `signOut`/cache-clear into the stream path) — deferred to
  Feature 10 (cross-cutting client) to keep this feature backend-only and minimal.

## Feature 4 — Meal photo analyze + meal CRUD (AUDITED 2026-10-15, 1 fix applied)

- **[CONFIRMED + FIXED] P1 — unbounded multipart `description` reached the model prompt.**
  `POST /api/meals/analyze` (`routes/meals.ts:162`) and `POST /api/coach/analyze`
  (`routes/coach.ts:310`) accepted arbitrary-length strings (multipart bypasses
  `express.json({limit:"1mb"})`); mobile sends the free-text caption verbatim
  (`CoachChat.tsx:133`). Forwarded raw into the prompt (`The athlete says/adds:`) =
  token-bill + prompt-injection surface. Fix (service-level, both callers): new
  `cleanDescription()` trims + slices to `MAX_PHOTO_DESCRIPTION=500` in
  `analyzeMeal` and `analyzePhysique`. No contract change, no client change.
- **[CONFIRMED + FIXED] P1 — regex-only `localDate` let impossible dates hit the DB.**
  `analyzeMeal` accepted anything matching `/^\d{4}-\d{2}-\d{2}$/`; `"2026-13-99"`
  passed and produced `new Date("2026-13-99T00:00:00Z")` (Invalid Date) in
  `loadMealDayContext` Prisma queries. Fix: `isCalendarDate()` (same rule as zod
  `dateString`); garbage falls back to today, matching the existing missing-date
  behavior. No new error contract.
- **[INVESTIGATED, no bug] Meal CRUD validation + ledger sync are correct.**
  `create/updateMealSchema` enforce real-calendar dates, items 1–30, per-item and
  total bounds; `update/deleteMeal` scope `{id, userId}` + transactional
  `applyDailyDelta` clamped at 0. Mobile `MealSheet` guards double-tap via `busy`,
  `useMeals.remove` rolls back on failure. No change.
- Verification: 2 new tests in `tests/coach.test.ts` (caption cap, date fallback);
  `vitest` 193 PASS (was 191); `tsc` clean.

## Feature 5 — Plan import, AI parsing (AUDITED 2026-10-15, 3 fixes applied)

- **[CONFIRMED + FIXED] P1 — `planParser` fetch with no timeout held `/parse`.**
  `services/planParser.ts:75` had no `AbortSignal.timeout`; only a client abort
  ended a hung OpenAI call (same class as Feature 3 coach timeouts). Fix:
  `signal: AbortSignal.timeout(60000)`. The existing `catch {}` already maps it to
  the friendly "unavailable" copy — no contract change (existing error-mapping test
  still passes; `fetch` is stubbed in tests).
- **[CONFIRMED + FIXED] P2 — non-size `MulterError` on `/parse` fell through to 500.**
  The inline upload middleware mapped only `LIMIT_FILE_SIZE`; any other
  `MulterError` (e.g. `LIMIT_UNEXPECTED_FILE`) reached the generic handler.
  Fix: same `Upload rejected: ${code} → 400` branch as meals/coach `receiveImage`.
  Oversize stays 400 here (not 413) — the message is explicit and mobile doesn't
  branch on the code, so no contract churn for a nuance.
- **[CONFIRMED + FIXED] P2 — `PUT /:id` day-delete unscoped.**
  `routes/plans.ts` `deleteMany({where:{id:{in:remove}}})` relied solely on the
  scoped read above. IDs are verified owned (not exploitable), but the sibling
  `DELETE /:id` scopes via `plan:{userId}` — now this one does too
  (`where:{id:{in:remove}, plan:{userId}}`). Type-correct on `deleteMany`; the
  per-day `update({where:{id}})` can't scope (Prisma unique-where) and stays as-is.
- **[CONFIRMED + FIXED] P1-mobile — `parsePlanText` used the 15s default timeout.**
  `src/api/plans.ts` sent the AI text-parse via `client.post` (15s) while the PDF
  path already had 120s via `postFormData` — slow parses surfaced as "can't reach
  the server" (same bug class as coach `generatePlan`, which already carries the
  allowance). Fix: `{timeoutMs:120_000}` on `parsePlanText`.
- **[INVESTIGATED, no bug] Rotation + trained-day inference are sound.**
  `planRotation.ts` is pure, tested, deterministic (ties → lowest `dayOrder`;
  future plan → first day; `plan_day_id` beats name matching). No change.
- **[INVESTIGATED, no change] Volatile `pendingPlan` singleton.**
  App kill loses the parsed plan (re-parse, rate-limited 10/hr) — annoying, not data
  loss (nothing user-created yet). Persisting needs serialization/hydration/staleness
  design = feature work, not a minimal fix. Documented limitation.
- **[INVESTIGATED, no change] `PUT` ignores `is_active`; AI key server-side only.**
  `is_active` in PUT is silently ignored (activate via `POST /:id/activate`) — wart,
  but changing acceptance could break clients. Gemini/OpenAI key never leaves the
  backend (only `EXPO_PUBLIC_*` reach the bundle). No change.
- Verification: backend `tsc` clean; mobile `tsc` clean; `vitest` 193 PASS.

## Feature 6 — Daily log, weight/nutrition/sleep + activity (AUDITED 2026-10-15, 1 fix applied)

- **[CONFIRMED + FIXED] P1 — retry banner replayed only the first failed field.**
  `useTodayLog.ts:116-130` stored every failed field in `retries` but `retrySave()`
  (no-arg, as wired in `today.tsx:298`) retried `Object.keys(retries)[0]` only;
  remaining fields kept invisible `fieldErrors` with no affordance. Fix: no-arg
  `retrySave()` now replays the whole `retries` map via one queued `saveMany`
  (single PUT); single-field retry path preserved. No UI/contract change.
- **[INVESTIGATED, no bug] Partial PUTs merge correctly.**
  `dailyLogSchema` all-optional + Prisma `undefined`-means-ignore on update means a
  single-field `save()` never wipes siblings; `saveQueueRef` serializes rapid
  saves; create-with-partial yields NULLs (correct: "no entry yet"). No change.
- **[INVESTIGATED, no bug] Range lists are bounded.**
  `take:5000` + `MAX_RANGE_DAYS=3650` (`utils/range.ts`) caps worst case at 3650
  rows; `assertRangeSize` rejects inverted/oversize ranges with 400. No change.
- **[INVESTIGATED, no bug] Activity double-submit guarded.**
  `ActivitySheet` `saving` + `Button loading→disabled` (`primitives.tsx:61`);
  `useMeals.remove`/activity deletes roll back on failure. No idempotency-key
  gap with user impact (server IDs; guarded UI). No change.
- Verification: mobile `tsc` clean; `expo lint` clean.

## Feature 8 — Trends + insights perf (AUDITED 2026-10-15, 1 fix applied)

- **[CONFIRMED + FIXED] P2 — workout-day `groupBy` had no upper date bound.**
  `computeTrends` capped daily logs and 2-week lifts at `todayUtcMidnight` but the
  per-day `groupBy` used `gte: historyStart` only, so a future-dated set inflated
  the current month's workout count. Fix: `lte: todayUtcMidnight`, matching every
  sibling query. No shape change; `vitest` 193 PASS.
- **[INVESTIGATED, no bug] Dual `useTrends` on Insights is required by design.**
  The ranged call yields weekly/monthly buckets; the bars always need daily 7d —
  underivable from weekly buckets. At range=7d both hooks share one cache key AND
  inflight entry (deduped to a single request). No change.
- **[INVESTIGATED, no change] Mount fan-out is bounded and cached.**
  ~8 small indexed GETs on Today, 4 on Insights; `useDataSyncOnFocus` double-fire
  (mount `useEffect` + focus effect) collapses via inflight-join + GET cache to ≤1
  request per resource. No measured bottleneck exists — per no-speculative-
  optimization rule, no staggering/prefetch change. Documented.
- **[INVESTIGATED, no change] Cache races are transient and self-healing.**
  A write racing an inflight read can briefly surface stale data, but the write's
  own `invalidateResources` notifies subscribers → immediate refetch overwrites it.
  No repro, no user report, no failing test. Fixing needs generation counters —
  invasive for a millisecond flash. Documented, not fixed.
- **[INVESTIGATED, no bug] `invalidateForWrite` unknown-path wipe is dead code.**
  Every client path matches a `PATH_RESOURCES` prefix (incl. `/analyze` suffixes
  via the `prefix/` rule). 401 `clearAllCache` without broadcast is safe: sign-out
  unmounts the tab screens via `AuthGate`, taking their `useState` with it. No change.
- **[INVESTIGATED, no bug] Date normalization is consistent.**
  All lift/daily writes store UTC-midnight `Date`s; every range read uses
  `gte/lte` midnight bounds, so `lte: end-of-day-midnight` includes exactly that
  day. `getLiftMetrics` windowing verified against its fixture suite. No change.
- Verification: backend `tsc` clean; `vitest` 193 PASS.

### Config / boot
- **[CONFIRMED by code read] P0-availability** — `validateRuntimeConfig`
  (`src/config/index.ts:83-88`) requires `OPENAI_API_KEY`, but coach falls back
  `AI_API_KEY || COMMANDCODE || OPENAI` (`services/coach.ts:515`) while plan parsing
  stays pinned to `api.openai.com` (`services/planParser.ts:75`). Deploy with only
  `AI_API_KEY` crashes at boot. Fix: require `AI_API_KEY || OPENAI_API_KEY` +
  document parser needs OpenAI key. Needs product-owner confirm on intended provider.

## Feature 9 — Onboarding + config hygiene (AUDITED 2026-10-15, 2 fixes applied)

- **[CONFIRMED + FIXED] P2 — unjustified `RECORD_AUDIO` permission.**
  `app.json:21-23` requested the microphone; repo-wide grep finds zero audio
  recording/playback usage and no audio dependency. Removed — Play-review/privacy
  win, zero code impact (takes effect on next build).
- **[CONFIRMED + FIXED] P3-docs — PostHog vars missing from `.env.example`.**
  `app/_layout.tsx:16-17` reads `EXPO_PUBLIC_POSTHOG_API_KEY/HOST`, absent from
  the example. Added (documented empty=disabled). No behavior change.
- **[INVESTIGATED, no bug] Onboarding accepts partial/all-null payloads — by design.**
  Basics screen gates Next on all fields (`ready`); the API's all-optional schema
  + "only sent fields written" (`users.ts:103-111`) supports partial updates, and a
  crafted empty payload can only under-onboard the caller themself (scoped to
  `req.userId`). `PUT /me` `onboarded` flag is a documented dev helper, same
  self-only blast radius. No change.
- **[INVESTIGATED, no change] Volatile onboarding draft.**
  App kill loses in-progress answers (must retype) — friction, not data loss
  (nothing committed until `POST /me/onboarding`). Persisting needs hydration/
  staleness design = feature work. Documented limitation.
- **[BLOCKED — needs product owner] `pk_test` ships in production.**
  `eas.json` bakes the test Clerk key into `preview` AND `production` (same in
  `.env`, committed to git). Requires a `pk_live` rotation touching secrets and
  every build — will not touch secrets without explicit permission. Also flagged:
  `.env` beside `.env.example`, committed `eas.json` key. No change.

## Feature 10 — Cross-cutting: errors, cache, auth paths (AUDITED 2026-10-15, 2 fixes applied)

- **[CONFIRMED + FIXED] P1 — coach SSE stream bypassed the 401 sign-out path.**
  `streamCoachChat` (`src/api/coach.ts`) uses raw `expo/fetch` and surfaced an
  expired session as a chat-bubble error while every REST call signs out + clears
  the cache. Fix: stream now throws `ApiError(401)` on HTTP 401; `useCoachChat`
  mirrors `useApiClient.wrap` exactly (`clearAllCache()` + `signOut()`).
  No signature changes; `tsc` + `expo lint` clean.
- **[CONFIRMED + FIXED] P3 — 500s logged message-only, no stack.**
  `errorHandler` logged `err.message`, hiding the stack from VPS logs (Sentry had
  it, but only when DSN is set). Now logs the full error. No client change.
- **[PROVEN HARMLESS, no change] `validate()` query coercion doesn't stick.**
  Live probe against Express 5.2.1 (installed version): `Object.assign(req.query,
  {n:123})` is invisible to the next middleware — the getter re-parses per access.
  So zod `coerce.number` outputs (weeks/days) are dropped app-wide. Impact: nil —
  validation itself (400 on garbage) works; every numeric consumer tolerates
  strings via JS coercion (`Math.round("30")`, `"30"*7`, subtraction). Fixing needs
  either an instance `defineProperty` hack or rewriting ~15 handlers to read a new
  property — blast radius far exceeds a nil behavior delta. Verified, not fixed.
- **[INVESTIGATED, no change] In-memory rate limiter is correct for this deploy.**
  `docker-compose.yml` runs a single `api` container (no replicas/scale) — a
  per-process map cannot diverge. Redis only matters if they scale horizontally;
  noted as a scaling precondition, not a bug. Unauth floods fail fast at JWT
  verify with no DB hit (established Feature 2). No change.

## Feature 7 — Weekly verdict, rule-based engine (AUDITED 2026-10-15, 1 fix applied)

- **[CONFIRMED + FIXED] P1 — verdict week bucketed on server UTC, never the athlete's day.**
  `GET /weekly` used `new Date()` (server UTC) while every sibling read takes the
  athlete's local date (`GET /plans/:id/today`, `/trends?date`, coach `localDate`).
  Near midnight, UTC±X athletes got the wrong ISO week (wrong window, wrong
  adherence divisor, verdict row filed under the wrong `weekStartDate`). Fix
  (backward-compatible, established precedent): optional `?date=YYYY-MM-DD`
  validated by the existing `planTodayQuerySchema` (real-calendar 400 on garbage);
  omitted → byte-identical UTC behavior. Mobile `useWeeklyVerdict` now sends
  `todayLocal()`; cache keys stay correct (`resourceForPath` matches `?` → still
  resource `verdict`, still invalidated by lift/daily/meals writes). `api.md`
  updated (2 lines) to keep the contract documented.
- **[CONFIRMED + FIXED] P2 — ledger failure swallowed silently.**
  The best-effort `catch {}` around `recordDecision` is intentional (never fail the
  verdict for the ledger) but left zero trace. Fix: `console.warn` with user id —
  no behavior change, failures now diagnosable.
- **[INVESTIGATED, no bug] Engine matches docs + tests exactly.**
  Rules 1–4 in `verdictEngine.ts` implement `backend.md` verbatim (incl. `> -0.2`
  stall bound and `verdictIsUnchanged` Decimal-slack compare); 395-line fixture
  suite pins every branch and boundary. No change.
- **[INVESTIGATED, no change] Ledger check-then-act race.**
  Concurrent GETs can double-create `verdict` decisions (no unique key). Impact is
  cosmetic (duplicate identical ledger rows the coach reads back); the verdict row
  itself is atomic (`upsert` on `@@unique[userId,weekStart]`). A real fix needs a
  DB migration (partial unique) — deferred per minimal-change rule. Documented.
- **[NOTED, product-owned] Stall rule labels weight gain as "stalled".**
  Rule 3 (`> -0.2`, docs-encoded) fires on a rising trend too ("Weight has stalled"
  while gaining). Code matches `backend.md` exactly, so per docs-win rule this is a
  product decision, not a code bug — flagged, not changed.
- Verification: backend `tsc` clean; mobile `tsc` clean; `vitest` 193 PASS
  (engine untouched; param wiring is thin and covered by schema validation).

### Daily log / verdict / trends (remaining → Features 9–10)
- **[SUSPECTED] P2** — mount fan-out; cache over-invalidation
  (see Feature 8 verdict: no change).

Out of scope for this audit unless evidence shows otherwise: offline sync engine,
gamification, social, push, web app (per `docs/product.md`).
