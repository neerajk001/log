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

Returns lift history for one exercise, used by Trends deltas. Also accepts
`from`/`to`, or `days`.

## `GET /api/logs/lift/summary?days=120&before=YYYY-MM-DD`

The Lift screen's "recent exercises" chips, its `Last:` cue and its set-by-set
pre-fill, computed server-side:
`{ names: string[], last_by_exercise: LiftLog[], last_sets_by_exercise: Record<string, { date: string, sets: { weight_kg: number, reps: number }[] }> }`
— up to 12 distinct exercise names ordered by most recently used, plus one row per
exercise (newest session, heaviest set of it) and that session's full set list in
logged order (capped at 20 sets). `before` is the athlete's local date; the "last"
rows are strictly before it, so today's own sets never count as "last". This
replaced a client-side download of every set in the window.

Each set is `{ weight_kg: number, reps: number }`.

## `GET /api/logs/lift/metrics?from&to&prev_from&prev_to`

The Insights rollup: `{ days: [{ date, sets }], exercises: ExerciseMetrics[] }` where
each exercise carries `sets`, `volume`, `best_kg/best_reps/best_date`, `prev_best_kg`
(the record that preceded the current best, for the PR delta) and
`current_top_kg`/`previous_top_kg` (the period comparison behind the Strength tile).
The client keeps the presentation maths (muscle names via its own table, streaks,
series) — only the row transfer moved here. It replaced pulling up to 5,000 individual
sets, twice the range, on every visit.

## `GET /api/plans`

Returns the user's plans. `?active=1` returns only the active one — the Lift screen uses
it instead of pulling every plan's days and exercises to find the active plan's id.

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

## `GET /api/plans/:id/today?date=YYYY-MM-DD`

The Lift screen sends the athlete's **local** date — the server's UTC day can be behind it
(IST is UTC+5:30), and that date decides both the rotation and which sets count as already
logged. Defaults to the server's today when omitted.

Resolves which `plan_day` applies to that date based on day rotation logic
(see `backend.md`), and returns its exercises plus whether each has
already been logged today.

If the athlete actually trained a different day than the rotation calls for
(e.g. logged a Legs session on a Push day), that trained day is returned
instead — sets logged from a plan exercise are attributed by `plan_day_id`,
quick logs by exercise name. Nothing logged on the date falls back to the
rotated day.

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
        "weight_kg": 60,
        "set_targets": [{ "weight_kg": 60 }, { "weight_kg": 62.5 }],
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
      {
        "name": "Barbell Bench Press",
        "sets": 5,
        "reps": "5",
        "weight_kg": 60,
        "set_targets": [{ "weight_kg": 60 }, { "weight_kg": 62.5 }, { "weight_kg": 65 }]
      }
    ]}
  ]
}
```
`weight_kg` is the exercise's default target, and the optional `set_targets`
prescribes it set by set (a pyramid), in set order: entry 1 is set 1, a missing
or `null` weight means "use the default", and `reps` may override the exercise's
scheme for that set. Both are carried through unchanged and drive the target
caption under each row on the Lift screen (`Plan · 62.5 kg × 8`) and the
set-by-set pre-fill from the previous session. `set_targets` is capped at 99
entries; plans saved without it behave exactly as before.

Persists the plan and its days/exercises, sets it as the active plan
(deactivates any prior active plan for that user). Returns the created
plan in the same shape as `GET /api/plans` (single object, `201`).

## `GET /api/trends?range=7d|30d|90d|1y&weeks=1&date=YYYY-MM-DD`

`weeks` is the nutrition card's own weekly window (1–52, default 1). `date` is the
athlete's **local** date: it anchors every bucket, and it decides which days count as
"completed" — the server's UTC day is behind IST, which would otherwise hide today's
rows and shift the charts a day.

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
current week's verdict, persisting a row to `weekly_verdicts`. Accepts an
optional `?date=YYYY-MM-DD` (the athlete's local date — the server runs on UTC
and near midnight the weeks can differ); omitted means the server's UTC today.

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

## `POST /api/coach/chat/stream`

The only chat endpoint (the older non-streaming `POST /api/coach/chat` was removed).

Body `{ message, sessionId?, localDate?, agent?, retry? }`. With no `sessionId` the server creates a
chat and emits `data: {"sessionId":"…"}` as the first event; with one, it must
belong to the caller. `localDate` (YYYY-MM-DD) is the athlete's local date — the
server runs on UTC, so it is used for "today" and the tool date windows. `agent`
(`general` | `meal` | `training`) is the explicit UI pick; without it the server
routes by the message's content. `retry: true` marks a replayed failed turn: the
user message is stored only if it isn't already the newest stored turn, so a
retry never duplicates the prompt in history. Streams the reply as Server-Sent
Events: `data: {"delta":"…"}` per token, `data: {"status":"…"}` while the coach
looks something up, `data: {"proposal":{…}}` for a change awaiting confirmation,
then `data: {"done":true,"usage":{"input_tokens":n,"output_tokens":n,"rounds":n}}`
(the provider's token totals for the turn, so clients can report cost); on
failure mid-stream `data: {"error":"…","code":"COACH_…"}` — `error` is always
user-facing copy, never a raw internal message. Rate-limited
to 30 requests/hour per user.

`dismissedMeal` (optional) is a meal estimate the athlete just dismissed —
`{ title, items[], calories, protein_g, date? }`. The server puts it in front of
the model together with `message` (their reason), so the coach **re-estimates from
the correction** instead of repeating itself; it is not stored as a chat message
(the athlete's own words are), and it forces an immediate long-term-memory refresh
so the correction applies to later meals — including photo estimates, which get
the memory summary in their prompt.

The coach can call read-only tools (`get_day_logs`, `get_lift_history`, `get_daily_logs`,
`get_weekly_verdicts`, `get_plan_vs_actual`, `get_meals`, `lookup_food`) plus the
proposal tools (`log_meal`, `update_meal`, `delete_meal`, `update_plan`,
`activate_plan`, `delete_plan`, `update_logged_set`, `delete_logged_set`,
`record_decision`) — all scoped to the authenticated user, in a bounded loop (max 4
rounds). Proposals never apply themselves. Each proposal carries a server-generated
`id` and is stored with the assistant message, so reopening the chat restores the
confirm/dismiss cards; re-confirming a restored meal proposal replays the same
create request instead of logging the meal twice. The user message is stored up
front, and the assistant message is stored with whatever text was produced — so a
client Stop (which aborts the request and the upstream model call) keeps the
partial answer.

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

## `GET /metrics`

No Clerk auth. Prometheus text exposition (version 0.0.4) of in-process counters
and latency histograms: HTTP requests by redacted route/status class + duration,
coach turns/rounds, provider-reported input/output tokens, tool calls, provider
retries, and coach failures by code. Labels carry route patterns, status classes,
tool names and error codes only — never user ids, session ids or content.

**404 unless `METRICS_TOKEN` is set**; scrapers then authenticate with
`Authorization: Bearer <METRICS_TOKEN>` (constant-time compare). Excluded from
the request-timing log so scrapes don't pollute it.
