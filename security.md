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

## AI coach specific (`/api/coach/*`)

- Onboarding answers live in `coach_profiles`, scoped to `req.userId`, and are
  never returned for another user.
- **Body photos are transient.** The uploaded image is held in memory only for
  the duration of the model call and is never written to disk, the database, or
  logs.
- Every coach endpoint is rate-limited per user (`chat` 30/hr, `plan` 10/hr,
  `analyze` 10/hr) — each call costs real money.
- The athlete context sent to the model is a bounded aggregate summary, not a raw
  log dump.
- Chat history (`coach_messages`) is only ever read/written for the authenticated
  user.

## Analytics masking (session replay)

Session replay records what is on screen, and this app displays health data.
The policy is **mask by default, then explicitly verify**:

- `app/_layout.tsx` opens PostHog with explicit, pinned replay options:
  `maskAllTextInputs: true`, `maskAllImages: true`,
  `maskAllSandboxedViews: true`, `captureTouches: false` (tap coordinates can
  reveal keypad digits), `captureLog: false` (console logs must never become
  events). Explicit flags mean an SDK default change cannot silently unmask
  health data.
- Free-text health content that inputs masking does not cover is wrapped in
  `PostHogMaskView` (`ph-no-capture`): the coach chat transcript, the meal
  editor sheet, and the day's meal list.
- Analytics events themselves are numbers and enums only — audit the
  `captureTiming` call sites before adding any property
  (`src/utils/perf.ts` documents the contract).

**Verification checklist (re-run after any PostHog/native SDK upgrade):**

1. Build a dev/preview client with replay on; open Today, Meal sheet, and the
   coach chat.
2. In the PostHog replay, confirm the coach transcript and meal names/calories
   render as masked blocks (not text).
3. Confirm weigh-in/meal inputs and any photo attachments are masked
   placeholders.
4. Confirm no `console` events appear for the session.
5. Confirm no touch-dot overlay appears over numeric inputs.
6. Inspect a few captured events: properties must be durations, counts, token
   totals and enums — never text, ids or content.

## Metrics endpoint

`GET /metrics` is 404 unless `METRICS_TOKEN` is set and compares the bearer
token in constant time; expose it only to the scraper (bind it to the scraper's
IP in Nginx if the VPS is public). The registry carries route patterns, status
classes, tool names and error codes — no user identifiers or content.
