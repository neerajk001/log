# Deployment

## Backend — self-managed VPS

**Stack on the VPS:** Nginx (reverse proxy + TLS termination) → PM2
(process manager) → Node/Express app on `localhost:3000`.

### One-time setup

1. Provision VPS (Ubuntu LTS recommended), point a domain's A record at
   its IP.
2. Install Node.js (LTS), PM2 (`npm i -g pm2`), Nginx, Certbot.
3. Clone `log-app-backend`, copy `.env.example` → `.env`, fill in secrets
   (`DATABASE_URL` from Neon, `CLERK_SECRET_KEY`, `GEMINI_API_KEY`, and
   optionally `GEMINI_MODEL`).
4. `npm ci && npm run build`
5. Run migrations: `npx prisma migrate deploy`
6. Start with PM2: `pm2 start dist/index.js --name log-api` and
   `pm2 save` + `pm2 startup` (survive reboots).
7. Configure Nginx as a reverse proxy from `https://api.<domain>` to
   `localhost:3000`; issue a certificate with `certbot --nginx`.

### Deploy flow (MVP — manual, no CI/CD yet)

```bash
ssh user@vps
cd log-app-backend
git pull origin main
npm ci
npm run build
npx prisma migrate deploy  # only if schema changed
pm2 reload log-api
```

GitHub Actions automation is a known post-MVP improvement (noted in
`AGENTS.md` open decisions) — do not build it during Phase 1-3 unless
explicitly requested.

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
