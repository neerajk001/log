# Authentication & Authorization

Provider: **Clerk**. Email-based sign up/login for MVP (Clerk's hosted UI
components handle the actual sign-in flow — do not build custom auth
screens beyond wiring Clerk's Expo components).

## Client side (Expo app)

- Install `@clerk/clerk-expo`.
- Wrap the root layout (`app/_layout.tsx`) in `<ClerkProvider>` with the
  publishable key from env config.
- Use Clerk's `useAuth()` hook to gate navigation: unauthenticated users see
  `sign-in.tsx`; authenticated users see the `(tabs)` group.
- Every API call attaches the current session token:
  `const token = await getToken(); fetch(url, { headers: { Authorization: \`Bearer ${token}\` } })`.
- Store no credentials or tokens manually — Clerk's SDK manages token
  refresh and secure storage.

## Server side (Express backend)

- Install `@clerk/backend` (or `@clerk/express` if using the official Express
  middleware — prefer this if available for the pinned Clerk SDK version).
- `middleware/auth.ts` verifies the `Authorization: Bearer <token>` header
  on every route except `/health`.
- On success, middleware attaches `req.userId` = the **local `users.id`**
  (not the raw Clerk ID) — resolved by looking up `clerk_user_id`, creating
  the row if it doesn't exist yet (first-login provisioning, see R1.3).
- On failure (missing/invalid/expired token), respond `401 UNAUTHORIZED`
  immediately — do not proceed to the route handler.

```ts
// middleware/auth.ts — shape, not final code
export async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing token" } });

  const claims = await verifyClerkToken(token); // throws on invalid
  const user = await findOrCreateUserByClerkId(claims.sub);
  req.userId = user.id;
  next();
}
```

## Authorization rule (applies to every route)

Every database query that touches `daily_logs`, `lift_logs`,
`workout_plans`, `plan_days`, or `weekly_verdicts` **must** filter by
`user_id = req.userId` derived from the verified token. Never accept a
`user_id` from the request body or query string. See `docs/security.md`
for the full rationale.

## Environment variables required

Backend `.env`:
```
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
```

Mobile `.env`:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXPO_PUBLIC_API_BASE_URL=
```
