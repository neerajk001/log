# Security

## Authentication & data isolation

- Every route (except `/health`) requires a valid Clerk token — see
  `docs/auth.md`.
- Every database query is scoped to `req.userId` resolved from the
  verified token. **Never** accept `user_id` from request body, query
  params, or headers — this is the single most important rule in this
  document. A code review that finds a query using a client-supplied user
  ID instead of `req.userId` is a blocking issue, not a style note.

## Secrets

- `.env` files are never committed (ensure `.gitignore` covers them in
  both repos from the first commit).
- Secrets required server-side only: `CLERK_SECRET_KEY`,
  `GEMINI_API_KEY`, `DATABASE_URL`. None of these are ever sent to or
  bundled into the mobile app.
- Mobile app only holds public/publishable keys
  (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`), which are safe to expose by
  design.

## Input validation

- Every request body is validated with `zod` before touching the
  database or an external API call. Reject invalid input with
  `400 VALIDATION_ERROR` — do not attempt to coerce or guess-fix bad
  input.
- SQL injection is structurally prevented by using Prisma's parameterized
  query builder — raw string-concatenated SQL is not permitted anywhere in
  the codebase.

## Rate limiting

- `POST /api/plans/parse` must be rate-limited per user (e.g.
  `express-rate-limit`, a sensible starting point is 10 requests/hour per
  user) — this endpoint costs real money per call (Gemini API) and has
  no legitimate reason to be called at high frequency.

## Transport

- All traffic is HTTPS only, terminated at Nginx via Let's Encrypt (see
  `docs/deployment.md`). The Express app itself does not handle TLS.
- CORS: the API is consumed by a native mobile app (no browser origin), so
  CORS can be locked down to deny all cross-origin browser access by
  default; do not open it broadly "just in case."

## AI plan parsing specific

- Treat all parsed AI output as untrusted input — validate against a
  strict schema (see `docs/backend.md`) before it ever reaches the
  database, and require explicit user confirmation before persisting
  (R4.3) — the AI output is never auto-saved.
