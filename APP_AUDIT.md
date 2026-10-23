# APP_AUDIT.md — Log App Full Application Audit

**Audit date:** 2026-10-23  
**Commit audited:** `ba95297` (`fix(insights): show lift progress on overview`)  
**Scope:** `log-app-backend` (Express/Prisma/Postgres/Clerk/AI), `log-app-mobile` (Expo/React Native), GitHub Actions, Docker/VPS deployment, EAS/OTA, root documentation.  
**Mode:** Read-only audit. No application code was modified. This file is the only deliverable added.

## Legend

- **[CONFIRMED]** — proven by code inspection, schema/migration read, configuration read, or a reproducible command.
- **[SUSPECTED]** — strongly indicated by code, but requires a device, database, production environment, or concurrency repro.
- **[BLOCKED]** — cannot be verified from this machine (VPS `.env`, Nginx state, EAS environment, real device behavior).
- Severity: **Critical** = wrong core product output, data corruption, security/availability exposure, or unrecoverable production failure. **High** = significant data loss, broken workflow, security/reliability risk. **Medium** = material bug or hardening gap. **Low** = polish/latent risk.

## Baseline verification performed

| Check | Result |
|---|---|
| Backend build (`npm run build`) | PASS |
| Backend tests (`npm test`) | 22 files passed, 1 skipped; **326 tests passed, 10 skipped** |
| Backend integration tests | Skipped locally because `TEST_DATABASE_URL` is unset; CI runs them with `VITEST_REQUIRE_DB=1` |
| Mobile TypeScript (`npx tsc --noEmit`) | PASS |
| Mobile lint (`npm run lint`) | PASS (0 errors) |
| Backend dependency audit (`npm audit --omit=dev`) | **3 vulnerabilities:** 1 critical (`proxy-addr`), 1 high (`multer`), 1 moderate (`qs`) |
| Mobile dependency audit (`pnpm audit --prod`) | **39 vulnerabilities:** 1 critical (`shell-quote` via React DevTools), 27 high, 11 moderate; mostly Expo CLI/build/devtools transitives, plus Clerk runtime advisories |
| Git state | Clean except pre-existing `M .commandcode/taste/taste.md` |

The previous `AUDIT_FINDINGS.md`, `AUDIT_PLAN.md`, `AUDIT_PROGRESS.md`, and `PERFORMANCE_AUDIT.md` were read as historical context. Several statements in them are now stale (for example, “committed secrets”, Gemini provider, old test counts). This audit supersedes them for current state.

---

# 1. Executive summary

The app is functionally broad and the backend has meaningful unit/service coverage, but the audit found **five critical issues** and several high-severity data-loss/security gaps:

1. **The weekly verdict’s per-exercise strength trend is wrong.** `routes/verdict.ts` computes the same global top set for every exercise instead of filtering by exercise name. One heavy lift can make every exercise look “up” or “down”, changing the core product verdict. **[CONFIRMED]**
2. **Logging from a past date on Today writes lifts and meals to today.** The selected date is used for daily metrics/activity but not threaded into Lift or meal chat. Historical data is written to the wrong day. **[CONFIRMED]**
3. **Plan round-trips silently discard plate mode and prescribed targets.** Editing one day, duplicating a plan, or accepting a coach plan update rebuilds exercises as `{name, sets, reps}` and drops `load_mode`, `plate_config`, `weight_kg`, and `set_targets`. **[CONFIRMED]**
4. **Preview and production appear to share one API while using different Clerk instances.** One backend cannot validate both a test and live Clerk token. Depending on the VPS secret, one channel is broken, or internal preview users write production data. Runtime secret pairing is **[BLOCKED]**, but the repository configuration conflict is **[CONFIRMED]**.
5. **The backend deployment has no rollback, no documented DB backup/PITR, and migrates before the health gate while pruning the previous image.** A bad migration or release may be unrecoverable. **[CONFIRMED]**

Strong points found: every data route uses `requireAuth`; no client-supplied `user_id` trust or SQL injection was found; deleted/updated rows are generally scoped to `userId`; plate/bodyweight sets are excluded from kg volume/PRs by design; migrations and `schema.prisma` agree; the integrate suite exercises real routes/Prisma when run in CI.

---

# 2. Actual architecture and stack

| Layer | Actual implementation |
|---|---|
| Mobile | Expo SDK 57, React Native 0.86, Expo Router, TypeScript, custom theme, Clerk Expo |
| Backend | Node 22, Express 5, TypeScript, Prisma 6 + `@prisma/adapter-pg`, Postgres (Supabase in local `.env`; docs say Neon) |
| Auth | Clerk JWT verification; local `users` row provisioned on first authenticated request |
| AI | Plan import uses OpenAI Responses; coach/meals use an OpenAI-Responses-compatible provider (defaults to DeepSeek model IDs / Command Code base URL) |
| Deployment | GitHub Actions → SSH → Docker Compose on VPS; EAS Update (preview channel) via GitHub Actions |
| Observability | In-process Prometheus text registry, request timing logs, optional Sentry, optional PostHog |
| Data model | 13 Prisma models; users, daily logs, lift logs, plans/days, weekly verdicts, meals, activity, coach profile/messages/sessions/memories/decisions |

**Documentation is not the source of truth at this commit.** `AGENTS.md`, `architecture.md`, `backend.md`, `requirements.md`, `security.md`, `api.md`, `database.md`, `frontend.md`, and `user-flows.md` contain material drift. See §8.

---

# 3. Feature inventory and audit status

| # | Feature | Backend surface | Mobile surface | Status |
|---|---|---|---|---|
| 1 | Auth, first-login provisioning, user isolation | `middleware/auth.ts`, `routes/users.ts` | `app/_layout.tsx`, `sign-in.tsx`, onboarding | Audited — email sign-up missing; env separation risk; no real-token mobile tests |
| 2 | Onboarding, coach profile, settings | `routes/users.ts`, `routes/coach.ts` | `app/onboarding/*`, `app/coach/onboarding.tsx`, `settings.tsx` | Audited — profile field-wipe bug; validation gaps; non-optimistic toggles |
| 3 | Daily log (weight/calories/protein/sleep) | `routes/dailyLogs.ts` | `today.tsx`, `useTodayLog`, `MetricCard`, `NutritionCard` | Audited — wrong-source/meal-ledger conflict; decimal/0 handling; stale date data |
| 4 | Activity log | `routes/activityLogs.ts` | `ActivitySheet`, `useActivity` | Audited — pending-delete bug; zero automated tests |
| 5 | Lift logging: kg, bodyweight, plate | `routes/liftLogs.ts`, `services/liftLogs.ts`, `validation/schemas.ts` | `lift.tsx`, `ExerciseRow` | Audited — seeded autosave/blur bug; quick-log plate bug; plate bounds not enforced |
| 6 | Recent exercises, last-session cue, prefill | `getLiftSummary` | `useRecentExercises`, `ExerciseRow` | Audited — unbounded history scans; plate history misclassified in quick log |
| 7 | Lift progress card + detail (new) | `services/liftProgress.ts`, `/lift/progress` | `insights.tsx`, `app/lift-progress/*` | Audited — range/error/loading issues; unbounded endpoint; mixed-mode ambiguity |
| 8 | Insights / trends / PRs / streak | `routes/trends.ts`, `getLiftMetrics` | `insights.tsx`, `useInsights`, `useTrends` | Audited — 1Y nutrition break; windowed “all time”; streak/adherence labels; refetch fan-out |
| 9 | Workout plans: import/parse, preview, edit, duplicate, activate, delete, rotation | `routes/plans.ts`, `planParser.ts`, `planRotation.ts` | `app/plan/*`, `PlanDaysEditor`, `usePlans`, `usePlanToday` | Audited — metadata loss; active-plan races; parser/upload issues; hidden inactive plans |
| 10 | History timeline + calendar | `routes/liftLogs.ts`, `routes/dailyLogs.ts`, `routes/activityLogs.ts` | `history.tsx`, `useHistory`, `CalendarMonth` | Audited — calendar/range mismatch; 5,000-row truncation; future months |
| 11 | Weekly verdict | `routes/verdict.ts`, `verdictEngine.ts` | `verdict.tsx`, `useWeeklyVerdict` | **Audited — Critical per-exercise bug; trackWeight bug; decimal overflow risk** |
| 12 | Meals (manual, AI text, photo, CRUD, daily ledger) | `routes/meals.ts`, `services/meals.ts`, coach meal tools | `NutritionCard`, `MealSheet`, `MealsSheet`, coach photo flow | Audited — ledger/manual overwrite; totals untrusted; validation 500s; ephemeral photo proposals |
| 13 | AI coach chat, tools, proposals | `routes/coach.ts`, `services/coach.ts` | `app/coach/*`, `CoachChat`, `ProposalCard`, `useCoachChat` | Audited — profile wipe; plan-update data loss; chat retry/window; accessibility; stale cache |
| 14 | Coach memory/decisions | `services/coachDecisions.ts`, coach tools | `coach/memory.tsx` | Audited — ledger check-then-act; UTC date labels; ledger failure visibility |
| 15 | Plan generation / physique analysis | `routes/coach.ts`, `services/coach.ts` | `coach/onboarding.tsx` | Audited — AI optionality/config; profile save behavior |
| 16 | Settings/theme/haptics/feature flags | `routes/users.ts` | `settings.tsx`, theme context | Audited — flags not enforced; save UI; status-bar issues |
| 17 | Health/readiness/metrics | `app.ts`, `db/readiness.ts`, `metricRegistry` | N/A | Audited — metric cardinality; readiness timeout; docs say only `/health` public |
| 18 | CI/CD, Docker, EAS OTA | `.github/workflows/*`, `Dockerfile`, `docker-compose.yml`, `eas.json` | N/A | Audited — env separation, rollback/backups, PR CI, OTA native guard, port binding |
| 19 | Cross-cutting: auth, validation, errors, cache, accessibility, performance | all layers | all layers | Audited — see §§4–7 |

No feature was intentionally omitted. Unverified items are listed in §9.

---

# 4. Findings

## 4.1 Critical

### C-01 — Weekly verdict computes every exercise’s strength trend from the global top set

**Status:** CONFIRMED  
**Evidence:** `log-app-backend/src/routes/verdict.ts:126-131`

```ts
const perExercise: PerExerciseDelta[] = exerciseNames.map((name) => ({
  name,
  thisWeekKg: topSetByWeek(liftLogs, currentWeekStart, addDays(currentWeekStart, 7)),
  lastWeekKg: topSetByWeek(liftLogs, previousWeekStart, currentWeekStart),
}));
```

`topSetByWeek` (`verdict.ts:34-48`) scans all sets in the week, not the sets for `name`. Every exercise receives the same global maximum.

**Impact:** If the heaviest lift rose, every exercise looks “up”; if it fell, every exercise looks “down”. `computeStrengthTrend` then counts `up >= 2` or `down >= 2` across duplicated values (`verdictEngine.ts:112-131`), producing false `check_recovery`, `adjust_calories`, or `hold` verdicts. This directly violates R5.2/R6 and disagrees with `/api/trends`, which groups per exercise correctly.

**Recommended fix:** Filter `liftLogs` by exercise before calling `topSetByWeek`, or build a `Map<exercise, rows>` and compute per group.  
**Regression tests:** two exercises moving in opposite directions; one exercise moving >2.5% and another flat; plate/bodyweight rows must not satisfy kg strength; route-level test through `/api/verdict/weekly`.

### C-02 — Logging from a past date on Today writes lifts and meals to today

**Status:** CONFIRMED  
**Evidence:**
- `log-app-mobile/app/(tabs)/today.tsx:162-170` — `goLiftDay(dayId)` passes only `dayId`; `goLogMeal()` passes only `agent: "meal"`.
- `log-app-mobile/app/(tabs)/lift.tsx:52,57,69,330` — Lift always uses `useCurrentDate()` and `useLiftLogs(today)`; every `ExerciseRow` gets `date={today}`.
- `log-app-mobile/src/components/coach/CoachChat.tsx:145,150` and `useCoachChat.ts:149` — meal analysis/proposals use `todayLocal()`.
- `today.tsx` date selection is real (`setActiveDate`), and daily/activity saves honor it.

**Impact:** A user viewing a previous day and tapping “Log lift” or “Log meal” writes to today. The UI strongly implies the selected day is being edited. This corrupts history, weekly verdicts, PRs, streaks, and plate progress, and can make “logged” state appear on the wrong day.

**Recommended fix:** Thread `activeDate` through Lift and meal/photo routes and hooks; pass it to `useLiftLogs`, `ExerciseRow`, quick log, `analyzeMeal`, and proposal dates. If unsupported, disable/hide lift/meal actions when `activeDate !== today` and label Lift as “today”.  
**Regression tests:** select yesterday → log a set/meal → assert row date equals yesterday; future date is blocked or handled explicitly.

### C-03 — Plan edits, duplication, and coach updates silently discard plate mode and targets

**Status:** CONFIRMED  
**Evidence:**
- `log-app-mobile/app/plan/[id]/edit-day.tsx:127-136` — every other day is rebuilt with only `name/sets/reps/weight_kg/set_targets`; `load_mode` and `plate_config` are absent.
- `log-app-mobile/app/plan/options.tsx:63-69` — duplicate sends only `name/sets/reps/weight_kg/set_targets`.
- `log-app-mobile/src/components/coach/ProposalCard.tsx:101-112` — coach plan updates build exercises from `emptyExercise()` (weight mode) and only name/sets/reps.
- `log-app-mobile/src/api/types.ts:405-414` — `plan_update` type itself omits plate fields and targets.
- `log-app-backend/src/services/coach.ts:889-927,1846-1871` — coach tool schema and handler have only name/sets/reps; the day is replaced wholesale.
- `log-app-backend/src/routes/plans.ts:383-389` — server stores the supplied exercise JSON.

**Impact:** A plate-stack exercise silently becomes a free-weight exercise. Pyramid/set targets and default weights disappear. This breaks the new plate feature and changes programming without warning. The backend also accepts the loss because it simply persists the rebuilt JSON.

**Recommended fix:** Create one shared plan-exercise serializer/merge function that preserves all optional fields (`load_mode`, `plate_config`, `weight_kg`, `set_targets`, `rationale`) for untouched exercises and coach patches. Extend `CoachProposal` and the coach tool schema or merge by exercise name.  
**Regression tests:** plate plan → edit another day → reload → plate intact; duplicate → plate intact; coach “add one set” to a plate/pyramid exercise → all metadata intact; full-plan replacement behavior documented.

### C-04 — Preview and production share one API with different Clerk instances

**Status:** CONFIRMED config conflict; runtime `.env` pairing BLOCKED  
**Evidence:**
- `log-app-mobile/eas.json:13-14` — preview points at `https://api.neerajx.site` and uses a `pk_test_...` Clerk key.
- `eas.json:22-25` — production uses the same API URL; live Clerk key is expected from EAS environment.
- `.github/workflows/mobile-update.yml:86-89` — preview OTA also targets the production API and prefers the live Clerk key secret.
- `log-app-backend/src/config/index.ts:9-12` — exactly one `CLERK_SECRET_KEY`.
- `deployment.md` describes one VPS and one database; no staging stack.

**Impact:** A Clerk development instance and production instance issue different keys. One backend secret cannot validate both. If the VPS uses `sk_test`, production `pk_live` builds cannot authenticate. If it uses `sk_live`, preview testers authenticate against **production Clerk/API/database**. Either outcome is unacceptable.

**Recommended fix:** Add a staging API + staging Postgres/Neon branch + test Clerk instance for preview. Point preview/EAS preview/mobile-update preview at staging. Add a CI assertion that refuses mismatched channel/API/Clerk-instance combinations.  
**Verification required:** inspect VPS `.env` and EAS environment; do not assume which secret is deployed.

### C-05 — Production deploy has no rollback or documented DB backup/restore

**Status:** CONFIRMED  
**Evidence:** `.github/workflows/backend-deploy.yml:103-123` — `git pull` → `docker compose build` → `prisma migrate deploy` → `up -d` → `sleep 8` → local health/ready → `docker image prune -f`; image is always `param-api:latest` (`docker-compose.yml:9`). `deployment.md` has no backup/PITR/restore/rollback runbook. Migrations run before the health gate.

**Impact:** A failed migration or bad release can leave the API down; the previous image is pruned; there is no tested restore path. A partially applied migration may be unrecoverable without a backup.

**Recommended fix:** Tag images by commit SHA, retain N−1, deploy immutable tags, gate with `docker compose up -d --wait` and public HTTPS checks, take/verify a DB backup or PITR before migration, add a rollback job and restore drill. Use `git fetch && git reset --hard origin/main` (or a clean checkout) to avoid deploying dirty VPS state.

## 4.2 High

### H-01 — Partial coach-profile save nulls unrelated fields and can wipe sex/age

**Status:** CONFIRMED  
**Evidence:** `log-app-backend/src/routes/coach.ts:99-118` builds every field with `d.x ?? null` and upserts; mobile `app/coach/onboarding.tsx:160-171` omits `sex`/`age` from its payload. `useCoachProfile` exposes `error`, but onboarding destructures only `profile/loading/loaded/save` (`onboarding.tsx:109-128`), so a failed GET mounts a blank wizard; saving it PUTs nulls over the profile.

**Impact:** Data loss of health/profile fields, permanently degrading coaching. A network blip can wipe the profile.

**Recommended fix:** Use `undefined`-means-skip on PUT (as `users.ts` does), allow explicit `null` to clear. Include `sex`/`age` in mobile payload. Add an error state and block the wizard/save when the initial load failed.  
**Test:** one-field PUT preserves all other fields; failed initial GET cannot save.

### H-02 — Meal ledger and manual daily-macro writes overwrite each other

**Status:** CONFIRMED  
**Evidence:** `log-app-backend/src/services/meals.ts:108-129` atomically adds/subtracts meal deltas in `daily_logs`; `log-app-backend/src/routes/dailyLogs.ts:79-103` performs an absolute upsert of `calories`/`protein_g`. Mobile `today.tsx:113-126` prefers daily values and falls back to meal sums; `NutritionCard` edits daily fields directly.

**Impact:** Concurrent or sequential manual macro edits can erase meal contributions while `meal_logs` rows remain. Deleting a meal then subtracts from an already-overwritten total and clamps at zero, losing manual data. The Today card, meal totals, trends, and verdict can disagree.

**Recommended fix:** Choose one source of truth. Store manual macros separately (`manual_calories`, `manual_protein`) plus meal-derived totals; expose the sum. Or make meal rows the only macro writer and treat manual edits as an explicit adjustment. Use a transaction/version column, not absolute overwrite.  
**Test:** meal + manual edit + meal delete; daily totals and meal sum remain consistent.

### H-03 — Seeded lift rows can log themselves on blur; partial values autosave

**Status:** CONFIRMED  
**Evidence:** `log-app-mobile/src/components/ExerciseRow.tsx:209-260` seeds every row from the previous session. `handleBlur` (`:375-385`) always commits unless another row is focused; `patchDraft` (`:351-366`) starts a 1.2s autosave timer on any text change. There is no dirty/prefilled flag. `canLogDraft` (`:66-72`) accepts seeded positives.

**Impact:** Merely tapping a prefilled field and dismissing the keyboard can log a set without a deliberate action. Typing `60` can autosave `6` after 1.2s. This corrupts volume, PRs, plate progress, and the verdict.

**Recommended fix:** Treat seeded values as placeholders until the athlete edits or taps the checkmark; only autosave after `onChangeText`; clear/restart timers on unmount; consider a longer debounce and an “unsaved/saved” explicit state.  
**Test:** open a prefilled row, focus/blur without typing → no POST; type `6` then `0` slowly → only `60` saved.

### H-04 — Quick log misclassifies plate history as bodyweight and cannot log plate sets

**Status:** CONFIRMED  
**Evidence:** `log-app-mobile/app/(tabs)/lift.tsx:122-136` infers mode with `last.every(set => set.weight_kg == null) ? "bw" : "kg"` — plate sets have null weight, so they become bodyweight. `quickLog` (`:151-211`) has no position/increment/unit fields and always sends `plan_day_id: null`; only `weight_kg/reps` are sent.

**Impact:** A recent machine exercise is logged as bodyweight with no position. It cannot feed plate progress and can create mixed-mode sessions.

**Recommended fix:** Infer plate mode from `lastSetsByExercise`/plan config; add a Machine stack quick mode with position and calibration; include `plate_position`, `plate_increment`, `plate_unit`; or hide plate exercises from quick suggestions and route to the plan row.

### H-05 — Unauthenticated metric label cardinality can grow memory without bound

**Status:** CONFIRMED  
**Evidence:** `log-app-backend/src/app.ts:42` installs `requestTiming` before Clerk/auth and before `/api` 404 handling; `middleware/requestTiming.ts:21-32` labels counters/histograms with `redactPath(req.originalUrl)`; `utils/perf.ts:12-19` only redacts UUID/long-hex segments and strips query strings; `utils/metricRegistry.ts:95-120` stores every distinct label set forever with no cap/eviction.

**Impact:** An unauthenticated client can request unique paths (`/x-<random>` or `/api/logs/daily/<non-uuid>`) and create a new counter + histogram + log line per request. This is metric poisoning, log flooding, and an OOM/availability risk. Date-bearing paths are also retained, weakening the privacy contract.

**Recommended fix:** Use the matched route pattern after routing (`req.route?.path`) for known routes and a fixed `unmatched` label; cap/evict series; allowlist coach tool names; add a test that unknown paths do not grow cardinality.

### H-06 — Multipart endpoints buffer unbounded non-file fields

**Status:** CONFIRMED  
**Evidence:** `log-app-backend/src/app.ts:55-58` bypasses `express.json` for multipart. `routes/plans.ts:29-39`, `routes/meals.ts:35-45`, `routes/coach.ts:21-31` set only `fileSize` in Multer limits. Busboy defaults `fields`, `files`, and `parts` to `Infinity` (verified in installed `busboy/lib/types/multipart.js`).

**Impact:** An authenticated user can send an allowed file plus thousands of text parts (each up to the 1 MB default field limit), buffered into memory. Per-user 10/hr limits do not prevent one oversized request. Process OOM is possible.

**Recommended fix:** Set `limits: { fileSize, files: 1, fields: N, parts: N, fieldSize: ... }` on every Multer instance; reject unknown fields; add a body-size/timeout guard at Nginx and Express.

### H-07 — Malformed/oversized JSON returns 500 instead of 400/413

**Status:** CONFIRMED code path  
**Evidence:** `log-app-backend/src/app.ts:55-58` uses `express.json({ limit: "1mb" })`; `middleware/errorHandler.ts:14-31` maps only `AppError`, so body-parser `SyntaxError`/`PayloadTooLargeError`/charset errors become `500 SERVER_ERROR`.

**Impact:** Clients retry invalid requests, monitoring gets false 5xx, and the API contract is broken for common failures.

**Recommended fix:** Map body-parser/`http-errors` statuses (400/413/415) in the error handler; add tests for invalid JSON, oversize JSON, and unsupported charset.

### H-08 — Sensitive health data can reach server logs and Sentry on errors

**Status:** CONFIRMED  
**Evidence:** `middleware/errorHandler.ts:20-24` logs the full error object; `routes/coach.ts:316` logs full unexpected coach errors; `sentry.ts:25-33` deletes only auth/cookie headers, not `event.request.data`/query/body. Sentry’s request-data integration copies body data by default.

**Impact:** On errors, request bodies can include weight, calories, meal items, plan text, coach notes, or lift history. These can reach VPS logs and Sentry, contradicting the privacy intent in `security.md`.

**Recommended fix:** Disable request-body capture (`sendDefaultPii: false` plus explicit `requestData` scrubbing), log only safe metadata/stack, audit Prisma error messages, and redact known health fields. Add a test that error logging does not include request body values.

### H-09 — The 1Y nutrition window requests 104 weeks, which the server rejects

**Status:** CONFIRMED  
**Evidence:** `log-app-mobile/app/(tabs)/insights.tsx:154` calls `useTrends(range, nutritionWeeks * 2)`; `NUTRITION_WINDOWS` includes `52` weeks (`:92`). The server schema caps `weeks` at 52 (`log-app-backend/src/validation/schemas.ts:301`). The client clamps only the expected bucket count (`insights.tsx:194-206`), not the request.

**Impact:** Selecting 1Y causes HTTP 400 for the main trends request; cached 26-week data can be relabeled as “Last year”; the second 7-day trends call also fails silently. The card can show an error/empty or stale numbers.

**Recommended fix:** Request `Math.min(nutritionWeeks * 2, 52)` and define the previous-year comparison separately; surface the second trends error or reuse the first response; test every nutrition window.

### H-10 — Email sign-up is not implemented (R1.1)

**Status:** CONFIRMED absence  
**Evidence:** `log-app-mobile/app/sign-in.tsx:14,25,99-146` imports/uses `useSignIn` and `useSSO`; repo-wide search finds no `useSignUp`/`signUp.create`. `requirements.md:8` requires email sign-up; `auth.md` claims Clerk hosted UI handles it.

**Impact:** New email users cannot create accounts through the app; revenue acquisition depends on Google SSO. The UI labels options “Sign in”, not “Create account”.

**Recommended fix:** Add Clerk `useSignUp` email-code flow or Clerk hosted AuthView, with “Create account” and “No account found” handling; add a new-user → local `users` row → Today test.

### H-11 — Missing AI key prevents the whole API from booting (R8)

**Status:** CONFIRMED  
**Evidence:** `log-app-backend/src/config/index.ts` `collectMissingRuntimeConfig` requires `ai.apiKey`; `src/index.ts:5-6` validates before `listen`. The coach is additive, and R8 says AI errors must never block daily/lift logging.

**Impact:** A key rotation/oops/lapse that removes the env var stops the entire API, including core logging. (An expired key alone returns AI errors, not a boot failure.)

**Recommended fix:** Make AI optional at boot, warn, start the API, and return `503 COACH_UNAVAILABLE` for AI routes; keep DB/core readiness independent. Add a config test.

### H-12 — No PR CI; mobile has zero automated tests

**Status:** CONFIRMED  
**Evidence:** `.github/workflows/backend-deploy.yml:13-19` and `mobile-update.yml:19-31` run only on `push: main`/manual; no `pull_request`. Mobile `package.json` has no test script/deps; `mobile-update.yml:63-64` runs only `tsc`. Backend tests are not typechecked by `tsc` (`tsconfig` includes `src` only).

**Impact:** Merges can deploy untested changes. Mobile idempotency, cache invalidation, plate parsing, date propagation, optimistic rollback, and coach streaming have no regression coverage.

**Recommended fix:** Add PR workflows (install, typecheck, lint, tests, migration drift, Docker build, mobile bundle). Require them in branch protection. Add Jest/RNTL for pure utils/hooks first, then Maestro/Detox E2E for auth, daily log, kg/bodyweight/plate logging, plan import, and coach retry.

### H-13 — Lift metrics/progress windows are unbounded

**Status:** CONFIRMED  
**Evidence:** `validation/schemas.ts:286-295` validates only date strings; `routes/liftLogs.ts:121-173` passes them directly; `services/liftLogs.ts:247-253` and `services/liftProgress.ts:146-164` run `findMany` with no range cap/take. `assertRangeSize` is used by other list routes but not these.

**Impact:** An authenticated user can force a scan of years of lift history and a very large progress response, causing self-DoS/DB load and mobile payload problems. Normal 1Y requests already return up to a point per session per exercise.

**Recommended fix:** Add schema refinements (ordered windows, `prev_to < from`, equal lengths, max span e.g. 730 days), call `assertRangeSize`, cap points, and aggregate long ranges weekly/monthly.

### H-14 — `getLiftSummary` performs two unbounded history scans

**Status:** CONFIRMED  
**Evidence:** `services/liftLogs.ts:349-365` — `lastByExercise` has only `date: { lt: before }` and no `take`; Prisma `distinct` may dedupe in memory. `sessionRows` fetches every set of the 12 exercises across up to 730 days, then keeps only the newest session (20 sets).

**Impact:** The Lift screen and every set write pay for a scan that grows with account age; the payload is small but the DB/memory work is not.

**Recommended fix:** Use raw `DISTINCT ON (exercise_name)` / lateral join to find newest session dates, add `gte: from`, then fetch only those sessions; cap sets; add a multi-year performance test.

### H-15 — `track_weight=false` still feeds weigh-ins into the verdict

**Status:** CONFIRMED  
**Evidence:** `routes/verdict.ts:109-124` collects weight points unconditionally; `:169` sets `allowNoWeight` based on `trackWeight`, but `verdictEngine.ts:139-165` still computes the slope and applies weight rules when points exist.

**Impact:** A user who turned off weighing can receive `adjust_calories`/`check_recovery` from old weigh-ins, contradicting the setting and `schema.prisma` comment.

**Recommended fix:** Pass an empty weight series when `trackWeight === false` (or add an engine flag to ignore weight rules). Add a route test with two existing weigh-ins and tracking off.

### H-16 — Active-plan invariant and plan updates are not DB-safe

**Status:** CONFIRMED code / SUSPECTED concurrency behavior  
**Evidence:** `routes/plans.ts:180-206,422-438` deactivate active plans then create/activate without a lock or partial unique index; `schema.prisma` has only `@@index([userId])` for `isActive`. `PUT /:id` reads days then deletes/updates/creates with no version/lock (`plans.ts:353-396`).

**Impact:** Concurrent creates/activations can leave multiple active plans; concurrent edits can duplicate/lose days. `findFirst({isActive:true})` then picks arbitrarily.

**Recommended fix:** Add a partial unique index `(user_id) WHERE is_active`; use `SELECT ... FOR UPDATE`/advisory lock or a single activate transaction; add `updated_at` optimistic concurrency; unique `(plan_id, day_order)`.

### H-17 — `GET /api/logs/lift` ignores `from`/`to` when `exercise` is supplied and allows one-sided ranges

**Status:** CONFIRMED  
**Evidence:** `routes/liftLogs.ts:74-96`: `if (exercise)` uses only `weeks`/`gte`; `from`/`to`/`days` are ignored. If only `from` is supplied, only `gte` is applied; if only `to`, only `lte`. `assertRangeSize` validates the intended `to` but does not apply the upper bound.

**Impact:** Documented range behavior is wrong; clients can receive far more rows than requested or future rows. The 5,000 cap can silently truncate.

**Recommended fix:** Define filter precedence; apply both bounds; reject conflicting params; test `exercise+from/to`, from-only, to-only, and future dates.

### H-18 — Coach history returns the oldest 200 messages

**Status:** CONFIRMED  
**Evidence:** `routes/coach.ts:167-172` orders `createdAt: "asc"` with `take: 200`.

**Impact:** Chats longer than 200 turns lose all newer messages after reopening. No pagination.

**Recommended fix:** Fetch newest 200 (`orderBy desc`, reverse) or cursor pagination; update `api.md`; add a >200-message test.

### H-19 — Dependencies include critical/high advisories

**Status:** CONFIRMED (audit output; exploitability contextual)  
**Evidence:** Backend `npm audit --omit=dev`: critical `proxy-addr` (IP spoofing; app uses `app.set("trust proxy", 1)` at `app.ts:27`), high `multer` (multiple DoS/limit-bypass advisories; directly used), moderate `qs`. Mobile `pnpm audit --prod`: 1 critical (`shell-quote` via React DevTools), 27 high, 11 moderate; includes a high Clerk authorization-bypass advisory for `@clerk/clerk-expo` 2.19.23 (patched 2.19.36) and many Expo CLI/devtools transitives.

**Impact:** `multer` is directly exposed to upload endpoints. `proxy-addr`/trust proxy may affect IP handling. Clerk advisory relevance depends on organization/billing/reverification usage. Build-time Expo CLI advisories are lower runtime risk but should be patched.

**Recommended fix:** Upgrade `multer`, Express/`proxy-addr`, `qs`, Clerk, Expo toolchain; run audit in PR CI; verify `trust proxy` count matches the actual proxy chain; add upload abuse tests.

### H-20 — Docker publishes the API on all interfaces and runs as root; Nginx hardening is not in the repo

**Status:** CONFIRMED compose/Dockerfile; Nginx state BLOCKED  
**Evidence:** `docker-compose.yml:18-19` binds `${PORT}:${PORT}` (0.0.0.0); `Dockerfile:20-33` never switches user; `deployment.md` documents only SSE buffering/timeouts; no `client_max_body_size` or full Nginx template is checked in; `PERFORMANCE_AUDIT.md` records a live inspection with default 60s/no body override.

**Impact:** Clients may bypass TLS/Nginx if the firewall permits; container compromise has root; 5 MB uploads and 120s AI calls can be cut by Nginx defaults.

**Recommended fix:** Bind `127.0.0.1:${PORT}:${PORT}`, add `USER node`, check in a hardened Nginx template (`client_max_body_size 6m`, long AI timeouts, SSE off, HSTS, `/metrics` IP restriction), and firewall the port.

## 4.3 Medium

| ID | Finding | Evidence | Impact / fix |
|---|---|---|---|
| M-01 | Plate update can leave half-populated calibration | `liftLogUpdateSchema` allows `plate_increment: null` with `plate_unit` omitted; `updateLiftLog` writes fields independently (`services/liftLogs.ts:160-169`) | Violates “both or neither”; resolve effective pair, clear both on explicit null; test both directions |
| M-02 | Meal `protein_g` accepts non-integers but DB is `Int` | `schemas.ts:116`; `schema.prisma:230`; generic 500 in `errorHandler` | Add `.int()` / bounds; test 12.5 → 400 |
| M-03 | Meal totals are not checked against item sums | `schemas.ts:109-118`; `services/meals.ts:163-183` | Items can say 240 kcal while total says 10,000; compute server-side or enforce tolerance |
| M-04 | Plan update/create races can duplicate/lose days or leave two active plans | `routes/plans.ts:180-206,353-396,422-438`; no lock/version/unique active | Add partial unique index, row lock/version, `(plan_id, day_order)` unique |
| M-05 | Future-dated logs are accepted and enter coach context | `dateString` accepts any date; coach queries use only `gte` (`coach.ts:219-267`) | Reject future writes or cap every read at today; test coach recent/PR exclusion |
| M-06 | `getLiftMetrics` returns previous-only exercises with zero current sets | `services/liftLogs.ts:263-300`; mobile PR card filters best_kg but can show prior-window lift as “All time” | Return only current-window exercises with a `has_current` flag; align with progress endpoint |
| M-07 | `/ready` timeout does not cancel the DB query | `db/readiness.ts:9-16` races a `query()` with a timer but never aborts it | Pending `SELECT 1` can consume pool slots during incidents; use query timeout/cancellable client or single-flight |
| M-08 | No index on `lift_logs.plan_day_id` | `schema.prisma:73-75`; FK is `ON DELETE SET NULL` | Plan/day deletion can scan the whole table; add concurrent index |
| M-09 | Coach dossier cache not invalidated on writes | `services/coach.ts:172-209` 60s cache; only meal context uncached | Stale weight/intake/plan advice within TTL; invalidate per-resource or version cache |
| M-10 | `PUT /api/me` and onboarding return 500 if the local user row is missing | `routes/users.ts:66-85,113-137`; generic Prisma error | Map `P2025` to 401/404; match `GET /me` contract |
| M-11 | Weekly verdict trend can overflow `Decimal(4,2)` | `schema.prisma:115`; raw slope in `verdictEngine.ts:160-165`; weights up to 999 kg | Clamp or widen column; boundary test |
| M-12 | Plate positions are not validated against plan bounds | `createLiftLogIdempotent` never reads `plate_config`; schema allows 1–999 | Impossible/out-of-range positions can rank in progress; validate when plan_day/exercise is known or document UI-only |
| M-13 | `GET /api/plans` and coach plan tools load every plan with all days | `routes/plans.ts:224-228`; `coach.ts:1822-1828,1377-1380` | Response/tool context bloat; paginate, limit recent plans, resolve by id/name |
| M-14 | Date-scoped hooks retain the previous date’s data while loading; `useMeals` has no generation guard | `useTodayLog.ts:38-54`; `useLiftLogs.ts:34-48`; `useActivity.ts:15-30`; `useMeals.ts:13-24`; `usePlanToday.ts:16,45` | Wrong-day values can render; a slow old meal response can permanently overwrite a newer date; clear/key state and add `useLatest` |
| M-15 | Sending while coach history loads can lose the message/reply | `useCoachChat.ts:66-99` replaces history; `CoachChat.tsx:93-108` allows send while `loading`; load errors have no retry | Disable composer until load, merge/append, generation guard, retry |
| M-16 | “One meal thread per day” breaks at midnight | `app/coach/new.tsx:46-54` resolves session once via `resolvedRef`; key rotates at `:63` but resolution does not | Post-midnight chat continues yesterday’s meal thread; reset ref when `today` changes |
| M-17 | Photo meal proposals are ephemeral | `CoachChat.tsx:133-201`; `useCoachChat.ts:309-331`; not persisted | Navigating away loses the unconfirmed estimate; persist text/proposal without image |
| M-18 | Proposal resolution is local-only; plan updates marked applied before save | `useCoachChat.ts:77-88,286-301`; `ProposalCard.tsx:115-116` | Reopened chats can re-confirm applied cards; plan card claims success before preview save; persist/derive status |
| M-19 | Lift-progress card has no loading/error UI; detail resets range | `insights.tsx:145` destructures only data/refetch; `lift-progress/index.tsx:35-47`; `detail.tsx:52` | Card shows “Log the same exercise…” on loading/error; 1Y selection is lost when opening detail; pass range/state, gate empty on !error |
| M-20 | Verdict entry disappears when weight tracking is on but trend is null | `insights.tsx:292-294,356`; `verdict.tsx:40-41,75-78` supports insufficient data | Users with sparse weigh-ins cannot reach the only verdict screen; show entry anyway with insufficient-data copy |
| M-21 | “Personal records · All time” is windowed and excludes plate/bodyweight | `insights.tsx:856-860`; `getLiftMetrics` only current+previous; `metrics.ts:38-53` filters best_kg | Mislabeled and incomplete; add all-time PR endpoint or relabel “Best in range” and include modes |
| M-22 | Adherence tile mixes range and current-week data | `insights.tsx:290,408-409`; backend `trends.ts:310-326` always current week | 1Y shows this week’s adherence next to a year denominator; label “This week” or compute range adherence |
| M-23 | Consistency streak capped by selected range | `useInsights.ts:55-77`; metrics days only from range | 7D default cannot show a streak >7; compute server-side or fetch fixed lookback |
| M-24 | History “All time” truncates at 5,000 rows | `history.tsx:28-33`; lift/activity routes `take: 5000` | List and stats disagree; paginate or disclose cap |
| M-25 | Plan fallback/invisible plans confuse active state | `usePlans.ts:32-34` falls back to `plans[0]`; `usePlanToday.ts:28-35` requires active; duplicate creates inactive copies with no plan list | Plan tab can edit a non-active plan while Lift says no plan; add selector/active-state handling |
| M-26 | Settings switches/rest-day chips are not optimistic and can drop rapid taps | `settings.tsx:54-57,77-84,200-253` | UI lag and lost selection; local optimistic state + serialized merge |
| M-27 | Quick-log parsing accepts malformed values and misses max | `lift.tsx:162-163` uses `parseFloat`/`parseInt`; only checks >0 | `60abc` accepted; 9,999 max not enforced; use shared strict parsers |
| M-28 | Metric tiles save on every blur; haptic precedes async save | `MetricCard.tsx:66-83` | Unnecessary invalidations; offline save feels successful; dirty-check and await result |
| M-29 | Read-only AI POSTs invalidate write caches | `client.ts:203-245` invalidates for every POST; parse/analyze/coach plan are read-only | Refetch/flicker on mounted screens; add `invalidate:false` per request |
| M-30 | Request timeout covers headers, not body | `client.ts:94-126` clears timer after `fetch` resolves; body read later | Server can stall after headers and leave UI loading forever; keep signal until body complete |
| M-31 | Error and empty states render together on several screens | `plan.tsx:67-94`; `verdict.tsx:72-135`; `history.tsx:174,230-245`; `lift-progress/index.tsx:68-77`; `detail.tsx:97-106`; coach sessions/memory | Users see “couldn’t load” and “nothing logged” simultaneously; gate empty on `!error` |
| M-32 | Plan validation is inconsistent; edit-day allows invalid sets/empty days | `PlanDaysEditor` can remove last exercise; `preview` lacks min-1 check; `edit-day.tsx:91` uses `parseInt`/`isNaN` | Generic server 400 or silent truncation; one shared validator with positive ints |
| M-33 | Onboarding accepts invalid numbers and fails at the last step | `basics.tsx:30` only non-empty; `state/onboarding.ts:53-60` uses `Number` for height | `abc` → null weight, fractional/out-of-range height; inline validation |
| M-34 | Nutrition card allows decimal macros; API requires integers | `NutritionCard.tsx:34` `parsePositiveNumber`; `dailyLogSchema` ints | 2100.5 fails with generic banner; use integer parser |
| M-35 | Deleting a pending optimistic activity does not delete the saved row | `useActivity.ts:48-51,65-68` | Local removal, POST completes, row reappears; disable or delete after create resolves |
| M-36 | Coach chat missing token throws plain Error, not 401 ApiError | `api/coach.ts:103`; `useCoachChat.ts:217-222` | Signed-out chat shows bubble error, no sign-out/cache clear; throw `ApiError(401)` |
| M-37 | Offline cold start blocks all read-only screens | `app/_layout.tsx:76-118` waits for `/me`; cache in-memory only | No read-only access on cold start; persist last profile/onboarded state and cached data with offline banner |
| M-38 | Onboarding steps 2–3 can show dark status-bar icons on black | `_layout.tsx:163` uses app theme; only welcome/intro/account override status bar | Light-theme device gets dark-on-black; set light status bar in onboarding layout |
| M-39 | Accessibility gaps in forms, sheets, buttons, charts | `controls.tsx:148-158,232-243`; `ExerciseRow.tsx:790-802`; `primitives.tsx:68-88`; `controls.tsx:260-288`; `CalendarMonth.tsx:56-63`; `charts.tsx` | Missing input labels, button label disappears while loading, no modal focus trap, no chart alternatives; add labels/live regions/summaries |
| M-40 | 1Y “Sets per week” plots only 13 weeks | `useInsights.ts:72-75` always `weeklySetSeries(...,13)`; `insights.tsx` says 12 months | Misleading chart; use 52 buckets or relabel |
| M-41 | Duplicate exercise names in one plan share keys/state | `lift.tsx:313,316`; `ExerciseRow.tsx:170` use name-based keys/scope | Both rows share logged sets/expansion; include exercise index in key/scope |
| M-42 | AI-coach toggle does not gate all coach entry points | `settings.tsx:217-232`; `today.tsx:168-170,323`; `plan.tsx:77-80`; `import.tsx:213-218` | Disabled coach still reachable via meal/plan flows; gate consistently or make meal logging independent |
| M-43 | Plan import drops plan/day rationale and per-set rep targets | `import.tsx:26-54,70-73`; `PlanDaysEditor`/`planTargets.ts:36-48` only weight targets | AI/imported rationale and rep pyramids lost; carry fields end-to-end or document limitation |
| M-44 | Rate limiting is in-memory; no pre-auth IP limiting | `middleware/rateLimit.ts:14-54`; single container assumption; no global auth limiter | Limits reset on deploy; unauth floods are cheap but can still hit middleware/logs; add Nginx/IP limiter, Redis only if scaling |
| M-45 | No graceful shutdown or query timeout | `src/index.ts:12-14`; `db/client.ts:109-144` intentionally no `statement_timeout` | Deploys cut SSE/writes; stuck queries can exhaust the 20-connection pool; add shutdown + timeout |

## 4.4 Low

- **L-01** History can navigate into future months (`history.tsx:203-205`) with an empty view.
- **L-02** Coach session/memory/decision dates use UTC slices while daily threads use local dates; off-by-one for non-UTC users (`coach/sessions.tsx:62`; `coach/memory.tsx:69,102`).
- **L-03** `MealSheet`/`ActivitySheet` retain previous draft/error after close and remain editable while saving; `Sheet` is not scrollable (`controls.tsx:282-286`).
- **L-04** Meal editing can exceed server per-item caps (UI allows 10,000 kcal/1,000 g totals; server caps each item at 5,000/500).
- **L-05** `PlanDaysEditor` uses array indexes as keys and the reorder icon has no reorder implementation.
- **L-06** Plan options “Edit” opens only the first day while claiming to modify exercises/sets/days (`options.tsx:146-155`).
- **L-07** Lift “Save as Plan” only navigates to Plan; it does not save the session (`lift.tsx:350-356`).
- **L-08** Sign-in has no back affordance after `router.replace`; Google flow errors can be silent (`account.tsx:37-50`; `sign-in.tsx:77-83`).
- **L-09** Dead/duplicated API surface: `useMeals.remove` unused, `usePlans.setPlans` unused, `usePlanToday.planName` unused, `TrendsResponse.months` fetched but unrendered, `daily_defaults`/MetricCard lock props no UI.
- **L-10** No route-level error boundaries outside Today/Lift/Insights/History/Plan; coach/verdict/settings/lift-progress/onboarding rely on the default error screen.
- **L-11** `RefreshControl` on Lift/History/Insights/Plan is bound to background loading, so invalidations can show spinners without a pull.
- **L-12** `useInsights` recreates `[]` for `rest_days` when null, invalidating memoized derived metrics (`insights.tsx:141`; `useInsights.ts:55-77`).
- **L-13** `useDataSyncOnFocus` loads from both `useEffect` and `useFocusEffect`, contradicting `frontend.md`; deduped by cache/inflight but extra state transitions.
- **L-14** Lift detail fetches all exercises’ progress for one exercise (`useLiftProgress`); add an `exercise` filter/cache.
- **L-15** Lift and Today use separate plan requests (`/api/plans` and `/api/plans?active=1`) plus extra `/today` calls.
- **L-16** `useHistory` mutation error is never cleared after a later successful delete.
- **L-17** Activity notes are supported by API/model but not exposed in `ActivitySheet`.
- **L-18** `useMe.update` passes `track_weight` while `useMeApi.updateMe`’s declared type omits it (`me.ts:11-25`; `useMe.ts:58-66`).
- **L-19** `formatProgressSet`/`lastSessionSummary` can mislabel mixed kg/plate sessions as bodyweight/kg.
- **L-20** `app.json` version 1.1.1 vs `package.json` 1.0.0; no `versionCode`/`buildNumber`/bundle ID/autoIncrement.
- **L-21** Daily log schema rejects 0 calories/protein/sleep (`schemas.ts:14-19` positive), which may be legitimate.
- **L-22** `GET /api/logs/daily/:date` omits `id` while range/PUT include it (`dailyLogs.ts:61-67` vs `105-112`).
- **L-23** README is the default Expo template and references a missing `scripts/reset-project.js`.
- **L-24** Mobile dev client assumes backend port 4000 while `.env.example` says 3000; local setup confusion.
- **L-25** Unused backend config/dependency (`CLERK_PUBLISHABLE_KEY`, `uuid`); parser log prints `config.openai.model` while using `config.models.parsing`.
- **L-26** No DB CHECK constraints for plate invariants or active-plan uniqueness; API/direct-SQL paths can create invalid rows.
- **L-27** `set_targets` can exceed `sets`; plan parser `max_output_tokens: 2000` may truncate large plans.
- **L-28** `metrics` tool help says success/failure but only successful turns increment `coach_turns_total`.
- **L-29** Sentry `lift.request_id` tag uses a client-supplied UUID, adding high-cardinality identifier data.
- **L-30** `meal_update` mobile confirmation hardcodes `source: "ai"`, overwriting photo/manual provenance.

---

# 5. Security assessment

## Verified controls

- All 43 data routes use `requireAuth`; `/health`, `/ready`, and token-gated `/metrics` are the only public/operational exceptions.
- No request schema accepts `user_id`; ownership is derived from the verified Clerk subject.
- No SQL injection found; Prisma is parameterized, and the meal ledger raw SQL uses bound parameters.
- Cross-user IDOR: resource updates/deletes use `userId` in `updateMany`/`deleteMany` or a scoped composite key. No cross-user read/write was found.
- File uploads are memory-only (no disk persistence); image bytes are transient.
- CORS is locked down via `parseAllowedOrigins`.
- Rate limits exist per-user on AI/chat/plan/analyze endpoints (single-instance limitation noted).
- Sentry strips auth/cookie headers, but body redaction is insufficient (H-08).
- PostHog replay masking is explicitly configured for inputs/images and coach/meal content (device verification still required).

## Security gaps

| Severity | Gap |
|---|---|
| Critical/High | Preview/production Clerk + API/DB separation (C-04) |
| High | Unauthenticated metric label cardinality / log flooding (H-05) |
| High | Unbounded multipart fields (H-06) |
| High | Health data in logs/Sentry on errors (H-08) |
| High | Dependency advisories: `multer`, `proxy-addr`, `qs`, Clerk (H-19) |
| High | Docker port exposure / root runtime / Nginx hardening not in repo (H-20) |
| Medium | UUID existence oracle via unscoped idempotency lookups (lift/meal `findUnique({id})`) — impractical due 128-bit UUIDs, but violates the “every query scoped” rule |
| Medium | No DB constraint for one active plan; check-then-act ledger races |
| Medium | In-memory limiter and no pre-auth IP limit (H/M-44) |
| Medium | AI/meal feature flags persisted but not enforced server-side |
| Low | `/ready` and `/metrics` public/token-gated vs docs “only /health” (L-22 in security docs; see §8) |

---

# 6. Performance assessment

This audit adds current findings to `PERFORMANCE_AUDIT.md`. No new profiling was run; “measured” below means code-proven behavior, not wall-clock measurement.

## Confirmed hot spots

1. **Verdict/coach context rebuild per request** — the coach context is ~12 parallel queries per turn with a 60s cache; no write invalidation (M-09). Existing `PERFORMANCE_AUDIT.md` measured 1.7–2.7s context builds in production.
2. **Every lift write invalidates `lift`, `plans`, `trends`, `verdict`** — `api/cache.ts:45-48`. Lift/Today/Insights hooks subscribe independently, and hidden tabs remain subscribed (`useDataSync.ts`). A 5-set quick log fires five concurrent POSTs and a refetch storm.
3. **`getLiftSummary` scans unbounded history** (H-14), called on Lift open and after writes.
4. **Lift metrics/progress windows unbounded** (H-13); 1Y progress returns every session point for every exercise.
5. **`GET /api/plans` and coach plan tools load every plan with all days** (M-13).
6. **Coach plan-import/chat pipelines are sequential and slow by design** — existing performance audit found 78s TTFT decomposed into context/tools/model; this audit did not re-measure.
7. **Request timing/metric registry** is unbounded (H-05), so long-running API memory grows with attack traffic.
8. **No `statement_timeout` / graceful shutdown** (M-45); pool exhaustion during DB stalls.

## Optimizations ranked by impact

1. Fix data correctness first (C-01/C-02/C-03); performance work on corrupt data is not useful.
2. Focus-gate `useDataSync` and coalesce invalidations per animation frame/batch; stop hidden-tab refetches. Batch quick-log writes into one request or serialize.
3. Replace `getLiftSummary` with a newest-session query and one session-set fetch.
4. Cap/aggregate lift progress windows; return weekly buckets for long ranges.
5. Invalidate coach dossier cache on writes; reduce TTL or version by user.
6. Add DB indexes (`lift_logs.plan_day_id`), partial unique active-plan index, and query timeouts.
7. Decouple dashboard spinners from all-data loading; keep pull-to-refresh manual.
8. Add production telemetry (p50/p95 per route, AI TTFT, DB slow queries) before further tuning; current performance claims beyond code structure are estimates.

---

# 7. Testing gaps

## Existing coverage strengths

- Backend service tests for lift logs/idempotency/bodyweight/plate, lift progress, trends, verdict engine, meals, plan parser/rotation, coach tools/stream parsing, DB SSL/retry/readiness, config/CORS.
- Integration suite exercises real Express routes + Prisma against a scratch Postgres in CI (meals, lift logs, daily logs, verdict, coach sessions/messages, metrics, pool-kill recovery).
- Backend build/typecheck and mobile typecheck/lint are clean.

## Critical gaps

| Journey | Backend unit | Backend HTTP/integration | Mobile | Risk |
|---|---|---|---|---|
| Email sign-up / real Clerk 401 | No | No | No | R1.1, auth contract unverified |
| Cross-user isolation for plans/activity/users/lift progress/coach profile/memory/decisions | Partial | No | No | Security regression risk |
| Plan CRUD/activate/delete/today | Rotation only | No | No | High: active invariant, day loss |
| Plate stack HTTP round-trip / plan edit / quick log | Service only | No | No | Plate data loss/misclassification |
| Lift progress/metrics route validation/serialization | Service only | No | No | Range abuse, shape drift |
| Meal update/delete/analyze, upload limits, rate limits | Service/partial | Create/list only | No | Data consistency/size abuse |
| Activity CRUD | No | No | No | Entire feature untested |
| Mobile idempotency/autosave/prefill/date propagation | No | No | No | Duplicate/wrong-date sets |
| Cache invalidation/sign-out isolation/offline/rollback | No | No | No | Stale cross-account data |
| Coach retry/lost response, midnight thread, proposal persistence | Partial | No | No | Duplicate billing/lost messages |
| Accessibility/screen readers | No | No | No | Coach unusable with TalkBack |

## Required regression tests for the critical fixes

1. Verdict with two exercises moving in opposite directions; one heavy global lift must not make both “up”.
2. Today → select yesterday → log lift/meal → row date is yesterday; future date blocked.
3. Plate plan → edit another day / duplicate / coach add-set → `load_mode`, `plate_config`, `set_targets`, `weight_kg` intact.
4. Failed coach-profile GET → no blank-wizard overwrite; one-field PUT preserves all other fields.
5. Prefilled lift row focus/blur without edit → no POST; partial typing does not autosave.
6. Quick-log a recent plate exercise → position payload, not bodyweight.
7. 1Y nutrition window returns 200 and correct bucket count.
8. Unknown random paths do not increase metric series cardinality.
9. Multipart with many fields/parts is rejected with 413/400.
10. Invalid/oversize JSON returns 400/413 with stable error codes.
11. `track_weight=false` ignores existing weigh-ins in verdict.
12. Lift metrics/progress reject inverted/oversized/unequal windows.

---

# 8. Documentation drift

The repo’s own rule (`AGENTS.md`) says docs are the source of truth; at this commit they are not. Material conflicts:

| Area | Drift |
|---|---|
| AI provider | `AGENTS.md`, `architecture.md`, `requirements.md`, `backend.md`, `security.md`, `user-flows.md`, `project.mdc` say Gemini/Anthropic; code uses OpenAI Responses for plan import and Command Code/DeepSeek for coach/meals |
| Repo paths | `AGENTS.md` points to `docs/*.md` and `tasks/phase-*.md`; neither directory exists (files are at root) |
| Deployment | `AGENTS.md` says PM2/manual; actual is GitHub Actions + Docker Compose + EAS OTA |
| Database | `database.md` documents ~6 tables; schema has 13 models and many new columns (coach, meals, activity, `rationale`, `track_weight`, `daily_defaults`, `rest_days`, `onboarded_at`) |
| API | `api.md` missing meals/activity/plan PUT/activate/delete/onboarding/coach decisions; trends and coach-message response shapes are wrong; lift range semantics wrong; error-code list incomplete |
| Screens | `frontend.md`/`user-flows.md` describe `trends`/`verdict` tabs; actual tabs are `today`, `lift`, `insights`, `history`, `plan`, plus stack screens |
| Auth | `security.md` says every route except `/health` requires Clerk; `/ready` and `/metrics` are public/token-gated |
| New features | Plate stack and lift progress were added to `api.md`/`database.md` partially, but not to `requirements.md`, `product.md`, or user flows |
| Product scope | `product.md` lists food database as out of scope; `lookup_food`/Open Food Facts is implemented |
| README | Default Expo template, references missing `scripts/reset-project.js` |

**Recommendation:** Before further feature work, reconcile docs with code and delete/redirect stale files. Treat `APP_AUDIT.md` as the current technical snapshot until docs are updated.

---

# 9. Unverified / blocked items

These are explicitly not claimed as confirmed bugs:

1. **VPS `.env` Clerk secret** — whether `sk_test` or `sk_live` is deployed; C-04 runtime outcome depends on it.
2. **VPS Nginx applied config** — whether `client_max_body_size`, long AI timeouts, SSE buffering, and `/metrics` restrictions are actually live.
3. **EAS environment secrets** — production Clerk key, PostHog key/host, Sentry release; `eas.json` omits PostHog entirely and production Clerk key is external.
4. **Device behavior** — TalkBack semantics of `importantForAccessibility="no"`, nested Pressables, status-bar/icons, OTA upgrade on installed native binaries, iOS `ph://` image compression.
5. **Hidden-tab refetch amplification** — depends on React Navigation/Expo Router freeze behavior; current-screen fan-out is code-confirmed.
6. **Concurrency bugs** — multiple active plans / duplicate plan days / ledger races require concurrency repro; code paths are confirmed.
7. **Production data sizes** — 5,000-row truncation and unbounded scans were inferred from route code, not measured on a large account.
8. **Actual provider latency** — see `PERFORMANCE_AUDIT.md`; no new profiling was done in this audit.
9. **Mobile dependency exploitability** — many `pnpm audit` findings are Expo CLI/devtools build-time transitives; runtime exposure differs by bundle.
10. **No real-token integration test** — Clerk auth is mocked in `fullstack.test.ts`; production middleware verification was not exercised.

---

# 10. Prioritized remediation plan

## Phase 0 — Correctness hotfixes (before any feature work)

1. C-01: Fix per-exercise verdict aggregation; add route fixture with two opposing exercises.
2. C-02: Thread selected date through Lift/meal flows or disable past-date actions; add wrong-date regression test.
3. C-03: Shared plan-exercise merge/serializer preserving `load_mode`, `plate_config`, `weight_kg`, `set_targets`, rationale; use in edit-day, duplicate, coach proposal. Add round-trip tests.
4. H-01: Partial coach-profile PUT + error-state wizard guard; include `sex`/`age` in mobile payload.
5. H-09: Clamp nutrition weeks to 52; test all windows.
6. H-04: Plate-aware quick log or hide plate exercises from quick suggestions.
7. H-03: Dirty-state/placeholder rows; no autosave for prefilled or partial values.

**Exit criteria:** all critical data-loss/wrong-output tests pass; backend + mobile typecheck/lint/test.

## Phase 1 — Security and availability

1. H-05: Route-pattern/metric allowlist + series cap/eviction; unmatched-path test.
2. H-06: Multer `files/fields/parts/fieldSize` limits on all upload endpoints.
3. H-07: Map body-parser 400/413/415.
4. H-08: Sentry/log request-body redaction; `sendDefaultPii:false` + explicit scrub.
5. H-19: Upgrade multer/express/qs/Clerk/Expo; add `npm audit`/`pnpm audit` to PR CI.
6. H-20: Bind API to loopback, non-root container, check in hardened Nginx template.
7. H-11: AI optional at boot; 503 on AI routes only.
8. C-04: Staging API/DB/Clerk for preview; CI channel/key assertion.
9. H-13/M-08/M-45: range caps, missing index, query timeout/graceful shutdown.

**Exit criteria:** upload abuse tests, 400/413 tests, audit clean, staging auth test, load test on metric cardinality.

## Phase 2 — Data integrity and concurrency

1. H-02: Single source of truth for meal/manual macros; transaction/versioning.
2. H-16/M-04: Partial unique active-plan index; row locks/version; unique `(plan_id,day_order)`.
3. H-15: `track_weight=false` ignores weight series.
4. M-01/M-12: Plate calibration consistency + bounds validation.
5. M-05/H-17: Future-date policy and lift range filter semantics.
6. M-06/M-10/M-15…M-24: metrics window labels, Prisma error mapping, coach history newest page, active plan UI.
7. M-11: Widen/clamp verdict Decimal.

**Exit criteria:** concurrent plan/meal tests, cross-window consistency tests, two-user integration coverage for all resources.

## Phase 3 — Mobile reliability and UX

1. H-08/M-14: focus-gated data sync, coalesced invalidations, batched quick log, background spinner separation.
2. M-14/M-15/M-16/M-17/M-18: date-scoped state reset, chat loading gate, midnight session, proposal persistence.
3. H-23/M-39: accessibility labels, remove chat `importantForAccessibility="no"`, modal focus, chart alternatives.
4. M-19/M-20/M-31: progress/loading/error/empty states; verdict entry.
5. M-26/M-27/M-28/M-29/M-30/M-32/M-33/M-34/M-35: settings, parsing, cache invalidation, timeouts, form validation, activity pending delete.
6. M-25/M-40/M-41/M-42/M-43: plan state, 1Y charts, duplicate names, coach toggle, import metadata.

**Exit criteria:** mobile unit tests for utils/hooks + Maestro E2E for core journeys; accessibility smoke test.

## Phase 4 — Platform reliability and observability

1. C-05: immutable images, N−1 rollback, DB backup/PITR/restore drill, public post-deploy smoke.
2. H-12: PR CI for both apps; mobile tests; lint/audit/migration drift/Docker build in CI.
3. H-10: email sign-up.
4. H-19/H-20: dependency and container hardening.
5. Sentry release/source maps, alert rules; PostHog env per channel; scrape/retention config; uptime on `/ready`; log rotation.
6. M-44: IP/pre-auth limiter; Redis only if replicas.
7. Versioning: `versionCode`/`buildNumber`/bundle ID/autoIncrement; OTA native-change guard.

**Exit criteria:** deploy/rollback drill, staging smoke, green PR CI, alerting test.

## Phase 5 — Documentation reconciliation

1. Update `AGENTS.md`, `architecture.md`, `backend.md`, `security.md` to actual Prisma/OpenAI/DeepSeek/Docker/Actions reality.
2. Regenerate `api.md` from routes/schemas; add missing endpoints and error codes.
3. Regenerate `database.md` from `schema.prisma` (all 13 models, columns, indexes, relationships).
4. Update `frontend.md`/`user-flows.md` for actual tabs/screens/flows.
5. Add plate/lift-progress to requirements/product/user flows; decide whether they are MVP or post-MVP.
6. Replace default README; remove stale audit files or mark historical.

**Exit criteria:** docs match code; `AGENTS.md` paths valid; a new engineer can follow docs without contradictions.

---

# 11. Audit checklist status

| Checklist item | Result |
|---|---|
| Feature inventory complete | Yes — 19 areas, no skipped feature |
| Backend route inventory | Yes — 43 routes reviewed |
| Auth/user scoping | No cross-user read/write found; environment separation unverified |
| Input validation edge cases | Issues found (future dates, integer mismatches, ranges, multipart, plate bounds) |
| Idempotency/retries | Mobile/plan/coach issues found; lift service tests strong |
| Database schema/migrations | Aligned; missing index/constraints identified |
| API contract vs docs | Material drift; documented in §8 |
| Error handling | 500-on-client-error paths found |
| Security review | No injection/IDOR; dependency/logging/cardinality/env risks |
| Performance review | Static + existing audit; new unbounded scans/fan-out identified |
| Tests | Backend strong; mobile absent; critical routes untested |
| CI/CD/deployment | No PR CI; no rollback/backups; preview/prod collision |
| Accessibility | Multiple confirmed gaps |
| Documentation | Not source of truth at this commit |

---

# 12. Bottom line

The backend is the stronger half: unit/service coverage is meaningful, user scoping is generally correct, and plate/bodyweight kg exclusions are deliberate. The **core product verdict is currently wrong** because of C-01, and the newest plate/progress features have silent plan-data-loss and quick-log paths (C-03/H-04). Mobile has serious wrong-date and autosave data-integrity bugs (C-02/H-03), no automated tests, and several accessibility regressions. Production readiness is constrained by environment separation, no rollback/backups, no PR CI, and unresolved dependency/upload/metric risks.

Fix the Phase 0 correctness issues before any new feature work. Do not treat the current `api.md`/`database.md`/`AGENTS.md` as authoritative until Phase 5.

---

# 13. Remediation status (post-audit fixes, 2026-10-23)

This section records what was changed after the audit. It does not replace re-running the audit.

## Fixed in code

- **C-01** verdict per-exercise deltas; added `buildPerExerciseDeltas` tests.
- **C-02** Today now threads the selected date into Lift and the meal chat; Lift refuses future dates and shows the logging date.
- **C-03** plan edit/duplicate/coach-update preserve full exercise metadata; shared editor conversion.
- **H-01** coach profile PUT is partial-update; onboarding refuses to mount/save after a failed load.
- **H-03** prefilled lift rows no longer commit on blur; removed the 1.2s partial-value autosave.
- **H-04** plate exercises are excluded from quick-log suggestions and no longer inferred as bodyweight.
- **H-05** request metrics use matched route patterns, unmatched paths collapse, and series are capped.
- **H-06** Multer file/field/part limits added to plan/meal/coach uploads.
- **H-07** body-parser 400/413/415 mapped to API errors.
- **H-08** request bodies removed from Sentry events; unhandled logs no longer print full error/request objects.
- **H-09** 1Y nutrition no longer requests 104 weeks; 1Y sets chart uses 52 buckets.
- **H-10** email sign-up flow added (`useSignUp` + email code); “Create account” affordance.
- **H-11** AI key is optional at boot; AI routes degrade to 503.
- **H-12** PR CI workflow added (backend build/tests + mobile tsc/lint); mobile unit/E2E tests still absent.
- **H-13** lift metrics/progress windows validated and capped.
- **H-14** lift summary “last” query bounded to the recent window.
- **H-15** `track_weight=false` no longer feeds weigh-ins into the verdict.
- **H-16** plan create/update/activate serialized with a per-user advisory transaction lock.
- **H-17** lift history applies both range bounds and honours from/to with exercise.
- **H-18** coach history returns the newest 200 messages.
- **H-19** backend dependencies updated (audit now 0 vulnerabilities); Clerk upgraded to 2.20.0.
- **M-01/M-02/M-03** plate update pairing, integer protein, meal totals cross-check.
- **M-04** plan writes serialized (partial unique index still recommended).
- **M-05** coach context capped at today.
- **M-07** trends fetch window covers the selected nutrition window.
- **M-08** `lift_logs.plan_day_id` index added and applied.
- **M-10** Prisma P2025 mapped to 404.
- **M-11** verdict trend clamped to the Decimal range.
- **M-13** plan lists/tools bounded.
- **M-14** date-scoped hooks clear stale state; `useMeals` and lift writes are generation/date guarded.
- **M-15** coach send/retry blocked while history loads; load has a generation guard.
- **M-16** meal thread resolution follows the selected date.
- **M-19** lift-progress card shows loading/error; detail keeps the selected range.
- **M-20** verdict entry no longer hidden when weigh-in data is sparse.
- **M-21/M-22** “Personal records” relabelled to in-range kg bests; adherence labelled “This week”.
- **M-27** quick log uses strict positive parsers.
- **M-28** metric tiles skip no-op saves.
- **M-29** read-only AI POSTs no longer invalidate write caches.
- **M-30** request timeout now covers body reads.
- **M-31** error/empty state gating fixed on plan/verdict/lift-progress screens.
- **M-32** plan validation uses positive ints and prevents empty days/last-exercise removal.
- **M-34** nutrition macros use the integer parser.
- **M-35** deleting a pending activity now deletes the saved row after create resolves.
- **M-36** coach stream missing token throws 401.
- **M-38** onboarding status bar is light.
- **M-39** chat transcript no longer hidden from TalkBack; button/input labels improved.
- **M-41** duplicate exercise names no longer share row keys/state.
- **M-43** plan/day rationale preserved through import; per-set rep targets still not editable.
- **M-45** graceful shutdown added.

## Still open / requires owner or infrastructure

- **C-04** preview vs production Clerk/API/DB separation (needs staging infra and VPS/EAS secret changes).
- **C-05** immutable deploy images, N−1 rollback, DB backup/PITR/restore drill (needs VPS/DB provider access).
- **H-02** meal ledger vs manual macro source of truth (design decision + migration; totals now validated but the overwrite race remains).
- **H-12 (partial)** mobile automated tests/E2E still absent.
- **H-19 (partial)** remaining mobile Expo CLI/devtools transitive advisories; no runtime exploit confirmed.
- **H-20** Docker loopback binding, non-root runtime, checked-in hardened Nginx config.
- **H-04 (partial)** quick log still cannot create plate sets; plate exercises are routed away from it.
- **M-06/M-12/M-17/M-18/M-23/M-24/M-25/M-26/M-33/M-37/M-42/M-44** and most Low findings remain.
- Documentation reconciliation (Phase 5) remains.

Verification after fixes: backend build clean; **331 tests passed, 10 skipped**; mobile TypeScript and lint clean; backend `npm audit --omit=dev` reports 0 vulnerabilities.
