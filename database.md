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
| created_at       | timestamptz, default now() | |

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
| id            | uuid, PK      | |
| user_id       | uuid, FK → users.id, not null | |
| date          | date, not null | |
| exercise_name | text, not null | free text or from plan |
| weight_kg     | numeric(6,2), not null | |
| reps          | integer, not null | |
| plan_day_id   | uuid, FK → plan_days.id, nullable | set if logged against a plan exercise |
| created_at    | timestamptz, default now() | |

**Index:** `(user_id, exercise_name, date)` — supports the trends query
(this week vs last week per exercise).

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
| exercises   | jsonb, not null | array of `{name: string, sets: number, reps: string}` — denormalized, no separate exercises table for MVP |

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

## Relationships

```
users 1---* daily_logs
users 1---* lift_logs
users 1---* workout_plans
users 1---* weekly_verdicts
workout_plans 1---* plan_days
plan_days 1---* lift_logs (optional link)
```

## Migration workflow

- Schema changes are made in `prisma/schema.prisma` only.
- Run `prisma migrate dev` to generate and apply a migration against the Neon
  connection string in `.env` (`prisma migrate deploy` applies pending
  migrations in production).
- Never hand-edit the database directly outside of migrations.
