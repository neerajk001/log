# Phase 1 — Core Logging Loop

Goal: a user can sign up, log in, and log daily weight/calories/protein/
sleep and manual lifts, with data persisted correctly. No plan import, no
trends, no verdict yet — those are Phase 2 and 3.

Status: **code complete**. Implemented on Prisma (see `database.md`) — the
original Drizzle plan was replaced with Prisma during Phase 1.

## Backend tasks

- [x] Scaffold `log-app-backend` per `architecture.md` folder structure
- [x] Set up Neon connection (`db/client.ts`), Prisma schema for `users`,
      `daily_logs`, `lift_logs` (per `database.md`)
- [x] Generate and run initial migration
- [x] Implement `middleware/auth.ts` (Clerk verification + user
      provisioning) — see `auth.md`
- [x] Implement `middleware/errorHandler.ts` with the response shape in
      `api.md`
- [x] Implement routes: `GET /health`, `GET /api/me`, `PUT /api/me`,
      `GET /api/logs/daily/:date`, `PUT /api/logs/daily/:date`,
      `GET /api/logs/daily?from&to`, `POST /api/logs/lift`,
      `GET /api/logs/lift?exercise&weeks`
- [x] Zod validation schemas for all above routes

## Mobile tasks

- [x] Scaffold `log-app-mobile` (Expo Router, folder structure per
      `architecture.md`)
- [x] Integrate Clerk (`ClerkProvider`, sign-in screen, auth gating)
- [x] Implement `src/theme/` tokens per `design-system.md`
- [x] Build **Today screen**: weight/calorie/protein/sleep fields with
      previous-day placeholder pre-fill, auto-save on blur, optimistic UI
- [x] Build **Lift screen (manual entry only for this phase)**: exercise
      name input, weight × reps, save
- [x] Build bottom tab bar shell with all 5 tabs (Trends/Verdict/Plan can
      be placeholder screens for now)
- [x] API client functions in `src/api/` for all Phase 1 endpoints

## Deployment tasks

- [ ] Provision VPS, Nginx, PM2, Certbot per `deployment.md`
- [ ] First deploy of backend, confirm `/health` reachable over HTTPS
- [ ] Confirm mobile dev build can reach the deployed API

## Acceptance criteria (must all pass before Phase 2)

- R1.1–R1.4 (auth) — see `requirements.md`
- R2.1–R2.4 (daily log)
- R3.1, R3.3 (lift log, manual path only — R3.2 plan-aware behavior is
  Phase 2)
- R7, R8 (logging speed, no feature blocks core loop)
