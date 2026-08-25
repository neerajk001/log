# Backend Conventions (Node.js / Express)

## Stack

- Express + TypeScript
- Prisma ORM + `pg` (pooled connection to Neon — see `architecture.md` for
  why not the serverless driver)
- `zod` for request validation
- `@clerk/backend` (or `@clerk/express`) for token verification

## Folder structure

See `docs/architecture.md`. Pattern: **routes are thin** — validate input,
call a service function, return the result. Business logic (verdict rules,
plan parsing, trend aggregation) lives in `src/services/`, not in route
handlers.

## Route handler pattern

```ts
router.put("/logs/daily/:date", requireAuth, validate(dailyLogSchema), async (req, res, next) => {
  try {
    const result = await dailyLogsService.upsert(req.userId, req.params.date, req.body);
    res.json(result);
  } catch (err) { next(err); }
});
```

All errors flow to `middleware/errorHandler.ts`, which maps known error
types to the response shape in `docs/api.md` and logs unexpected errors
server-side without leaking internals to the client.

## Verdict engine (`services/verdictEngine.ts`)

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

This is the MVP rule set. Do not add machine-learning or LLM-based
verdict generation — see `docs/product.md` philosophy section.

## Plan parser (`services/planParser.ts`)

Server-side only call to Google Gemini Flash via the Gemini API. Fixed system
prompt instructing strict JSON output matching the schema in
`docs/api.md` (`POST /api/plans/parse` response shape). No free-form text
response is acceptable — validate the model's output against a zod schema
before returning it to the client; on schema mismatch, treat as a parse
failure (`422 PARSE_FAILED`), not a silent guess-fill.

The Gemini API key lives in backend `.env` only (`GEMINI_API_KEY`) —
never exposed to the client, per `security.md`. The model can be selected with
`GEMINI_MODEL`.

## Plan day rotation (`services/planRotation.ts`)

Used by `GET /api/plans/:id/today`. Given an active plan and a date,
resolve the applicable `plan_day` as follows:

```
dayOrder = (whole days since the plan's start date) mod (number of plan days) + 1
```

- The plan's start date is the calendar date it was created/imported
  (`workout_plans.created_at`).
- Plan days are ordered by `day_order` (1-based).
- Before the start date, the first day (`day_order = 1`) applies.

This is a pure function with no I/O and is unit-testable.

## Environment variables (backend)

```
DATABASE_URL=            # Neon pooled connection string
CLERK_SECRET_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
PORT=3000
NODE_ENV=production
```
