# Product

## What it is

"Log" is a mobile app for people in a structured fat-loss or recomposition
phase who are already training with a plan. It replaces manual coaching
judgment calls ("should I hold or adjust?") with three simple daily logs and
one weekly automated verdict.

## Who it's for

Someone actively dieting while lifting weights, who wants to know — without
guessing — whether their current calories and training are working, based on
their own weight trend and strength trend, not a generic calculator.

## Core philosophy (do not violate this in any feature decision)

- **Honest signal over vanity metrics.** No streaks, no badges, no gamified
  motivation mechanics.
- **Minimum friction to log.** Every daily entry should be completable in
  under 10 seconds.
- **The verdict is the product.** Logging data is a means to one end: a
  clear weekly instruction (hold / adjust calories / check recovery).

## MVP feature list

1. **Auth** — sign up / log in via Clerk (email-based).
2. **Daily log** — weight (kg), calories, protein (g), sleep (hours). All
   fields optional per entry; one entry per user per date.
3. **Lift log** — exercise name, weight (kg), reps, tied to a date. Can be
   logged against a planned exercise (if a plan exists) or manually.
4. **Workout plan (optional feature)** — user pastes or uploads a text-based
   plan; an AI call parses it into structured days + exercises; user reviews
   and edits before confirming; confirmed plan drives which exercises show
   as "today's session" in the lift log screen.
5. **Trends** — 7-day rolling average weight, per-exercise strength trend
   (this week vs last week), protein-target adherence percentage.
6. **Weekly verdict** — a rule-based (not AI-based) output computed from
   weight trend + strength trend + adherence, shown as one of three
   verdicts with the reasoning behind it.

## Explicitly out of scope for MVP

- Offline mode / local-first sync with conflict resolution
- Social features, sharing, leaderboards, streak mechanics
- Photo-based progress tracking or handwritten-plan OCR (photo → parse)
- Push notifications
- Web app (mobile-only)
- Multiple concurrent workout plans (one active plan at a time)
- Food database / barcode scanning / recipe builder (nutrition is manual
  totals entry only — the user's existing calorie-tracking app is the
  source of those numbers)
- In-app coaching chat or LLM-generated commentary (verdict text is
  rule-based, not generative, for MVP)

## Success criteria for MVP

A user can, without any manual intervention from the developer:
sign up → log a full week of daily + lift data → optionally import a plan →
see an accurate weekly verdict that matches what a human coach would
conclude from the same three data trends.
