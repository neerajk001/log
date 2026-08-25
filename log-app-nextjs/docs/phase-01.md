# Phase 1 — Core Logging Loop (Next.js)

Goal: a user can sign up, log in, and log daily weight/calories/protein/
sleep and manual lifts, with data persisted correctly. No plan import, no
trends, no verdict yet — those are Phase 2 and 3. This is the Next.js
re-plan of the original Phase 1 (see root `phase-01.md`).

## Backend tasks (Next.js Route Handlers)

- [ ] Scaffold `log-app-nextjs` per `architecture.md` folder structure
- [ ] Set up Neon connection (`lib/db/client.ts`), Prisma schema for
      `users`, `daily_logs`, `lift_logs` (per `database.md`)
- [ ] Generate and run initial migration
- [ ] Implement `middleware.ts` (Clerk middleware) — see `auth.md`
- [ ] Implement `lib/auth.ts` (Clerk session → local user resolution +
      provisioning, R1.3)
- [ ] Implement `lib/error.ts` mapping known error types to the `api.md`
      response shape
- [ ] Implement Route Handlers: `GET /api/health`, `GET /api/me`,
      `PUT /api/me`, `GET /api/logs/daily/[date]`,
      `PUT /api/logs/daily/[date]`, `GET /api/logs/daily` (range),
      `POST /api/logs/lift`, `GET /api/logs/lift`
- [ ] Zod validation schemas for all above routes (`lib/validation/schemas.ts`)

## Frontend tasks (Next.js App Router)

- [ ] Scaffold Next.js app (App Router, Tailwind, `next/font` for the three
      families) per `architecture.md`
- [ ] Integrate Clerk (`<ClerkProvider>` in root layout, sign-in pages,
      auth gating via the `(app)` layout)
- [ ] Implement `src/theme/` tokens per `design-system.md` (mapped into
      Tailwind config)
- [ ] Build **Today screen** (`app/(app)/today/page.tsx`): weight/calorie/
      protein/sleep fields with previous-day placeholder pre-fill,
      auto-save on blur, optimistic UI
- [ ] Build **Lift screen** (manual entry only for this phase):
      exercise name input, weight × reps, save
- [ ] Build bottom tab bar shell with all 5 tabs (Trends/Verdict/Plan can
      be placeholder screens for now)
- [ ] API client functions in `src/api/` for all Phase 1 endpoints

## Deployment tasks

- [ ] Choose hosting option (Vercel or VPS) per `deployment.md`
- [ ] First deploy, confirm `/api/health` reachable over HTTPS
- [ ] Confirm the app loads and can reach the deployed API

## Acceptance criteria (must all pass before Phase 2)

- R1.1–R1.4 (auth) — see `requirements.md`
- R2.1–R2.4 (daily log)
- R3.1, R3.3 (lift log, manual path only — R3.2 plan-aware behavior is
  Phase 2)
- R7, R8 (logging speed, no feature blocks core loop)
