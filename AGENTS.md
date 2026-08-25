# AGENTS.md — Build Guide for "Log"

This file is the entry point for any AI coding agent (or human) building this
application. Read this fully before writing any code.

## What this app is

"Log" is a minimal, honest fitness-tracking mobile app. It logs three things
(body weight, nutrition, and lifts) and produces one weekly output: a
rule-based verdict telling the user to hold their current plan, increase
calories, or check recovery. No streaks, no gamification, no social features.

Full product context: `docs/product.md`

## Read order

Read documents in this order before starting Phase 1:

1. `docs/product.md` — what we're building and why
2. `docs/requirements.md` — every feature with acceptance criteria
3. `docs/architecture.md` — system design, stack, repo layout
4. `docs/database.md` — schema (source of truth for all data shapes)
5. `docs/auth.md` — Clerk integration, how requests get authenticated
6. `docs/api.md` — every backend endpoint
7. `docs/design-system.md` — colors, type, components
8. `docs/frontend.md` / `docs/backend.md` — code conventions
9. `docs/user-flows.md` — how screens connect
10. `docs/security.md`, `docs/testing.md`, `docs/deployment.md`

Then work through `tasks/phase-01.md` → `phase-02.md` → `phase-03.md` in order.
Do not start Phase 2 work until every acceptance criterion in Phase 1 passes.

## Non-negotiable rules

- **Two apps, one architecture.** The mobile app (`log-app-mobile/`, Expo/
  React Native) and backend (`log-app-backend/`, Node/Express) live in
  sibling directories and are deployed independently. The mobile app never
  talks to Neon directly — every data access goes through the backend API.
- **All docs are the source of truth.** If code and docs disagree, the docs
  win — stop and flag the conflict rather than guessing.
- **Do not invent endpoints, tables, or screens** not described in these
  docs. If something is missing, stop and ask rather than improvising.
- **No offline sync engine in MVP.** Optimistic UI (instant local feedback,
  then save to server) is required. Offline queueing/conflict resolution is
  explicitly out of scope — see `docs/product.md` for the full out-of-scope
  list.
- **AI calls (plan parsing) happen server-side only.** The Gemini API key
  must never reach the mobile app or client bundle.
- **Every table query must be scoped to the authenticated user.** Never trust
  a client-supplied `user_id` — always derive it from the verified Clerk
  token. See `docs/security.md`.

## Stack summary

| Layer      | Choice                                              |
|------------|------------------------------------------------------|
| Mobile app | React Native + Expo (Expo Router), TypeScript        |
| Auth       | Clerk (Expo SDK on client, Clerk backend SDK on server) |
| Backend    | Node.js + Express, TypeScript                        |
| ORM        | Prisma ORM + `pg` (standard pooled Postgres driver)    |
| Database   | Neon Postgres                                         |
| AI parsing | Gemini Flash via Google Gemini API (server-side only)   |
| Hosting    | Self-managed VPS — Nginx + PM2 + Let's Encrypt        |

## Open decisions still owned by the product owner

These are noted in the relevant docs but are not yet finalized — do not
resolve them by guessing. Flag them back to the product owner:

- Exact domain name and VPS provider/specs
- Whether the mobile app ships to TestFlight/Play internal testing during
  Phase 1, or stays on Expo dev builds until Phase 3
- CI/CD (currently: manual `git pull` + `pm2 reload` deploy — see
  `docs/deployment.md`; GitHub Actions automation is a post-MVP improvement)
