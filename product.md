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
- In-app coaching chat or LLM-generated commentary
  - **Updated:** the AI Coach (`/api/coach/*`) is now in scope as an *additive*
    feature — optional onboarding, AI plan generation, and a chat that knows the
    user's logs. The weekly verdict itself stays deterministic and rule-based;
    the coach sits beside it. One-off body/menu photos are analyzed transiently
    (never stored), while explicit weekly physique check-ins are stored
    AES-256-GCM encrypted at rest so the coach can compare week to week; the
    athlete can delete them at any time.

## Success criteria for MVP

A user can, without any manual intervention from the developer:
sign up → log a full week of daily + lift data → optionally import a plan →
see an accurate weekly verdict that matches what a human coach would
conclude from the same three data trends.

## Monetization (freemium)

- **Free forever:** daily/lift/activity logging, history, manual meal logging,
  plan CRUD, 7-day insights, and the weekly verdict. These have zero marginal
  server cost and are the acquisition loop.
- **Pro:** the AI coach (chat, memory, tools), AI meal estimation, AI plan
  generation and import, one-off physique check-ins, the wide analytics ranges
  (3M/1Y), lift-progress drilldowns, PR history, and **weekly encrypted physique
  check-ins** (one photo per ISO week, compared with the previous check-in plus
  the logs).
- **14-day Pro trial** on every new account, started when onboarding
  completes — not at sign-up, so an abandoned setup doesn't burn it. When it
  expires the account **falls back to Free**; it never loses access to its own
  logged data or the verdict.
- **Free AI allowance outside the trial:** 3 coach messages/week, 3 meal scans
  /month, 1 AI plan /month, 2 plan imports /month, no physique scans. Enforced
  server-side (`requireFeature` on `ai_usage`), never by hiding UI alone.
- **The verdict stays free and rule-based.** It is the product; gating it would
  remove the reason to install the app.
- Billing is server-managed in phase 1 (no store SDK, OTA-shippable). Phase 2
  store billing uses **RevenueCat + Google Play** (Android first; iOS later):
  Google Play handles UPI/UPI AutoPay in India and local payment methods
  globally, while RevenueCat supplies entitlement sync, webhooks and the
  revenue analytics dashboard. The backend stays the entitlement source of
  truth; webhooks update `plan_tier`/`pro_until`. The existing 14-day app trial
  remains, and store plans are paid immediately (no second store trial). The
  RevenueCat SDK is native, so wiring it requires a fresh build — not OTA.
  Contracts: `api.md` (`/api/billing/*`, `402 UPGRADE_REQUIRED`), `database.md`
  (`ai_usage`, `billing_events`), `security.md` (quota as a cost control and
  webhook auth).
