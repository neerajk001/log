# Security

## Authentication & data isolation

- Every Route Handler (except `/api/health`) requires a valid Clerk session
  — see `docs/auth.md`.
- Every database query is scoped to the `userId` resolved from the verified
  session. **Never** accept `user_id` from request body, query params, or
  headers — this is the single most important rule in this document. A code
  review that finds a query using a client-supplied user ID instead of the
  session-derived ID is a blocking issue, not a style note.

## Secrets

- `.env` files are never committed (ensure `.gitignore` covers them).
- Secrets required server-side only: `CLERK_SECRET_KEY`, `OPENAI_API_KEY`,
  `DATABASE_URL`. None of these are ever sent to or bundled into the
  browser. Only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (safe by design) is
  exposed to the client.
- In Next.js, the rule is concrete: **never import `prisma`, `@clerk/nextjs/
  server`, or read `OPENAI_API_KEY`/`DATABASE_URL` inside a Client Component
  (`"use client"`) or any module transitively imported by one.** Keep all
  such code in Route Handlers, Server Components, and `lib/services/*`.

## Input validation

- Every request body is validated with `zod` before touching the database or
  an external API call. Reject invalid input with `400 VALIDATION_ERROR` —
  do not attempt to coerce or guess-fix bad input.
- SQL injection is structurally prevented by using Prisma's parameterized
  query builder — raw string-concatenated SQL is not permitted anywhere.

## Rate limiting

- `POST /api/plans/parse` must be rate-limited per user (a sensible starting
  point is 10 requests/hour per user) — this endpoint costs real money per
  call (OpenAI API) and has no legitimate reason to be called at high
  frequency. Implement with a lightweight in-memory or KV-backed limiter
  keyed by `userId` (or `clerkUserId`).

## Transport

- All traffic is HTTPS only. On Vercel, TLS is automatic. On a self-managed
  VPS, terminate TLS at Nginx via Let's Encrypt (see `docs/deployment.md`);
  the Next.js server itself does not handle TLS.
- CORS: the API and UI are same-origin (one Next.js domain), so no cross-
  origin browser access is needed. If a future native client or separate
  origin calls `/api/*`, add an explicit allowlist for that origin only —
  do not open CORS broadly "just in case."

## AI plan parsing specific

- Treat all parsed AI output as untrusted input — validate against a strict
  schema (see `docs/backend.md`) before it ever reaches the database, and
  require explicit user confirmation before persisting (R4.3) — the AI
  output is never auto-saved.
