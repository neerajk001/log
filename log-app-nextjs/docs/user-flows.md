# User Flows

The seven flows are identical in behavior to the original spec; the
"screen" is now a Next.js route and taps become clicks. FAB/navigation
adapt to web. The "phone frame" column (see `design-system.md`) preserves
the native feel on desktop.

## Flow 1 — Onboarding / first login

```
App Open → Clerk sign-in page → Sign up (email) → Verify (Clerk-handled)
  → First authenticated request → Route Handler upserts `users` row
  → Lands on /today (empty state: no logs yet)
```

Empty state on Today: weight/calorie/protein/sleep fields show placeholder
text "—" (no previous day to pre-fill from), verdict card shows "Not enough
data yet — log at least 7 days" instead of a verdict.

## Flow 2 — Daily logging (core loop)

```
Today screen → click a field (weight/calories/protein/sleep)
  → enter value → auto-save on blur (optimistic UI update)
  → PUT /api/logs/daily/:date (upsert)
  → on success: value persists as committed
  → on failure: value stays visible, small inline "retry" indicator shown
```

No explicit "save" button — each field commits independently on blur, per
R2.4.

## Flow 3 — Lift logging, plan exists

```
Today screen → click "+ Log Lift" FAB → /lift
  → GET /api/plans/:id/today resolves today's plan day
  → shows exercise cards (not yet logged) for that day
  → click a card → quick entry (weight × reps) → save
  → POST /api/logs/lift → card marks "done" with logged value inline
  → repeat for remaining exercises
  → "Not on your plan? Log manually" link always visible below the list
```

## Flow 4 — Lift logging, no plan

```
Today screen → click "+ Log Lift" FAB → /lift
  → no plan day found → shows manual entry directly
    (exercise name search/type + weight × reps)
  → POST /api/logs/lift
```

## Flow 5 — Plan import (optional)

```
/plan tab → "Import workout plan"
  → paste text OR upload PDF
  → POST /api/plans/parse (text sent to OpenAI server-side)
  → preview screen: parsed days + exercises, each editable (pencil icon)
  → user edits any incorrect fields inline
  → click "Confirm & Save Plan"
  → POST /api/plans (persists plan, days, exercises; sets as active plan)
  → navigates to /lift — today's exercises now populated from plan
```

Error path: if parse fails (malformed text, API timeout), show "Couldn't
parse that — try pasting plain text, or add exercises manually" with a
manual plan entry fallback. This must never block Flow 3/4.

## Flow 6 — Viewing trends

```
/trends tab → GET /api/trends?range=4w
  → weight sparkline (7-day avg points)
  → lift table (this week vs last week per exercise, with delta)
  → adherence bar (days protein target hit / 7)
```

## Flow 7 — Viewing the weekly verdict

```
Today verdict card (or /verdict tab) → click
  → GET /api/verdict/weekly (computed on-demand from trailing 7 days)
  → stamp card shows verdict text
  → three signal rows: weight trend, strength trend, adherence
  → "Why" box: 2-4 rule-generated reasoning bullets
```

## Screen inventory (5 total)

1. **Today** (`/today`) — daily log entry + verdict summary card + FAB to lift log
2. **Lift** (`/lift`) — today's planned exercises (or manual entry) for logging sets
3. **Trends** (`/trends`) — weight sparkline, lift progress table, adherence
4. **Verdict** (`/verdict`) — full weekly verdict breakdown
5. **Plan** (`/plan`) — import/parse/preview/confirm workout plan

Navigation: bottom tab bar with all 5 screens, consistent with the approved
prototype. The FAB on Today always jumps to Lift.

## Reference fixture (R4 acceptance)

The reference 6-day plan produces these parsed days (used by R4 acceptance
and plan parser tests): Push, Pull, Legs, Upper, Lower, Full — each with
its named exercises and rep ranges. The `planParser` test asserts 6 correct
days with correct exercise names and rep ranges.
