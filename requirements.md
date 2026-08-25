# Requirements & Acceptance Criteria

Every feature below must satisfy its acceptance criteria before being
considered done. Reference the phase files in `tasks/` for build order.

## R1 — Authentication

- R1.1 User can sign up with email via Clerk.
- R1.2 User can log in / stay logged in across app restarts.
- R1.3 On first successful login, the backend provisions a row in the local
  `users` table keyed by Clerk's user ID (see `docs/database.md`).
- R1.4 All API requests without a valid Clerk session token return `401`.

**Acceptance:** A new user can sign up, close the app, reopen it, and land
on the Today screen already authenticated, with a `users` row present in
the database.

## R2 — Daily log (weight, calories, protein, sleep)

- R2.1 User can enter/update weight, calories, protein, sleep for any date,
  independently — no field is required to save another.
- R2.2 Only one daily log row exists per user per date (upsert behavior).
- R2.3 The Today screen pre-fills each field with the previous day's value
  as a placeholder (not a committed value) to reduce typing.
- R2.4 Saving is optimistic: the UI updates immediately; a failed server
  save shows a retry affordance without losing the entered value.

**Acceptance:** Logging weight only (no calories/protein/sleep) saves
successfully. Re-opening the app the next day shows yesterday's values as
greyed placeholder text, not committed values.

## R3 — Lift log

- R3.1 User can log exercise name, weight (kg), reps for the current date.
- R3.2 If an active workout plan exists and today maps to a plan day, the
  Lift screen shows that day's exercises as tap-to-log cards.
- R3.3 If no plan exists, or the user wants to log something off-plan, a
  manual entry path (search/type exercise name) is always available.
- R3.4 Multiple lift entries per exercise per day are allowed (e.g. logging
  each working set), but MVP only requires capturing one top-set entry per
  exercise for trend purposes — see `docs/database.md` for the exact shape.

**Acceptance:** User can complete a full planned session by tapping each
exercise card and entering weight×reps, with each card visually marking
itself done.

## R4 — Workout plan import (optional feature)

- R4.1 User can paste raw plan text, or upload a text-based PDF.
- R4.2 Backend sends the text to Google Gemini Flash with a fixed prompt/schema
  (see `docs/api.md`) and returns structured JSON: days → exercises →
  {name, sets, reps}.
- R4.3 The parsed result is shown to the user as an editable preview before
  saving — nothing is persisted until the user confirms.
- R4.4 On confirm, the plan and its days/exercises are saved and become the
  active plan (only one active plan per user in MVP).
- R4.5 Parsing failures (malformed input, API error) show a clear error and
  let the user retry or fall back to manual plan entry.

**Acceptance:** Uploading the reference 6-day plan (see
`docs/user-flows.md` fixture) produces 6 correctly parsed days with correct
exercise names and rep ranges, editable before save.

## R5 — Trends

- R5.1 Weight: 7-day rolling average, plotted over the last 4 weeks.
- R5.2 Lifts: current week's top set vs previous week's, per exercise, with
  a direction indicator (up/flat/down).
- R5.3 Adherence: percentage of days in the current week where protein
  target was met (target is a fixed user-set number, not calculated).

**Acceptance:** Trends screen reflects real logged data with no manual
refresh needed beyond a normal screen load.

## R6 — Weekly verdict

- R6.1 Verdict is computed by a deterministic rule function (not an LLM
  call) — see `docs/backend.md` for the exact rule logic.
- R6.2 Three possible verdicts: **Hold Steady**, **Adjust Calories**,
  **Check Recovery**.
- R6.3 Verdict screen shows the verdict, the three underlying signals
  (weight trend, strength trend, adherence %), and 2-4 short reasoning
  bullet points generated from the same rule evaluation (not free-text AI
  generation).
- R6.4 Verdict recomputes weekly (on-demand when the user opens the
  screen, computed from the trailing 7 days — no scheduled background job
  required for MVP).

**Acceptance:** Given a fixture week of data matching each of the three
rule branches (see `docs/backend.md`), the correct verdict is returned for
each case.

## Cross-cutting requirements

- **R7 — Every logging action must be completable in under 10 seconds** of
  active interaction (excludes typing time for exact numbers).
- **R8 — No feature may block the core loop.** Plan import failures, AI
  errors, or trends computation errors must never prevent daily/lift
  logging from working.
