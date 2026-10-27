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
{
  "id": "uuid",
  "protein_target_g": 135,
  "calorie_target": 1650,
  "plan_tier": "free",
  "trial_ends_at": "2026-11-07T10:00:00.000Z",
  "pro_until": null,
  "is_pro": true,
  "is_trial": true,
  "trial_days_left": 14
}
```

`is_pro` is true during an active trial or an unexpired subscription. Free-tier
AI usage counters are **not** included here (they live on
`GET /api/billing/status`) so the root-layout profile fetch stays a single
cheap row read.

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
  "plate_position": null,
  "plate_increment": null,
  "plate_unit": null,
  "plan_day_id": "uuid | null"
}
```

`weight_kg` may be `null` for a bodyweight set (reps only) — e.g. a hanging leg
raise or plank. Bodyweight sets still count as logged sets/reps, but they add no
volume and never set a kg record or strength delta.

For a machine plate stack, send `weight_kg: null` plus `plate_position` (1-based
stack number). Optionally include the calibration snapshot `plate_increment` and
`plate_unit` (`"kg"` or `"lb"`); they must be supplied together. A position
without calibration is valid. `plate_position` and a non-null `weight_kg` are
mutually exclusive. Plate sets count as work but stay out of kg volume, records
and strength trends; any estimated load is display-only.

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
`{ names: string[], last_by_exercise: LiftLog[], last_sets_by_exercise: Record<string, { date: string, sets: LiftSetLoad[] }> }`
— up to 12 distinct exercise names ordered by most recently used, plus one row per
exercise (newest session, heaviest set of it) and that session's full set list in
logged order (capped at 20 sets). `before` is the athlete's local date; the "last"
rows are strictly before it, so today's own sets never count as "last". This
replaced a client-side download of every set in the window.

Each set is a `LiftSetLoad`: `{ weight_kg: number | null, reps: number,
plate_position?, plate_increment?, plate_unit? }`. `weight_kg` null means the set
was bodyweight (no plate fields) or a machine stack (`plate_position` set). Lift
rows pre-fill a plate exercise's previous position (falling back to the plan's
minimum) and never pre-fill a kg load for it.

## `GET /api/logs/lift/progress?from&to&prev_from&prev_to`

Per-exercise progress for the Insights card and the exercise detail screen.
`from`/`to` are inclusive; `prev_from`/`prev_to` are the equally-long window
immediately before them. Sessions are aggregated on the server — raw sets are
not returned.

```json
{
  "from": "2026-07-01",
  "to": "2026-09-28",
  "prev_from": "2026-04-03",
  "prev_to": "2026-06-30",
  "exercises": [
    {
      "name": "Bench Press",
      "mode": "kg",
      "sessions": 12,
      "sets": 36,
      "volume": 18450,
      "best_value": 82.5,
      "previous_best_value": 80,
      "change_pct": 3.1,
      "change_value": 2.5,
      "best_set": {
        "weight_kg": 82.5, "reps": 4,
        "plate_position": null, "plate_increment": null, "plate_unit": null
      },
      "points": [
        {
          "date": "2026-07-02", "sets": 3, "reps": 24, "volume": 1500,
          "top_value": 65,
          "best_set": {
            "weight_kg": 65, "reps": 8,
            "plate_position": null, "plate_increment": null, "plate_unit": null
          }
        }
      ]
    }
  ]
}
```

`mode` is `kg`, `plate`, or `bw` (bodyweight). For kg exercises
`best_value`/`change_pct` track weight; for plate exercises they track the
highest stack position; for bodyweight they track reps. `change_pct` is null
outside kg mode. `volume` is kg-only, so plate and bodyweight sets contribute
zero. Plate points keep their calibration snapshot in `best_set`.

## `GET /api/logs/lift/metrics?from&to&prev_from&prev_to`

The Insights rollup: `{ days: [{ date, sets }], exercises: ExerciseMetrics[] }` where
each exercise carries `sets`, `volume`, `best_kg/best_reps/best_date`, `prev_best_kg`
(the record that preceded the current best, for the PR delta) and
`current_top_kg`/`previous_top_kg` (the period comparison behind the Strength tile).
The client keeps the presentation maths (strength deltas and PR records) — only the
row transfer moved here. It replaced pulling up to 5,000 individual sets, twice the
range, on every visit.

## Meals

### `GET /api/meals?date=YYYY-MM-DD`

Returns that day's meals and their totals:
```json
{
  "date": "2026-10-24",
  "meals": [
    {
      "id": "uuid", "date": "2026-10-24", "title": "Chicken bowl",
      "items": [{ "name": "Chicken", "quantity": "150 g", "calories": 250, "protein_g": 40 }],
      "calories": 620, "protein_g": 48, "source": "ai"
    }
  ],
  "totals": { "calories": 620, "protein_g": 48 }
}
```

### `POST /api/meals`

Body `{ id?, date, title, items, calories, protein_g, source }` where `source` is
`"ai" | "photo" | "manual"` and the totals must equal the sum of the items (±1).
`calories` and `protein_g` roll into that day's `daily_logs` totals in the same
transaction. An optional client UUID makes retries idempotent: the same payload
replays the existing row (`200`), a different payload is `409
IDEMPOTENCY_CONFLICT`. Returns the meal (`201` on create).

### `PUT /api/meals/:id` / `DELETE /api/meals/:id`

Edit or delete an owned meal; the day's totals are adjusted by the delta. A
concurrent edit that changes the totals first is rejected with `409 MEAL_CHANGED`
so a stale delta never corrupts the day.

### `POST /api/meals/analyze`

`multipart/form-data` with a required `file` image (JPEG/PNG/WebP, ≤5 MB), an
optional `description` and the athlete's local `date`. Estimates a meal from the
photo; the image is sent to the vision model transiently and never stored.
Returns `{ title, items, calories, protein_g, confidence, question?, day }`.
Metered as `meal_scan` (3/month Free).

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
        "load_mode": "weight",
        "plate_config": null,
        "logged": false,
        "last_log": null
      },
      {
        "name": "Leg Press",
        "sets": 3,
        "reps": "10",
        "weight_kg": null,
        "set_targets": null,
        "load_mode": "plate",
        "plate_config": { "unit": "kg", "increment": 5, "min_position": 1, "max_position": 20 },
        "logged": true,
        "last_log": {
          "weight_kg": null,
          "reps": 10,
          "plate_position": 8,
          "plate_increment": 5,
          "plate_unit": "kg"
        }
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

For a machine stack, add `"load_mode": "plate"` and optionally a calibration:
```json
{
  "name": "Leg Press",
  "sets": 3,
  "reps": "10",
  "load_mode": "plate",
  "plate_config": { "unit": "kg", "increment": 5 }
}
```
`plate_config` requires `load_mode: "plate"`; omit it to log positions without
load estimates. `increment` is the load one numbered position represents (so
estimated load = position × increment), and positions are 1-based.
`min_position`/`max_position` are optional and default to `1`/`999`; when
supplied, `max_position` must be ≥ `min_position`. Plate exercises should omit
`weight_kg`/`set_targets`; the Lift screen asks for a stack position instead of
kg. The plan JSON is stored as-is, so existing kg-only exercises are unchanged.

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

Free accounts are clamped to `range=7d` server-side. The response then carries
`"limited": true` and `"max_days": 7`, alongside the effective `range`, so the
client can show an upgrade prompt without inventing numbers. Pro (and the
trial) gets the requested range.

## `GET /api/insights/body?range=30d|90d|1y&date=YYYY-MM-DD`

**Pro only** (`402 UPGRADE_REQUIRED` otherwise). Deterministic and DB-only — no
model call and no quota. Returns the detailed weight/nutrition analysis for the
window ending on the athlete's local `date`:

```json
{
  "range": "90d",
  "from": "2026-07-27",
  "to": "2026-10-24",
  "data_quality": {
    "days": 90, "days_with_calories": 74, "days_with_protein": 74,
    "weigh_ins": 41, "coverage_pct": 82, "sufficient": true
  },
  "weight": {
    "latest_kg": 78, "average_7d_kg": 78.2, "start_kg": 81.4,
    "change_kg": -3.4, "rate_kg_per_week": -0.48, "plateau": false,
    "weigh_ins": 41,
    "points": [
      { "date": "2026-07-27", "kg": 81.4, "calories": 1790, "protein_g": 151 }
    ],
    "goal": {
      "target_kg": 75, "direction": "losing",
      "weeks_to_target": 6, "target_date": "2026-12-05"
    }
  },
  "calories": {
    "target": 1800, "average": 1832, "hit_rate_pct": 71, "days_logged": 74,
    "weekday_avg": 1750, "weekend_avg": 2200, "variability": 210
  },
  "protein": {
    "target": 150, "average": 148, "hit_rate_pct": 71, "days_logged": 74,
    "weekday_avg": 160, "weekend_avg": 120, "variability": 24,
    "grams_per_kg": 1.9
  },
  "weekly_pattern": [
    { "day": 1, "label": "Mon", "calories": 1750, "protein_g": 160, "days": 12 },
    { "day": 6, "label": "Sat", "calories": 2200, "protein_g": 120, "days": 11 }
  ],
  "previous": {
    "from": "2026-04-28", "to": "2026-07-26",
    "weight_rate_kg_per_week": -0.3, "calories_average": 1790,
    "protein_hit_rate_pct": 62, "weigh_ins": 36, "calories_days": 70
  },
  "implied_maintenance": {
    "kcal": 2360, "low": 2160, "high": 2560,
    "span_days": 88, "logged_days": 74,
    "note": "Estimate from 74 logged days and 88 days of weigh-ins."
  },
  "insights": ["Weight is down 0.48 kg/week.", "…"]
}
```

`calories.hit_rate_pct` counts days within ±5% of the calorie target;
`protein.hit_rate_pct` counts days at or above the protein target. Nutrition
averages exclude the current incomplete day; weight includes today's reading.
`weekly_pattern` is Monday-first (one row per weekday, with `days` = logged
days), and `previous` is the equally-long window immediately before `from` so
the client can show current-vs-previous context.
`implied_maintenance` is `null` until there are at least three weeks of
weigh-ins and 14 logged days in that span. The figures are directional, not
medical advice. All newer metadata is exposed in `data_quality` so the client
can show when the data is too thin to trust.

## `GET /api/billing/status`

Returns the athlete's entitlement plus this period's AI usage:

```json
{
  "plan_tier": "free",
  "is_pro": false,
  "is_trial": false,
  "trial_ends_at": "2026-11-07T10:00:00.000Z",
  "trial_days_left": 0,
  "pro_until": null,
  "purchase_enabled": false,
  "features": [
    { "feature": "chat", "used": 2, "limit": 3, "resets_on": "2026-10-26", "allowed": true }
  ]
}
```

`limit` is `null` for unlimited (Pro/trial). Free allowances: `chat` 3/week,
`meal_scan` 3/month, `plan_generate` 1/month, `plan_parse` 2/month, `physique` 0.
Weekly windows start on the UTC Monday; monthly ones on the 1st.

`purchase_enabled` is `true` only once the store products exist and
`BILLING_PURCHASE_ENABLED=true`; until then the paywall is honest that nothing
can be purchased.

## `POST /api/billing/revenuecat/webhook`

RevenueCat calls this endpoint directly (no Clerk token). It is the source of
truth for store purchases and updates `users.plan_tier` / `users.pro_until`;
the app continues to read entitlements from `GET /api/billing/status`.

- **Auth:** the request must carry the `Authorization` header value configured
  on the RevenueCat webhook (`REVENUECAT_WEBHOOK_SECRET`; a `Bearer <value>`
  form is also accepted). Missing config returns `503`; a bad value `401`.
- **Idempotent:** every event id is stored in `billing_events` with a unique
  constraint. Replayed events return `200` without re-applying. A failed
  transaction rolls back, so RevenueCat's retry can process it again.
- **Events acted on:** `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`,
  `PRODUCT_CHANGE`, `SUBSCRIPTION_EXTENDED`, `NON_RENEWING_PURCHASE`,
  `CANCELLATION` (keeps access until expiry; a refund-style negative-price
  cancellation revokes), `BILLING_ISSUE` (keeps access through the grace
  period), `EXPIRATION`, `SUBSCRIPTION_PAUSED`, `REFUND`, `REFUND_REVERSED`,
  and `TRANSFER` (moves the entitlement between accounts).
- **Audit:** the raw event, environment (`PRODUCTION`/`SANDBOX`), local user
  link and processed marker are in `billing_events` for reconciliation.
- **Revenue dashboard:** use the RevenueCat dashboard (MRR, trials, conversions,
  churn, refunds, transactions); `billing_events` is the app-side audit trail.

## `POST /api/billing/dev/simulate`

**Development only** — returns `404` when `NODE_ENV=production`. Body
`{ "mode": "free" | "trial" | "trial_expired" | "pro" }` puts the account in
that state without a store:

| mode            | stored state                                              |
|-----------------|-----------------------------------------------------------|
| `trial`         | Free tier + `trial_ends_at = now + BILLING_TRIAL_DAYS`     |
| `trial_expired` | Free tier + `trial_ends_at` in the past (falls back to Free) |
| `pro`           | `plan_tier = pro`, no trial running                        |
| `free`          | Free tier, never trialled                                  |

Every call also clears that user's `ai_usage` rows, so "out of free messages"
can be re-tested immediately instead of waiting for the window to roll.

### `402 UPGRADE_REQUIRED`

The billable AI endpoints (`/api/coach/chat/stream`, `/api/coach/plan`,
`/api/coach/analyze`, `/api/coach/physique`, `/api/meals/analyze`,
`/api/plans/parse`) return
`402 {"error":{"code":"UPGRADE_REQUIRED","message":"…"}}` when a Free athlete
has spent this period's allowance.
The message is written for the athlete, so clients should show it and route to
the paywall rather than a generic error.

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

Returns that chat's turns (oldest first): `[{ id, role, content, proposals, created_at }]`.
Stored proposals include their `status` once the athlete applies or dismisses them.

## `POST /api/coach/proposals/:id`

Body `{ status: "applied" | "dismissed" }`. Persists the decision on the stored
proposal so reopening the chat does not show the same confirmation card again.

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

One-off check-in: `multipart/form-data` with a `file` image (JPEG/PNG/WebP,
≤5 MB) and an optional `description`. Returns `{ "analysis": "..." }`. The image
is sent to the vision model **transiently and never stored** (see
`docs/security.md`). For the stored weekly flow use `/api/coach/physique`.
Rate-limited to 10/hour per user.

## Weekly physique check-ins

Stored at rest as AES-256-GCM ciphertext (`PHYSIQUE_ENCRYPTION_KEY` must be set
server-side; without it, creating a check-in or fetching an image fails closed
with `503` — metadata may still be listed). One check-in per ISO week: posting
again in the same week replaces that week's photo and read.
The AI compares the photo with the previous check-in (decrypted only in memory)
and the athlete's weight/strength/adherence context.

### `GET /api/coach/physique`

Newest first, metadata and the coach's read only — never the image bytes:

```json
[
  {
    "id": "uuid", "date": "2026-10-25", "week_start_date": "2026-10-19",
    "headline": "Waist tighter, shoulders fuller",
    "assessment": "Visible change against the previous check-in with the same lighting…",
    "recommendations": [
      { "area": "nutrition", "action": "Hold calories", "reason": "Weight trend is in range." }
    ],
    "previous_checkin_id": "uuid | null",
    "image_bytes": 184233,
    "created_at": "2026-10-25T06:00:00.000Z",
    "updated_at": "2026-10-25T06:00:00.000Z"
  }
]
```

`area` is `training`, `nutrition` or `recovery`. The list is owner-scoped and
remains readable after a downgrade to Free (own data is never lost); creating a
new check-in is Pro-only (`physique` free allowance is 0).

### `POST /api/coach/physique`

`multipart/form-data` with a required `file` (JPEG/PNG/WebP, ≤5 MB), the
athlete's local `date`, and `consent=true` (explicit consent to encrypted
storage). Returns the created/replaced check-in in the list shape. Metered as
`physique`; a Free account gets `402 UPGRADE_REQUIRED`. Rate-limited to
10/hour per user.

### `GET /api/coach/physique/:id/image`

Owner-only decrypted image bytes, `Content-Type` as uploaded and
`Cache-Control: private, no-store`. `404` when the id does not belong to the
caller.

### `DELETE /api/coach/physique/:id` / `DELETE /api/coach/physique`

Deletes one owned check-in (`{ "ok": true }`) or every check-in for the caller
(`{ "ok": true, "deleted": n }`). Any check-in that pointed at a deleted row has
its `previous_checkin_id` set null.

## `GET /metrics`

No Clerk auth. Prometheus text exposition (version 0.0.4) of in-process counters
and latency histograms: HTTP requests by redacted route/status class + duration,
coach turns/rounds, provider-reported input/output tokens, tool calls, provider
retries, and coach failures by code. Labels carry route patterns, status classes,
tool names and error codes only — never user ids, session ids or content.

**404 unless `METRICS_TOKEN` is set**; scrapers then authenticate with
`Authorization: Bearer <METRICS_TOKEN>` (constant-time compare). Excluded from
the request-timing log so scrapes don't pollute it.
