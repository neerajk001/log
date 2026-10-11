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
   plus `PORT` and `SENTRY_DSN` for error monitoring). Model routing can be
   tuned with `OPENAI_PARSE_MODEL`, `COACH_FAST_MODEL`, `COACH_MODEL`
   (reasoning) and `COACH_VISION_MODEL` — see `docs/backend.md`.
4. `cd log-app-backend && docker compose up -d --build`
5. Run migrations: `docker compose run --rm api npx prisma migrate deploy`
6. If a previous PM2-based install exists: `pm2 delete log-api` /
   `pm2 delete param-api` (the CI deploy does this automatically once).
7. Configure Nginx as a reverse proxy from `https://api.<domain>` to
   `localhost:$PORT` (same value as in `.env`); issue a certificate with
   `certbot --nginx`.
   **Streaming:** the AI coach's `POST /api/coach/chat/stream` requires
   `proxy_buffering off;` (with a generous `proxy_read_timeout`) on the API
   location, or Nginx buffers the whole reply and streaming is lost. The
   route also sends `X-Accel-Buffering: no`.

### Deploy flow (automated — GitHub Actions, no manual steps)

Push to `main` (or Run workflow manually) runs `.github/workflows/
backend-deploy.yml`: backend CI (install, build, tests), then over SSH —
`git pull` → `docker compose build` → `docker compose run --rm api npx
prisma migrate deploy` → `docker compose up -d` → process liveness check at
`localhost:$PORT/health` → Neon readiness gate at `localhost:$PORT/ready` →
`docker image prune`. Docker health checks use `/health` so a temporary Neon
outage does not create a container restart loop; deployments require `/ready`.

The image never contains secrets: `.env` is excluded via `.dockerignore`
and supplied at run time through compose `env_file`.

### Environment variables

See `docs/backend.md` for the full list. Set them in `.env` on the VPS,
never in source control.

## Mobile app — Expo

- Development: `npx expo start`, tested via Expo Go or a dev build.
- **Release APK** (internal testing):
  `eas build --platform android --profile preview`. That profile sets
  `channel: "preview"`, `distribution: "internal"`, `android.buildType: "apk"`, and bakes
  in the production API URL and Clerk publishable key. A local dev build or Expo Go has no
  update channel, so OTA updates never apply there.
- **Over-the-air updates**: `expo-updates` is installed and `app.json` points at the EAS
  project (`updates.url`) with `runtimeVersion.policy: "appVersion"`. A push to `main`
  touching `log-app-mobile/**` publishes a JS/asset update to the **preview** channel via
  `.github/workflows/mobile-update.yml`, which requires the repository secret
  `EXPO_TOKEN` (Expo → account settings → access tokens); the workflow can also be run
  manually from the Actions tab to target `preview` or `production`. Locally:
  `npx eas-cli@latest update --channel preview`. The installed app downloads on launch and
  applies the update on the **next** launch.
- **Bump `version` in `app.json` whenever a native module or native config changes** — the
  runtimeVersion follows appVersion, so bumping keeps a JS update from landing on a build
  that lacks the new native side. Rebuild and reinstall after such a change; JS-only changes
  still ship by OTA.
- `EXPO_PUBLIC_API_BASE_URL` is the production `https://api.…` URL in both build profiles,
  and can point at a local LAN IP during development.
- App Store / Play Store submission is explicitly out of scope for the phases in `tasks/` —
  internal-testing builds only unless the product owner asks for store submission later.

## Database — Neon

- No self-hosting required; use Neon's pooled connection string
  (`-pooler` host) as `DATABASE_URL` since the backend is a persistent
  process making many short-lived queries.
- Use a Neon branch for any pre-production testing (e.g. running the
  integration test suite) to avoid touching production data.
