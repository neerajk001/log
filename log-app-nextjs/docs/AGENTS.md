# AGENTS.md — Build Guide for "Log" (Next.js fullstack)

This file is the entry point for any AI coding agent (or human) building the
**Next.js** version of this application. Read this fully before writing code.

## What changed vs. the original plan

The product "Log" was originally specified as **two** apps — an Expo/React
Native mobile client (`log-app-mobile/`) and a Node/Express backend
(`log-app-backend/`) — deployed independently. This Next.js re-plan keeps
**everything else identical** (data model, auth provider, AI parsing, verdict
rules, design tokens, endpoints, phase order) but collapses the two apps into
**one fullstack Next.js app** (`log-app-nextjs/`):

- The web UI and the backend API live in the same Next.js project.
- Backend = Next.js **Route Handlers** under `app/api/**` (App Router).
- Frontend = Next.js **App Router pages** (React Server/Client Components).
- Data access, Prisma, Clerk verification, and the OpenAI plan-parsing call
  all happen **server-side** — exactly as before. The OpenAI key never
  reaches the browser, same as the key never reached the mobile bundle.

> **Scope flag (resolve with product owner):** the original `docs/product.md`
> listed *"Web app (mobile-only)"* and *"Web app"* as explicitly **out of
> scope**. Building "Log" as a Next.js app makes it a web app by definition, so
> that out-of-scope item is **superseded** by this direction — specifically it
> becomes a **mobile-only web app**: it targets the mobile browser, is
> mobile-first with a single-column layout, and has **no desktop layout**
> (on larger screens it renders inside a centered ~480px "phone frame"
> column rather than expanding into a desktop UI). The 5 screens and the
> design system are otherwise preserved unchanged. All other out-of-scope
> items in `product.md` (offline sync, social, push, photo OCR, food DB,
> etc.) remain out of scope.

## Read order

Read documents in this order before starting Phase 1:

1. `docs/product.md` — what we're building and why
2. `docs/requirements.md` — every feature with acceptance criteria
3. `docs/architecture.md` — system design, stack, repo layout
4. `docs/database.md` — schema (source of truth for all data shapes)
5. `docs/auth.md` — Clerk integration, how requests get authenticated
6. `docs/api.md` — every backend endpoint (as Next.js Route Handlers)
7. `docs/design-system.md` — colors, type, components (web adaptation)
8. `docs/frontend.md` / `docs/backend.md` — code conventions
9. `docs/user-flows.md` — how screens connect
10. `docs/security.md`, `docs/testing.md`, `docs/deployment.md`

Then work through `tasks/phase-01.md` → `phase-02.md` → `phase-03.md` in order.
Do not start Phase 2 work until every acceptance criterion in Phase 1 passes.

## Non-negotiable rules (carry over unchanged)

- **One app, one architecture.** The Next.js app serves both the UI and the
  API. Server-side code (Route Handlers, Server Components, server actions)
  is the only place that touches the database, Clerk secret key, or OpenAI
  key. Client Components never import `prisma`, `@clerk/backend`, or
  `OPENAI_API_KEY`.
- **All docs are the source of truth.** If code and docs disagree, the docs
  win — stop and flag the conflict rather than guessing.
- **Do not invent endpoints, tables, or screens** not described in these
  docs. If something is missing, stop and ask rather than improvising.
- **No offline sync engine in MVP.** Optimistic UI (instant local feedback,
  then save to server) is required. Offline queueing/conflict resolution is
  explicitly out of scope — see `docs/product.md`.
- **AI calls (plan parsing) happen server-side only.** The OpenAI API key
  must never reach the client bundle. In Next.js this means the call lives in
  a Route Handler (`app/api/plans/parse/route.ts`), never in a Client
  Component.
- **Every query must be scoped to the authenticated user.** Never trust a
  client-supplied `user_id` — always derive it from the verified Clerk
  session. See `docs/security.md`.

## Stack summary

| Layer      | Choice                                                       |
|------------|-------------------------------------------------------------|
| Framework  | Next.js (App Router), TypeScript, React 18/19               |
| UI         | React Server/Client Components; Tailwind CSS + design tokens|
| Auth       | Clerk (`@clerk/nextjs`) — `clerkMiddleware` + components     |
| API        | Next.js Route Handlers under `app/api/**` (REST, same contract)|
| ORM        | Prisma ORM + `pg` (pooled Postgres driver)                  |
| Database   | Neon Postgres                                               |
| AI parsing | OpenAI (server-side only)                                    |
| Hosting    | Vercel (recommended) **or** self-managed VPS (Nginx + Node)  |

## Open decisions still owned by the product owner

These are noted in the relevant docs but are not yet finalized — do not
resolve them by guessing. Flag them back to the product owner:

- Exact domain name and VPS provider/specs (if not using Vercel).
- Whether the app is hosted on Vercel or a self-managed VPS — both are
  documented in `docs/deployment.md`; the owner picks one.
- CI/CD (currently: manual deploy — see `docs/deployment.md`; GitHub Actions
  automation is a post-MVP improvement).
- Confirmation that the "no web app" out-of-scope line is intentionally
  overridden by this Next.js direction (see the flag above).
