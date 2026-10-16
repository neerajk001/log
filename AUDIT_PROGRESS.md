# Audit Progress — Log App

## Baseline (2026-10-15) — DONE
- Explored `log-app-backend/src` (29 files), `log-app-mobile` (`app/` 29 routes, `src/` ~70 files),
  `prisma/schema.prisma` (13 models), tests (11 files), deps.
- Backend `npm test`: 11 files / 191 tests PASS.
- Backend `npx tsc --noEmit`: clean.
- Mobile `npx tsc --noEmit`: clean.
- Created `AUDIT_PLAN.md`, `AUDIT_FINDINGS.md`, `AUDIT_PROGRESS.md` (this file).

## Feature 1 — Lift logging + idempotency — FIXED, reviewed
- Fix: `ExerciseRow.tsx` `patchDraft` keeps `requestId` stable. Verified mobile `tsc`/`lint` clean, backend 191 PASS.

## Feature 2 — Auth + user scoping — FIXED, reviewed
- Audited: all routes carry `requireAuth`; no client `user_id` trust; Sentry scoping verified.
- Fix applied: `services/coach.ts` history `findMany` now `where: {sessionId, userId}` (defense-in-depth, matches public route).
- Verification (2026-10-15): backend `vitest` 191 PASS; `tsc` clean.

## Feature 3 — Coach streaming + cost guards — FIXED, reviewed
- Fixes: `/analyze` 413 via `receiveImage`; `foodCache` capped at 500 (oldest-first);
  AI timeouts (60s non-streaming, 90s/stream-round, client-Stop still returns partial).
- Verification (2026-10-15): backend `tsc` clean; `vitest` 191 PASS.
- Status: reviewed.

## Feature 4 — Meal photo analyze + meal CRUD — FIXED, reviewed
- Fixes: photo `description` capped at 500 chars (both meal + physique paths);
  impossible `localDate` falls back to today instead of poisoning day-context query.
- Verification (2026-10-15): 2 new tests; backend `vitest` 193 PASS; `tsc` clean.
- Status: reviewed.

## Feature 5 — Plan import, AI parsing — FIXED, reviewed
- Fixes: parser fetch 60s timeout; non-size MulterErrors → 400; day-delete scoped
  via `plan:{userId}`; mobile `parsePlanText` 120s AI timeout.
- Verification (2026-10-15): backend `tsc` clean; mobile `tsc` clean; `vitest` 193 PASS.
- Status: reviewed.

## Feature 6 — Daily log + activity — FIXED, reviewed
- Fix: banner `retrySave()` replays all failed fields in one queued PUT (was first-only).
- Verification (2026-10-15): mobile `tsc` clean; `expo lint` clean.
- Status: reviewed.

## Feature 7 — Weekly verdict — FIXED, reviewed
- Fixes: optional `?date` (athlete-local week, backward-compatible; mobile sends
  `todayLocal()`; `api.md` updated); ledger failure now warns instead of vanishing.
- Deliberately unchanged: engine (matches docs+tests verbatim); ledger race (needs
  migration); stall-on-gain wording (product-owned, docs-encoded).
- Verification (2026-10-15): backend `tsc` clean; mobile `tsc` clean; `vitest` 193 PASS.
- Status: reviewed.

## Feature 8 — Trends + insights perf — FIXED, reviewed
- Fix: workout-day `groupBy` capped at today (future sets no longer inflate month).
- Deliberately unchanged: dual-trends (required), fan-out (bounded+cached, no measured
  bottleneck), cache races (transient+self-healing), unknown-path wipe (dead code).
- Verification (2026-10-15): backend `tsc` clean; `vitest` 193 PASS.
- Status: reviewed.

## Feature 9 — Onboarding + config hygiene — FIXED (blocked items noted), reviewed
- Fixes: removed unjustified `RECORD_AUDIO`; documented PostHog vars in `.env.example`.
- Unchanged by design: partial onboarding payloads (self-only), volatile draft (feature work).
- BLOCKED (owner only): `pk_test` in production + committed secrets — needs live-key rotation.
- Status: reviewed.

## Feature 10 — Cross-cutting — FIXED, reviewed
- Fixes: SSE 401 now signs out + clears cache (mirrors REST); 500s log full stack.
- Proven harmless (live Express 5.2.1 probe): `validate()` query-coercion drop, nil impact.
- Correct as-is: single-container in-memory limiter (no replicas in compose).
- Verification (2026-10-15): backend `tsc` clean + `vitest` 193 PASS; mobile `tsc` clean + `expo lint` clean.
- Status: reviewed — AUDIT COMPLETE (all 10 features).

## Next — audit complete
- Blocked/owner items: `pk_live` rotation; committed-secret hygiene; ledger partial-unique
  migration (cosmetic); stall-on-gain wording (docs-encoded); `OPENAI_API_KEY` boot
  requirement vs non-OpenAI provider (needs provider decision); Redis limiter (only if scaling).
