# Architecture

## System diagram (description)

```
[Expo React Native App]
   |  (Clerk session token attached to every request)
   v
[Express API on VPS] --(verifies token)--> [Clerk backend SDK]
   |
   |--> [Prisma ORM] --> [Neon Postgres] (users, daily_logs, lift_logs,
   |                                        workout_plans, plan_days,
   |                                        weekly_verdicts)
   |
   |--> [Google Gemini API — Gemini Flash] (plan parsing only, server-side)
```

The mobile app **never** connects to Neon or Google Gemini directly. Every
piece of data or AI functionality is mediated by the Express API.

## Two apps

- `log-app-mobile/` — Expo React Native app
- `log-app-backend/` — Node.js + Express API

They live in sibling directories and are deployed independently. The mobile
app talks to the backend only via HTTPS REST calls to a fixed `API_BASE_URL`
(environment config, see `deployment.md`).

## Backend repo structure

```
log-app-backend/
├── src/
│   ├── index.ts               # app entrypoint, server start
│   ├── app.ts                 # express app + middleware wiring
│   ├── config/                # env loading, constants
│   ├── db/
│   │   └── client.ts          # Prisma client (singleton)
│   ├── middleware/
│   │   ├── auth.ts            # Clerk token verification
│   │   ├── validate.ts        # zod validation middleware
│   │   └── errorHandler.ts    # centralized error formatting
│   ├── routes/
│   │   ├── users.ts
│   │   ├── dailyLogs.ts
│   │   ├── liftLogs.ts
│   │   ├── plans.ts
│   │   ├── trends.ts
│   │   └── verdict.ts
│   ├── services/
│   │   ├── planParser.ts      # Google Gemini API call + prompt
│   │   └── verdictEngine.ts   # pure rule-based verdict function
│   └── validation/            # zod schemas per route
├── prisma/
│   ├── schema.prisma          # Prisma schema (source of truth, see database.md)
│   └── migrations/            # prisma migrate generated migrations
├── package.json
└── .env.example
```

## Mobile repo structure

```
log-app-mobile/
├── app/                        # Expo Router screens
│   ├── (tabs)/
│   │   ├── today.tsx
│   │   ├── lift.tsx
│   │   ├── trends.tsx
│   │   ├── verdict.tsx
│   │   └── plan.tsx
│   ├── _layout.tsx             # root layout, Clerk provider
│   └── sign-in.tsx
├── src/
│   ├── api/                    # typed API client (fetch wrappers per resource)
│   ├── components/             # shared UI components (see design-system.md)
│   ├── hooks/                  # data-fetching hooks per screen
│   └── theme/                  # design tokens (colors, type, spacing)
├── app.json
└── .env.example
```

## Data flow example — logging a lift

1. User taps "Log" on an exercise card in the Lift screen.
2. App optimistically marks the card done in local state.
3. App calls `POST /api/logs/lift` with `{date, exercise_name, weight_kg, reps}`
   and the Clerk session token in the `Authorization` header.
4. Backend middleware verifies the token, extracts `userId`.
5. Route handler validates the body (zod), inserts a row via Prisma scoped
   to `userId`.
6. Response returns the saved row; app reconciles optimistic state with the
   server response (no-op if they match).
7. On failure, app reverts the card to "not done" and shows a retry option.

## Why this architecture

- **Express on a VPS** gives full control matching the "own VPS" hosting
  decision, and keeps the stack simple without coupling the mobile client to
  Clerk, Neon, or Google Gemini; each external service is swappable behind
  its respective service layer.
- **Prisma + `pg`** — a persistent Express process holds a normal connection
  pool to Neon, so there's no need for Neon's HTTP-based serverless driver
  (that driver exists for edge/serverless runtimes, which this backend is
  not).
- **Clerk** removes the need to build/maintain auth (password resets,
  session handling, email verification) in-house.
- **Rule-based verdict engine** is a pure function with no external
  dependency — deterministic, fast, fully testable without mocking an LLM.
