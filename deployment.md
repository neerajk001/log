# Deployment

## Backend — self-managed VPS (Docker)

**Stack on the VPS:** Nginx (reverse proxy + TLS termination) → Docker
Compose (`param-api` container) → Node/Express app. Postgres lives in Neon
(external) — only the API runs on the VPS.

### One-time setup

1. Provision VPS (Ubuntu LTS recommended), point a domain's A record at
   its IP.
2. Install Docker Engine + the Compose plugin, Nginx, Certbot. (No Node.js
   or PM2 needed on the host.)
3. Clone the repo, copy `log-app-backend/.env.example` →
   `log-app-backend/.env`, fill in secrets (`DATABASE_URL` from Neon,
   `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`,
   plus `PORT`).
4. `cd log-app-backend && docker compose up -d --build`
5. Run migrations: `docker compose run --rm api npx prisma migrate deploy`
6. If a previous PM2-based install exists: `pm2 delete log-api` /
   `pm2 delete param-api` (the CI deploy does this automatically once).
7. Configure Nginx as a reverse proxy from `https://api.<domain>` to
   `localhost:$PORT` (same value as in `.env`); issue a certificate with
   `certbot --nginx`.

### Deploy flow (automated — GitHub Actions, no manual steps)

Push to `main` (or Run workflow manually) runs `.github/workflows/
backend-deploy.yml`: backend CI (install, build, tests), then over SSH —
`git pull` → `docker compose build` → `docker compose run --rm api npx
prisma migrate deploy` → `docker compose up -d` → `curl
localhost:$PORT/health` gate → `docker image prune`.

The image never contains secrets: `.env` is excluded via `.dockerignore`
and supplied at run time through compose `env_file`.

### Environment variables

See `docs/backend.md` for the full list. Set them in `.env` on the VPS,
never in source control.

## Mobile app — Expo

- Development: `npx expo start`, tested via Expo Go or a dev build during
  Phase 1-2.
- Distribution build: **EAS Build** (`eas build --platform ios|android`)
  once the core loop is stable — targeted for Phase 3, per the open
  decision in `AGENTS.md` on exact timing.
- `EXPO_PUBLIC_API_BASE_URL` must point at the production
  `https://api.<domain>` URL for release builds, and can point at a local
  IP/tunnel during development.
- App Store / Play Store submission is explicitly out of scope for the
  phases defined in `tasks/` — those are internal-testing builds only
  unless the product owner requests store submission as a later phase.

## Database — Neon

- No self-hosting required; use Neon's pooled connection string
  (`-pooler` host) as `DATABASE_URL` since the backend is a persistent
  process making many short-lived queries.
- Use a Neon branch for any pre-production testing (e.g. running the
  integration test suite) to avoid touching production data.
