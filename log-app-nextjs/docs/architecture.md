# Architecture

## System diagram (Next.js fullstack)

```
[Browser] — Next.js App Router
   ├── App Router pages (React, Server + Client Components)
   │     └── Client Components call the same /api/* endpoints (fetch)
   └── Route Handlers under app/api/**  ← the "backend"
          |
          |  clerkMiddleware() verifies the session on every route except /api/health
          |  auth() resolves the Clerk userId → local users.id (provisioning on first call)
          v
   [Prisma ORM] --> [Neon Postgres] (users, daily_logs, lift_logs,
                                       workout_plans, plan_days,
                                       weekly_verdicts)
          |
          |--> [OpenAI API] (plan parsing only,
                 inside POST /api/plans/parse — server-side, key never
                 reaches the browser)
```

The browser **never** connects to Neon or OpenAI directly. Every
piece of data or AI functionality is mediated by a Next.js Route Handler
running on the server.

> **Mobile-only web app:** this is a web app that targets the **mobile
> browser only**. It is mobile-first with a single-column layout and no
> desktop layout — on larger viewports it renders inside a centered ~480px
> "phone frame" column (see `docs/design-system.md`). There is no desktop
> navigation or multi-column view.

## One app

- `log-app-nextjs/` — a single Next.js project (App Router) that contains
  both the UI and the API. There is no separate backend repo. Server-only
  code (Prisma, Clerk secret key, OpenAI key) lives in Route Handlers,
  Server Components, and `lib/services/*`. Client Components only ever call
  the `/api/*` endpoints (or are passed server-fetched data).

## Repo structure

```
log-app-nextjs/
├── app/
│   ├── layout.tsx                  # root layout: <ClerkProvider>, fonts, nav
│   ├── page.tsx                    # redirect → /today (or sign-in)
│   ├── (app)/                      # authed app shell (bottom tab nav)
│   │   ├── layout.tsx              # shared shell, auth gate via <AuthGate/>
│   │   ├── today/page.tsx
│   │   ├── lift/page.tsx
│   │   ├── trends/page.tsx
│   │   ├── verdict/page.tsx
│   │   └── plan/page.tsx
│   ├── sign-in/[[...sign-in]]/page.tsx   # Clerk hosted pages
│   └── api/                        # Route Handlers — the "backend"
│       ├── health/route.ts
│       ├── me/route.ts             # GET, PUT
│       ├── logs/
│       │   ├── daily/[date]/route.ts   # GET, PUT
│       │   ├── daily/route.ts          # GET (range)
│       │   └── lift/route.ts           # POST, GET
│       └── plans/
│           ├── route.ts             # GET, POST
│           ├── parse/route.ts       # POST (OpenAI, no persistence)
│           └── [id]/today/route.ts  # GET (day rotation)
│       ├── trends/route.ts         # GET
│       └── verdict/weekly/route.ts # GET
├── lib/                            # server-only logic
│   ├── db/client.ts                # Prisma client (singleton)
│   ├── auth.ts                     # userId resolution + findOrCreateUser
│   ├── services/
│   │   ├── planParser.ts           # OpenAI call + prompt
│   │   ├── verdictEngine.ts        # pure rule-based verdict function
│   │   ├── planRotation.ts         # pure day-rotation function
│   │   └── trends.ts               # trend aggregation
│   └── validation/schemas.ts       # zod schemas per route
├── src/                            # client-side code
│   ├── api/client.ts               # typed fetch wrappers per resource
│   ├── components/                 # shared UI (see design-system.md)
│   ├── hooks/                      # data-fetching hooks per screen
│   └── theme/                      # design tokens (colors, type, spacing)
├── prisma/
│   ├── schema.prisma               # Prisma schema (source of truth)
│   └── migrations/
├── middleware.ts                   # Clerk middleware
├── tailwind.config.ts              # token mapping (see design-system.md)
├── package.json
└── .env.example
```

## Data flow example — logging a lift

1. User taps "Log" on an exercise card in the Lift screen (Client Component).
2. Component optimistically marks the card done in local state.
3. Component calls `POST /api/logs/lift` with
   `{date, exercise_name, weight_kg, reps}` (the browser attaches the
   Clerk session cookie automatically; no manual token handling needed in
   the browser).
4. `clerkMiddleware` + the route handler's `auth()` resolve the userId;
   `lib/auth.ts` finds or creates the local `users` row.
5. Handler validates the body (zod), inserts a row via Prisma scoped to
   `userId`.
6. Response returns the saved row; component reconciles optimistic state
   (no-op if they match).
7. On failure, component reverts the card to "not done" and shows a retry
   option.

## Why this architecture

- **Single Next.js app** collapses the original two-repo split: the UI and
  the API share types, build, and deploy. The API surface (`/api/*`) is
  preserved exactly, so the product could later gain a native client
  without changing backend contracts.
- **App Router Route Handlers** replace Express: same REST contract, but
  deployed as serverless/Node functions within the Next.js runtime. Clerk's
  `clerkMiddleware` handles verification centrally.
- **Prisma + `pg`** — a persistent Next.js server (Node runtime) holds a
  normal connection pool to Neon, so there's no need for Neon's HTTP-based
  serverless driver. (If deploying to Vercel's edge, switch to
  `@prisma/adapter-neon` — see `deployment.md` — but the default target is
  the Node runtime.)
- **Clerk** removes the need to build/maintain auth in-house.
- **Rule-based verdict engine** is a pure function with no external
  dependency — deterministic, fast, fully testable without mocking an LLM.
