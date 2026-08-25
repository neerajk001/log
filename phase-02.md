# Phase 2 — Workout Plan Import

Goal: users can import a workout plan (AI-parsed or manual), and the Lift
screen becomes plan-aware — showing today's exercises as tap-to-log cards.

Prerequisite: Phase 1 acceptance criteria all passing.

Status: **code complete**. Backend and mobile implemented; acceptance
criteria below still need manual QA on a device.

## Backend tasks

- [x] Schema: `workout_plans`, `plan_days` (already present in the Prisma
      schema and initial migration — no new migration required)
- [x] Implement `services/planParser.ts` — Google Gemini API call, fixed
      prompt, zod validation of model output against the schema in
      `api.md`
- [x] Implement `POST /api/plans/parse` (text and PDF text-extraction
      input) — no persistence, returns parsed preview
- [x] Implement `POST /api/plans` (persist confirmed plan, deactivate any
      prior active plan)
- [x] Implement `GET /api/plans`, `GET /api/plans/:id/today` (day
      rotation logic in `services/planRotation.ts`, documented in
      `backend.md`)
- [x] Rate limiting on `/api/plans/parse` per `security.md`
- [x] Unit tests for `planParser.ts` output validation (reject malformed
      model output) per `testing.md` — `tests/planParser.test.ts`, Vitest

## Mobile tasks

- [x] Build **Plan screen**: paste text / upload PDF → call
      `/api/plans/parse` → editable preview (per-exercise edit) →
      confirm → `POST /api/plans`
- [x] Update **Lift screen**: fetch `/api/plans/:id/today`; if a plan day
      resolves, show exercise cards (tap-to-log, done-state styling per
      `design-system.md`); manual-entry fallback always visible (R3.3)
- [x] Handle parse failure state (R4.5): clear error message + manual
      entry fallback, never a dead end

## Acceptance criteria (must all pass before Phase 3)

- R4.1–R4.5 (plan import) — see `requirements.md`
- R3.2 (plan-aware lift logging)
- R8 (plan failures never block core daily/lift logging)
