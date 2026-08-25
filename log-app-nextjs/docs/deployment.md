# Deployment

"Log" is a single Next.js app. Two hosting options are documented; the
product owner picks one (see `docs/AGENTS.md` open decisions).

## Option A — Vercel (recommended)

- Connect the `log-app-nextjs` repo to Vercel; it auto-detects Next.js.
- Set environment variables in the Vercel project dashboard:
  `DATABASE_URL` (Neon pooled), `CLERK_SECRET_KEY`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Build: `next build` (automatic). Route Handlers run on Vercel's Node
  runtime by default.
- Database connection on Vercel: use Neon's **pooled** connection string.
  If you opt into edge runtime for any handler, switch Prisma to
  `@prisma/adapter-neon` (HTTP driver) — but keep the default Node runtime
  for simplicity and to match the original persistent-process model.
- TLS is automatic (Let's Encrypt via Vercel). No Nginx needed.

## Option B — Self-managed VPS (Nginx + Node)

**Stack on the VPS:** Nginx (reverse proxy + TLS termination) → Node
running `next start` on `localhost:3000`.

### One-time setup

1. Provision VPS (Ubuntu LTS recommended), point a domain's A record at its
   IP.
2. Install Node.js (LTS), Nginx, Certbot.
3. Clone `log-app-nextjs`, copy `.env.example` → `.env`, fill in secrets
   (`DATABASE_URL` from Neon, `CLERK_SECRET_KEY`,
    `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, optionally
    `OPENAI_MODEL`).
4. `npm ci && npm run build`
5. Run migrations: `npx prisma migrate deploy`
6. Start with PM2: `pm2 start "npx next start -p 3000" --name log-web`,
   then `pm2 save` + `pm2 startup` (survive reboots).
7. Configure Nginx as a reverse proxy from `https://<domain>` to
   `localhost:3000`; issue a certificate with `certbot --nginx`.

### Deploy flow (MVP — manual, no CI/CD yet)

```bash
ssh user@vps
cd log-app-nextjs
git pull origin main
npm ci
npm run build
npx prisma migrate deploy  # only if schema changed
pm2 reload log-web
```

GitHub Actions automation is a known post-MVP improvement (noted in
`docs/AGENTS.md` open decisions) — do not build it during Phase 1-3 unless
explicitly requested.

### Environment variables

See `docs/backend.md` for the full list. Set them in `.env` on the VPS
(Vercel: in the dashboard), never in source control.

## Database — Neon

- No self-hosting required; use Neon's pooled connection string
  (`-pooler` host) as `DATABASE_URL` since the server is a persistent
  process making many short-lived queries.
- Use a Neon branch for any pre-production testing (e.g. running the
  integration test suite) to avoid touching production data.
