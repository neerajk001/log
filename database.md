# Database

Neon Postgres. Schema defined in Prisma (`prisma/schema.prisma`), migrations
via `prisma migrate`. This document is the source of truth for shape — the
Prisma schema file must match it exactly.

## Tables

### `users`

Mirrors the Clerk user minimally — Clerk remains the source of truth for
identity/email; this table exists so other tables have a local FK target
and to store app-specific profile fields.

| column          | type          | notes                              |
|------------------|--------------|-------------------------------------|
| id               | uuid, PK, default gen_random_uuid() | internal ID |
| clerk_user_id    | text, unique, not null | Clerk's user ID |
| protein_target_g | integer, nullable | user-set daily protein target |
| calorie_target   | integer, nullable | user-set daily calorie target |
| plan_tier        | enum `PlanTier` (`free`\|`pro`), default `free` | entitlement; `pro` only honoured while `pro_until` is null or future |
| trial_ends_at    | timestamptz, nullable | server-managed 14-day trial, started when onboarding completes |
| pro_until        | timestamptz, nullable | paid subscription window (written by the store sync) |
| created_at       | timestamptz, default now() | |

### `ai_usage`

Free-tier AI quota, one row per user/feature/period. Pro and active-trial users
never write here — their requests are unlimited.

| column       | type          | notes                                |
|--------------|---------------|----------------------------------------|
| id           | uuid, PK      | |
| user_id      | uuid, FK → users.id, not null | |
| feature      | text, not null | `chat` \| `meal_scan` \| `eating_out` \| `plan_generate` \| `plan_parse` \| `physique` |
| period_start | date, not null | UTC Monday for `chat`, 1st of the month otherwise |
| count        | integer, default 0 | |
| updated_at   | timestamptz, default now() | |

Unique on `(user_id, feature, period_start)`.

### `daily_logs`

One row per user per date. All metric fields nullable — a day can have
partial data.

| column       | type          | notes                                |
|--------------|---------------|----------------------------------------|
| id           | uuid, PK      | |
| user_id      | uuid, FK → users.id, not null | |
| date         | date, not null | |
| weight_kg    | numeric(5,2), nullable | |
| calories     | integer, nullable | |
| protein_g    | integer, nullable | |
| sleep_hours  | numeric(3,1), nullable | |
| created_at   | timestamptz, default now() | |
| updated_at   | timestamptz, default now() | updated on every upsert |

**Constraint:** `unique(user_id, date)` — enforces one row per user per day;
writes are upserts on this key.

### `lift_logs`

One row per logged set entry (top-set logging for MVP — see requirements
R3.4).

| column        | type          | notes                              |
|---------------|---------------|--------------------------------------|
| id            | uuid, PK      | may be client-supplied on authenticated lift creates for retry idempotency |
| user_id       | uuid, FK → users.id, not null | |
| date          | date, not null | |
| exercise_name | text, not null | free text or from plan |
| weight_kg     | numeric(6,2), nullable | `null` = bodyweight or machine plate-stack set (see `plate_position`) |
| reps          | integer, not null | |
| plate_position | integer, nullable | 1-based numbered stack position for machine exercises; mutually exclusive with `weight_kg` |
| plate_increment | numeric(6,2), nullable | calibration snapshot: load per stack position |
| plate_unit    | text, nullable | `"kg"` or `"lb"`; paired with `plate_increment` |
| plan_day_id   | uuid, FK → plan_days.id, nullable | set if logged against a plan exercise |
| created_at    | timestamptz, default now() | |

**Index:** `(user_id, exercise_name, date)` — supports the trends query
(this week vs last week per exercise).

Authenticated clients may supply `id` when creating a set. Exact retries use
the existing row; a conflicting owner or payload is rejected. This uses the
existing primary key and does not add a schema constraint or migration.

A plate-stack set stores `weight_kg = null`, `plate_position`, and (when the
plan is calibrated) `plate_increment` + `plate_unit`. The position and
calibration are snapshotted per set, so editing a plan later does not rewrite
history. `plate_increment` and `plate_unit` must be both present or both absent;
`plate_position` and `weight_kg` are mutually exclusive. Plate sets count as
logged sets and training days but contribute no kg volume, kg PR, or strength
trend — estimated load (`position × increment`) is display-only.

### `workout_plans`

| column      | type          | notes                                  |
|-------------|---------------|-------------------------------------------|
| id          | uuid, PK      | |
| user_id     | uuid, FK → users.id, not null | |
| name        | text, not null | e.g. "6-Day Strength + Fat Loss" |
| source      | text, not null | `'manual'` \| `'ai_parsed'` |
| is_active   | boolean, default true | only one active plan per user (enforced in application logic, not DB constraint) |
| created_at  | timestamptz, default now() | |

### `plan_days`

| column      | type          | notes                                  |
|-------------|---------------|-------------------------------------------|
| id          | uuid, PK      | |
| plan_id     | uuid, FK → workout_plans.id, not null | |
| day_name    | text, not null | e.g. "Push", "Pull", "Legs" |
| day_order   | integer, not null | 1-based order within the plan cycle |
| exercises   | jsonb, not null | array of `{name, sets, reps, weight_kg?, set_targets?, load_mode?, plate_config?}` — denormalized, no separate exercises table for MVP. `load_mode: "plate"` + optional `plate_config: {unit, increment, min_position?, max_position?}` marks a machine stack (bounds default to 1/999). |

### `weekly_verdicts`

Stores a computed verdict snapshot each time one is generated, so
Trends/history can reference past verdicts without recomputation.

| column           | type          | notes                              |
|------------------|---------------|---------------------------------------|
| id               | uuid, PK      | |
| user_id          | uuid, FK → users.id, not null | |
| week_start_date  | date, not null | Monday of the evaluated week |
| verdict          | text, not null | `'hold'` \| `'adjust_calories'` \| `'check_recovery'` |
| weight_trend_kg_per_week | numeric(4,2), nullable | |
| strength_trend   | text, nullable | `'up'` \| `'flat'` \| `'down'` |
| adherence_pct    | integer, nullable | |
| reasoning        | jsonb, not null | array of strings (rule-generated bullets) |
| created_at       | timestamptz, default now() | |

**Constraint:** `unique(user_id, week_start_date)` — one verdict per user
per week (recomputing overwrites).

### `physique_checkins`

Weekly body-photo check-ins. The image is encrypted at rest and decrypted only
in memory for the owner's view and the AI comparison. The model's read and
recommendations are stored as text/JSON.

| column              | type          | notes                              |
|---------------------|---------------|-------------------------------------|
| id                  | uuid, PK      | |
| user_id             | uuid, FK → users.id, not null | |
| date                | date, not null | the athlete's local date of the check-in |
| week_start_date     | date, not null | Monday (UTC) of the ISO week |
| mime_type           | text, not null | `image/jpeg` \| `image/png` \| `image/webp` |
| image_ciphertext    | bytea, not null | AES-256-GCM ciphertext |
| image_iv            | bytea, not null | 12-byte random IV |
| image_tag           | bytea, not null | 16-byte GCM authentication tag |
| image_bytes         | integer, not null | original upload size (metadata only) |
| headline            | text, not null | one-line coach summary |
| assessment          | text, not null | the written physique read |
| recommendations     | jsonb, not null | array of `{area: "training"\|"nutrition"\|"recovery", action, reason}` |
| previous_checkin_id | uuid, nullable, FK → physique_checkins.id | the week the AI compared against; `ON DELETE SET NULL` |
| created_at          | timestamptz, default now() | |
| updated_at          | timestamptz, default now() | updated when the same week is replaced |

**Constraint:** `unique(user_id, week_start_date)` — one check-in per user per
ISO week; uploading again in the same week replaces that week. **Indexes:**
`(user_id, date)` and `previous_checkin_id`.

## Relationships

```
users 1---* daily_logs
users 1---* lift_logs
users 1---* workout_plans
users 1---* weekly_verdicts
users 1---* physique_checkins
physique_checkins 0..1---1 physique_checkins (previous_checkin_id)
workout_plans 1---* plan_days
plan_days 1---* lift_logs (optional link)
```

## Migration workflow

- Schema changes are made in `prisma/schema.prisma` only.
- Run `prisma migrate dev` to generate and apply a migration against the Neon
  connection string in `.env` (`prisma migrate deploy` applies pending
  migrations in production).
- Never hand-edit the database directly outside of migrations.
