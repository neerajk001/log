# API

Base URL: `https://<domain>/api` (see `docs/deployment.md`). All routes
except `/health` and `/ready` require a valid Clerk session token in the
`Authorization: Bearer <token>` header. See `docs/auth.md` for verification
details.

## Error format (all endpoints)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "weight_kg must be a positive number"
  }
}
```

Standard codes: `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400), `NOT_FOUND`
(404), `IDEMPOTENCY_CONFLICT` (409, lift retry specific), `PARSE_FAILED`
(422, plan parsing specific), `RATE_LIMITED` (429), `SERVER_ERROR` (500).

## `GET /health`

No auth. Returns `{status: "ok"}`. Process liveness only; it does not query
Neon and is used by the Docker health check.

## `GET /ready`

No auth. Queries Neon with a short timeout. Returns `{status: "ready"}` on
success or `503 {"status":"unavailable"}` without database details. Used as
the post-deploy readiness gate.

## `GET /api/me`

Returns (and creates on first call) the current user's profile row.

Response:
```json
{ "id": "uuid", "protein_target_g": 135, "calorie_target": 1650 }
```

## `PUT /api/me`

Update `protein_target_g` / `calorie_target`.

## `GET /api/logs/daily/:date`

`:date` = `YYYY-MM-DD`. Returns the log for that date or `null` fields if
none exists yet.

## `PUT /api/logs/daily/:date`

Upsert. Body — any subset of:
```json
{ "weight_kg": 64.8, "calories": 1620, "protein_g": 128, "sleep_hours": 6.5 }
```

## `GET /api/logs/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns an array of daily logs in range, used by Trends.

## `POST /api/logs/lift`

Body:
```json
{
  "id": "optional client-generated uuid",
  "date": "2026-08-08",
  "exercise_name": "Barbell Bench Press",
  "weight_kg": 62.5,
  "reps": 5,
  "plan_day_id": "uuid | null"
}
```

Without `id`, each request appends a new set and returns `201`. With a new
client UUID, the server creates that row and returns `201`; retrying the same
UUID with the same authenticated user and identical payload returns the
existing row with `200`. Reusing the UUID for another owner or changed payload
returns `409 IDEMPOTENCY_CONFLICT`. Distinct UUIDs may intentionally carry
identical weight and reps.

## `GET /api/logs/lift?exercise=<name>&weeks=4`

Returns lift history for one exercise, used by Trends deltas.

## `GET /api/plans`

Returns the user's plans (MVP: typically zero or one active plan).

Response:
```json
[
  {
    "id": "uuid",
    "name": "6-Day Strength + Fat Loss",
    "source": "ai_parsed",
    "is_active": true,
    "created_at": "2026-08-10T12:00:00.000Z",
    "days": [
      {
        "id": "uuid",
        "day_name": "Push",
        "day_order": 1,
        "exercises": [
          { "name": "Barbell Bench Press", "sets": 5, "reps": "5" }
        ]
      }
    ]
  }
]
```

## `GET /api/plans/:id/today`

Resolves which `plan_day` applies to today based on day rotation logic
(see `backend.md`), and returns its exercises plus whether each has
already been logged today.

Response (no active plan day resolves):
```json
{ "plan_id": "uuid", "plan_name": "6-Day Strength + Fat Loss", "day": null }
```

Response (day resolves):
```json
{
  "plan_id": "uuid",
  "plan_name": "6-Day Strength + Fat Loss",
  "day": {
    "id": "uuid",
    "day_name": "Push",
    "day_order": 1,
    "exercises": [
      {
        "name": "Barbell Bench Press",
        "sets": 5,
        "reps": "5",
        "logged": false,
        "last_log": null
      },
      {
        "name": "Overhead Press",
        "sets": 3,
        "reps": "8-12",
        "logged": true,
        "last_log": { "weight_kg": 40, "reps": 10 }
      }
    ]
  }
}
```

## `POST /api/plans/parse`

Accepts either a JSON body `{ "text": "<raw plan text>" }` or a multipart
form upload with a `file` field containing a text-based PDF (the server
extracts its text). Rate-limited to 10 requests/hour per user.

Calls the OpenAI Responses API server-side (`OPENAI_MODEL`, default
`gpt-4.1-mini`; see `backend.md` for the prompt).
**Does not persist anything.** Returns:
```json
{
  "days": [
    { "day_name": "Push", "exercises": [
      { "name": "Barbell Bench Press", "sets": 5, "reps": "5" }
    ]}
  ]
}
```
On parse failure: `422 PARSE_FAILED` with a user-facing message.

## `POST /api/plans`

Body: the (possibly user-edited) result of `/api/plans/parse`, plus a
`name` and `source` (`"manual"` | `"ai_parsed"`):
```json
{
  "name": "6-Day Strength + Fat Loss",
  "source": "ai_parsed",
  "days": [
    { "day_name": "Push", "exercises": [
      { "name": "Barbell Bench Press", "sets": 5, "reps": "5" }
    ]}
  ]
}
```
Persists the plan and its days/exercises, sets it as the active plan
(deactivates any prior active plan for that user). Returns the created
plan in the same shape as `GET /api/plans` (single object, `201`).

## `GET /api/trends?range=4w`

Returns:
```json
{
  "weight": [{ "week_start": "2026-07-14", "avg_kg": 65.3 }, "..."],
  "lifts": [
    { "exercise": "Barbell Bench Press", "this_week_kg": 62.5, "last_week_kg": 60, "delta": "up" }
  ],
  "adherence_pct": 86
}
```

## `GET /api/verdict/weekly`

Computes (via `verdictEngine.ts`, see `docs/backend.md`) and returns the
current week's verdict, persisting a row to `weekly_verdicts`.

```json
{
  "verdict": "hold",
  "week_start_date": "2026-08-03",
  "weight_trend_kg_per_week": -0.5,
  "strength_trend": "up",
  "adherence_pct": 86,
  "reasoning": [
    "Weight dropping in target 0.4–0.7kg/wk range",
    "Bench + deadlift up this week — no strength loss",
    "Protein hit 6 of 7 days"
  ]
}
```

## `GET /api/coach/profile`

Returns the optional coaching profile captured during onboarding, or `null`.

```json
{
  "goal": "Lose fat", "weight_kg": 82, "target_weight_kg": 75, "height_cm": 180,
  "experience": "intermediate", "days_per_week": 4, "equipment": "Full gym",
  "diet_notes": "2200 kcal, 160 g protein", "injuries": null, "notes": null
}
```

## `PUT /api/coach/profile`

Upsert the same fields. Every field is optional (`coach_profiles`, scoped to the
authenticated user).

## `GET /api/coach/sessions`

Returns the user's chats, newest first: `[{ id, title, updated_at, message_count }]`.

## `GET /api/coach/sessions/:id/messages`

Returns that chat's turns (oldest first): `[{ id, role, content, created_at }]`.

## `DELETE /api/coach/sessions/:id`

Deletes a chat and its messages (`{ ok: true }`).

## `GET /api/coach/memory`

Returns the rolling long-term memory (`{ summary, updated_at }`) or `null`.

## `DELETE /api/coach/memory`

Clears the memory.

## `POST /api/coach/chat`

Body `{ "message": "..." }`. The server injects a compact, bounded summary of the
user's profile and last 4 weeks of data (weight, nutrition, top lifts, latest
verdict, active plan), asks the coach model, persists both turns and returns
`{ "reply": "..." }`. Rate-limited to 30 requests/hour per user.

## `POST /api/coach/chat/stream`

Body `{ message, sessionId?, localDate? }`. With no `sessionId` the server creates a
chat and emits `data: {"sessionId":"…"}` as the first event; with one, it must
belong to the caller. `localDate` (YYYY-MM-DD) is the athlete's local date — the
server runs on UTC, so it is used for "today" and the tool date windows. Streams the
reply as Server-Sent Events: `data: {"delta":"…"}` per token,
`data: {"status":"…"}` while the coach looks something up, then
`data: {"done":true}`; on failure mid-stream `data: {"error":"…"}`.

The coach can call read-only tools (`get_day_logs`, `get_lift_history`, `get_daily_logs`,
`get_weekly_verdicts`, `get_plan_vs_actual`, `get_activity_logs`) — all scoped to
the authenticated user, in a bounded loop (max 4 rounds). The user message is
stored up front, and the assistant message is stored with whatever text was
produced — so a client Stop (which aborts the request and the upstream model call)
keeps the partial answer.

Deployment note: this route needs nginx `proxy_buffering off;` (the route already
sets `X-Accel-Buffering: no`), or the VPS proxy buffers the whole response and
defeats streaming.

## `POST /api/coach/plan`

Body (both optional) `{ "goal": "...", "notes": "..." }`. Generates a program from
the profile + recent data. **Does not persist** — returns the same plan shape as
`/api/plans/parse`; confirm via `POST /api/plans`. Rate-limited to 10/hour per user.

## `POST /api/coach/analyze`

`multipart/form-data` with a `file` image (JPEG/PNG/WebP, ≤5 MB) and an optional
`description`. Returns `{ "analysis": "..." }`. The image is sent to the vision
model **transiently and never stored** (see `docs/security.md`). Rate-limited to
10/hour per user.
