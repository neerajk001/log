# User Flows

## Flow 1 — Onboarding / first login

```
App Open → Clerk auth screen → Sign up (email) → Verify (Clerk-handled)
  → First authenticated request → Backend upserts `users` row
  → Lands on Today screen (empty state: no logs yet)
```

Empty state on Today screen: weight/calorie/protein/sleep fields show
placeholder text "—" (no previous day to pre-fill from), verdict card
shows "Not enough data yet — log at least 7 days" instead of a verdict.

## Flow 2 — Daily logging (core loop)

```
Today screen → tap a field (weight/calories/protein/sleep)
  → enter value → auto-save on blur (optimistic UI update)
  → PUT /api/logs/daily/:date (upsert)
  → on success: value persists as committed
  → on failure: value stays visible, small inline "retry" indicator shown
```

No explicit "save" button — each field commits independently on blur, per
R2.4.

## Flow 3 — Lift logging, plan exists

```
Today screen → tap "+ Log Lift" FAB → Lift screen
  → GET /api/plans/:id/today resolves today's plan day
  → shows exercise cards (not yet logged) for that day
  → tap a card → quick entry (weight × reps) → save
  → POST /api/logs/lift → card marks "done" with logged value inline
  → repeat for remaining exercises
  → "Not on your plan? Log manually" link always visible below the list
```

## Flow 4 — Lift logging, no plan

```
Today screen → tap "+ Log Lift" FAB → Lift screen
  → no plan day found → shows manual entry directly
    (exercise name search/type + weight × reps)
  → POST /api/logs/lift
```

## Flow 5 — Plan import (optional)

```
Settings/Plan tab → "Import workout plan"
  → paste text OR upload PDF
  → POST /api/plans/parse (text sent to Google Gemini Flash server-side)
  → preview screen: parsed days + exercises, each editable (pencil icon)
  → user edits any incorrect fields inline
  → tap "Confirm & Save Plan"
  → POST /api/plans (persists plan, days, exercises; sets as active plan)
  → navigates to Lift screen — today's exercises now populated from plan
```

Error path: if parse fails (malformed text, API timeout), show
"Couldn't parse that — try pasting plain text, or add exercises manually"
with a manual plan entry fallback. This must never block Flow 3/4.

## Flow 6 — Viewing trends

```
Trends tab → GET /api/trends?range=4w
  → weight sparkline (7-day avg points)
  → lift table (this week vs last week per exercise, with delta)
  → adherence bar (days protein target hit / 7)
```

## Flow 7 — Viewing the weekly verdict

```
Today screen verdict card (or Verdict tab) → tap
  → GET /api/verdict/weekly (computed on-demand from trailing 7 days)
  → stamp card shows verdict text
  → three signal rows: weight trend, strength trend, adherence
  → "Why" box: 2-4 rule-generated reasoning bullets
```

## Screen inventory (5 total — matches the approved UI prototype)

1. **Today** — daily log entry + verdict summary card + FAB to lift log
2. **Lift** — today's planned exercises (or manual entry) for logging sets
3. **Trends** — weight sparkline, lift progress table, adherence
4. **Verdict** — full weekly verdict breakdown
5. **Plan** — import/parse/preview/confirm workout plan

Navigation: bottom tab bar with all 5 screens, consistent with the approved
prototype (`app-ui-interactive.html`). The FAB on Today always jumps to
Lift.
