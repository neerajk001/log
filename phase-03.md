# Phase 3 — Trends & Weekly Verdict

Goal: the app produces its actual product output — an accurate, honest
weekly verdict — backed by real trend computation.

Prerequisite: Phase 1 and 2 acceptance criteria all passing.

Status: **code complete**. Backend (`services/verdictEngine.ts`, `/api/trends`,
`/api/verdict/weekly`), mobile (Trends + Verdict screens, Today verdict card
wired), and 19 `verdictEngine` unit tests are in place; only manual on-device
QA against R5/R6 remains.

## Backend tasks

- [x] Schema: `weekly_verdicts` (already present in the Prisma schema and
      initial migration from Phase 1 — no new migration required, in line
      with `phase-02.md` for `workout_plans`/`plan_days`)
- [x] Implement `services/verdictEngine.ts` as a pure function per the
      rule set in `docs/backend.md`
- [x] Unit tests covering all 4 rule branches + boundary values (per
      `docs/testing.md`) — `tests/verdictEngine.test.ts`, Vitest
- [x] Implement `GET /api/trends?range=4w` (weight 4-week rolling-average
      series, per-exercise week-over-week top-set deltas, adherence %)
- [x] Implement `GET /api/verdict/weekly` (fetches trailing 7 days,
      computes via `verdictEngine.ts`, upserts into `weekly_verdicts` on
      `(user_id, week_start_date)`, returns result)

## Mobile tasks

- [x] Build **Trends screen**: weight sparkline (in-house SVG), lift
      progress table (this week vs last, delta badge), adherence bar — per
      `docs/user-flows.md` Flow 6
- [x] Build **Verdict screen**: rotated rust `VerdictStamp` (signature
      component per `docs/design-system.md`), three signal rows, "Why"
      reasoning bullets — per Flow 7
- [x] Wire the Today screen's verdict summary card to `/api/verdict/weekly`
      and link into the full Verdict screen

## Acceptance criteria (Phase 3 = MVP complete)

- R5.1–R5.3 (trends) — see `docs/requirements.md`
- R6.1–R6.4 (weekly verdict)
- Full MVP success criteria from `docs/product.md`: a user can sign up,
  log a full week of data, optionally import a plan, and receive an
  accurate weekly verdict — with no manual developer intervention
