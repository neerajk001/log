# Phase 2 — Workout Plan Import (Next.js)

Goal: users can import a workout plan (AI-parsed or manual), and the Lift
screen becomes plan-aware — showing today's exercises as tap-to-log cards.
Prerequisite: Phase 1 acceptance criteria all passing. This is the Next.js
re-plan of the original Phase 2 (see root `phase-02.md`).

## Backend tasks (Next.js Route Handlers)

- [ ] Schema: `workout_plans`, `plan_days` (present in the Prisma schema
      from Phase 1 — no new migration required)
- [ ] Implement `lib/services/planParser.ts` — OpenAI API call, fixed
      prompt, zod validation of model output against the schema in `api.md`
- [ ] Implement `POST /api/plans/parse` (text and PDF text-extraction
      input) — no persistence, returns parsed preview
- [ ] Implement `POST /api/plans` (persist confirmed plan, deactivate any
      prior active plan)
- [ ] Implement `GET /api/plans`, `GET /api/plans/[id]/today` (day rotation
      logic in `lib/services/planRotation.ts`, documented in `backend.md`)
- [ ] Rate limiting on `/api/plans/parse` per `security.md`
- [ ] Unit tests for `planParser.ts` output validation and `planRotation.ts`
      (reject malformed model output; correct day resolution) per
      `testing.md` — Vitest

## Frontend tasks (Next.js App Router)

- [ ] Build **Plan screen** (`app/(app)/plan/page.tsx`): paste text / upload
      PDF → call `/api/plans/parse` → editable preview (per-exercise edit)
      → confirm → `POST /api/plans`
- [ ] Update **Lift screen**: fetch `/api/plans/[id]/today`; if a plan day
      resolves, show exercise cards (tap-to-log, done-state styling per
      `design-system.md`); manual-entry fallback always visible (R3.3)
- [ ] Handle parse failure state (R4.5): clear error message + manual entry
      fallback, never a dead end

## Deployment tasks

- [ ] Add `OPENAI_API_KEY` / `OPENAI_MODEL` to the hosting env (Vercel
      dashboard or VPS `.env`)
- [ ] Redeploy; confirm plan parse works end-to-end

## Acceptance criteria (must all pass before Phase 3)

- R4.1–R4.5 (plan import) — see `requirements.md`
- R3.2 (plan-aware lift logging)
- R8 (plan failures never block core daily/lift logging)
