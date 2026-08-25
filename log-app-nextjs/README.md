# Log (Next.js fullstack)

A minimal, honest fitness-tracking web app. It logs three things (body
weight, nutrition, lifts) and produces one weekly output: a rule-based
verdict telling the user to hold their current plan, increase calories, or
check recovery. No streaks, no gamification, no social features.

This is the **Next.js** re-plan of the original two-repo build
(`log-app-mobile` + `log-app-backend`). It keeps the same product,
data model, auth, AI-parsing, verdict rules, design tokens, and endpoints,
but as a **single fullstack Next.js app** (App Router + Route Handlers).

Full context: read `docs/AGENTS.md` first.

## Stack

| Layer      | Choice                                                       |
|------------|-------------------------------------------------------------|
| Framework  | Next.js (App Router), TypeScript, React                     |
| UI         | React Server/Client Components; Tailwind CSS + design tokens|
| Auth       | Clerk (`@clerk/nextjs`)                                     |
| API        | Next.js Route Handlers under `app/api/**`                   |
| ORM        | Prisma ORM + `pg`                                           |
| Database   | Neon Postgres                                               |
| AI parsing | OpenAI (server-side only)                                    |
| Hosting    | Vercel (recommended) or self-managed VPS (Nginx + Node)     |

## Quick start (scaffold not yet generated)

```bash
cd log-app-nextjs
cp .env.example .env   # fill DATABASE_URL, CLERK_*, OPENAI_*
npm install
npx prisma migrate dev
npm run dev            # http://localhost:3000
```

## Docs map

All product/engineering docs live in `docs/` and mirror the original spec
adapted to Next.js: `product.md`, `requirements.md`, `architecture.md`,
`database.md`, `auth.md`, `api.md`, `design-system.md`, `frontend.md`,
`backend.md`, `user-flows.md`, `security.md`, `testing.md`,
`deployment.md`, and `phase-01/02/03.md`.

## Build order

Work through `docs/phase-01.md` → `phase-02.md` → `phase-03.md` in order.
Do not start a later phase until the current phase's acceptance criteria
all pass.
