# Authentication & Authorization (Next.js / Clerk)

Provider: **Clerk**. Email-based sign up/login for MVP (Clerk's hosted UI
pages handle the actual sign-in flow — do not build custom auth screens
beyond wiring Clerk's Next.js components).

## Client side (Next.js app)

- Install `@clerk/nextjs`.
- Wrap the root layout (`app/layout.tsx`) in `<ClerkProvider>` with the
  publishable key from env (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`).
- Use Clerk's `useAuth()` / `useUser()` hooks to gate navigation:
  unauthenticated users are redirected to `/sign-in` (via Clerk's
  `<SignedOut>` / middleware); authenticated users see the `(app)` group.
- For data mutations, Client Components call the `/api/*` Route Handlers.
  **No manual token handling is needed in the browser** — Clerk's
  middleware attaches the session cookie to same-origin `fetch` requests
  automatically. The typed client in `src/api/client.ts` just calls
  `fetch('/api/...')`.
- Store no credentials or tokens manually — Clerk's SDK manages the session
  cookie and refresh.

## Middleware (`middleware.ts`)

```ts
// middleware.ts — runs on the server before every request
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // run on everything except static assets and /api/health
    '/((?!_next/static|_next/image|favicon.ico|api/health).*)',
  ],
};
```

## Server side (Route Handlers)

- Every Route Handler except `GET /api/health` requires an authenticated
  session. Inside a handler:

```ts
// app/api/logs/lift/route.ts — shape, not final code
import { auth } from '@clerk/nextjs/server';
import { findOrCreateUser } from '@/lib/auth';

export async function POST(req: Request) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing session' } },
      { status: 401 }
    );
  }
  // resolve the LOCAL users.id (provisions on first call — R1.3)
  const user = await findOrCreateUser(clerkUserId);
  const userId = user.id;
  // ... validate body, scope all queries to `userId`
}
```

- `lib/auth.ts` resolves the **local `users.id`** (not the raw Clerk ID) by
  looking up `clerk_user_id`, creating the row if it doesn't exist yet
  (first-login provisioning, see R1.3).
- Do **not** return the Clerk ID to clients as the app user id; use the
  local `users.id`.

## Authorization rule (applies to every query)

Every database query that touches `daily_logs`, `lift_logs`,
`workout_plans`, `plan_days`, or `weekly_verdicts` **must** filter by
`user_id` derived from the verified session. Never accept a `user_id` from
the request body or query string. See `docs/security.md` for the full
rationale.

## Environment variables required

App `.env`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```
