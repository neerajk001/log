# Backend Conventions (Next.js Route Handlers)

## Stack

- Next.js App Router Route Handlers (`app/api/**/route.ts`)
- Prisma ORM + `pg` (pooled connection to Neon — see `architecture.md`)
- `zod` for request validation
- `@clerk/nextjs/server` (`auth()`) for session verification

## Folder structure

See `docs/architecture.md`. Pattern: **Route Handlers are thin** — resolve
`userId`, validate input, call a service function, return the result.
Business logic (verdict rules, plan parsing, trend aggregation, day
rotation) lives in `lib/services/`, not in handlers.

## Route Handler pattern

```ts
// app/api/logs/daily/[date]/route.ts — shape, not final code
import { auth } from '@clerk/nextjs/server';
import { findOrCreateUser } from '@/lib/auth';
import { upsertDailyLog } from '@/lib/services/dailyLogs';
import { dailyLogSchema } from '@/lib/validation/schemas';

export async function PUT(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Missing session' } }, { status: 401 });
  }
  const user = await findOrCreateUser(clerkUserId);
  const { date } = await params;
  const body = await req.json().catch(() => null);
  const parsed = dailyLogSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }, { status: 400 });
  }
  try {
    const result = await upsertDailyLog(user.id, date, parsed.data);
    return Response.json(result);
  } catch (err) {
    // centralized error mapping in lib/error.ts
    return toErrorResponse(err);
  }
}
```

All errors map to the response shape in `docs/api.md` via a shared
`toErrorResponse()` helper; unexpected errors are logged server-side without
leaking internals to the client.

## Verdict engine (`lib/services/verdictEngine.ts`)

Pure function, no I/O — takes pre-fetched trailing-7-day data, returns a
verdict. Must be unit-testable with fixtures alone (see `docs/testing.md`).

Rules (in priority order — first match wins):

```
1. If strength_trend == "down" for 2+ consecutive weeks
   → verdict: "check_recovery"
   → reasoning includes: sleep/adherence check prompt

2. Else if weight_trend_kg_per_week < -0.8 (losing too fast)
   AND strength_trend != "up"
   → verdict: "adjust_calories" (increase)
   → reasoning: deficit too aggressive, muscle-loss risk

3. Else if weight_trend_kg_per_week > -0.2 for 2+ weeks (stalled)
   AND adherence_pct >= 80 (ruling out poor tracking as the cause)
   → verdict: "adjust_calories" (decrease or investigate)
   → reasoning: intake likely underestimated or deficit too small

4. Else (weight trending down 0.3–0.8 kg/wk AND strength holding/up)
   → verdict: "hold"
   → reasoning: signals all on track
```

This is the MVP rule set. Do not add machine-learning or LLM-based verdict
generation — see `docs/product.md` philosophy section.

## Plan parser (`lib/services/planParser.ts`)

Server-side only call to OpenAI via the OpenAI API (never
invoked from a Client Component). Fixed system prompt instructing strict
JSON output matching the schema in `docs/api.md` (`POST /api/plans/parse`
response shape). No free-form text response is acceptable — validate the
model's output against a zod schema before returning it to the client; on
schema mismatch, treat as a parse failure (`422 PARSE_FAILED`), not a silent
guess-fill.

The OpenAI API key lives in `.env` only (`OPENAI_API_KEY`) — never exposed
to the client, per `security.md`. The model can be selected with
`OPENAI_MODEL`.

## Plan day rotation (`lib/services/planRotation.ts`)

Used by `GET /api/plans/[id]/today`. Given an active plan and a date,
resolve the applicable `plan_day` as follows:

```
dayOrder = (whole days since the plan's start date) mod (number of plan days) + 1
```

- The plan's start date is the calendar date it was created/imported
  (`workout_plans.created_at`).
- Plan days are ordered by `day_order` (1-based).
- Before the start date, the first day (`day_order = 1`) applies.

This is a pure function with no I/O and is unit-testable.

## Environment variables

```
DATABASE_URL=            # Neon pooled connection string
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NODE_ENV=production
```
