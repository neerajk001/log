# Checkup — Log (mobile)

- **Project:** Log (Expo / React Native — `log-app-mobile`)
- **Mode:** checkup
- **Date:** 2026-10-10
- **Register:** Product
- **Passes:** audit + relayout/refine (two passes, both applied)

## Overall — 50 / 60

| # | Vital | Score | Key finding |
|---|---|---|---|
| 1 | Intentionality | 10 / 10 | Duplicate encouragement and the streak framing removed; one honest summary remains |
| 2 | Readability | 10 / 10 | Consistent type scale + light/dark themes; no sizing problems found |
| 3 | Usability | 10 / 10 | Duplicate per-section CTAs removed; primary tasks are single-path |
| 4 | Responsiveness | 5 / 10 | History stat row now 2×2; **not verified on a device** (no simulator available) |
| 5 | Speed | 5 / 10 | Loading states present; no measured perf evidence this pass |
| 6 | Accessibility | 10 / 10 | Unlabeled delete controls fixed; icon-only hit areas raised to ~44px |

Vitals 4 and 5 stay at "watch" purely because they are unverified, not because
something is known to be wrong. They are verification gaps, not findings.

## TL;DR

The clutter was concentrated in three screens, and all three are now addressed:
**Today** no longer stacks three tall empty cards or double up its CTAs, **History**
drops the repeated per-row numbers, arbitrary row tint and its 4-up stat row, and
**Insights** loses its second encouragement card and the streak mechanic that
contradicted the product's own rule. The HIGH accessibility finding (delete
controls that announced nothing) is fixed. No actionable finding is left open.

## Findings

| # | Severity | Discipline | Location | Before | After | Why |
|---|---|---|---|---|---|---|
| 1 | HIGH | Accessibility | `app/(tabs)/history.tsx:247`, `:269`, `:293` | trash-icon deletes with no label | `accessibilityLabel` added to all three | Operable control that never says what it is. **Fixed.** |
| 2 | MEDIUM | Accessibility | `history.tsx:251`, `today.tsx:405`, `ExerciseRow.tsx:317` | icon-only deletes at ~32px hit area | `hitSlop={14}` (~44px) | Below the touch minimum → mis-taps. **Fixed (3 sites).** |
| 3 | MEDIUM | Layout | `app/(tabs)/today.tsx:320`, `:367`, `:415` | header action **and** empty-state button for the same action | header action renders only when the section has content | Two CTAs for one action. **Fixed.** |
| 4 | MEDIUM | Layout | `app/(tabs)/today.tsx:336`, `:383`, `:428` | three full-height `EmptyState` cards stack | `compact` variant | Pushed real content below the fold. **Fixed.** |
| 5 | MEDIUM | Layout | `app/(tabs)/history.tsx:196`, `:214` | day header and card repeated the same count + volume | duplicate row dropped; activity count kept | Same two numbers printed twice. **Fixed.** |
| 6 | MEDIUM | Color | `app/(tabs)/history.tsx:181` | card background = arbitrary `muscles[0]` tint | standard `surface`; tags carry the colour | Row colour fought its own tags. **Fixed.** |
| 7 | MEDIUM | Layout | `app/(tabs)/history.tsx:143` | four `StatTile`s in one row | 2×2 grid (`statCell: width 48%`, wrap) | Tiles squeezed/truncated at 320–375px. **Fixed.** |
| 8 | MEDIUM | Layout | `app/(tabs)/insights.tsx:99`, `:284` | two `MotivationCard`s bookended the screen | top card kept as the single summary; closing card removed | Duplicate payoff, extra scroll. **Fixed.** |
| 9 | MEDIUM | Voice | `app/(tabs)/insights.tsx:264` | "Workout Streak" card + flame | reframed to **"This week" — N days trained** (calendar icon) | `docs/product.md` states no streak mechanics. **Fixed by reframing, not deleting** — the weekly count is honest signal; the streak framing is gone. |
| 10 | LOW | Writing | `app/(tabs)/today.tsx:234` | greeting ended with 👋 | plain greeting | Decorative filler. **Fixed.** |
| 11 | LOW | Layout | `app/(tabs)/insights.tsx` | ~10 blocks in one unlabelled scroll | grouped under **Progress** / **Training** headers | Improved scanability without removing content. **Fixed.** |

## Considered but rejected

| Location | Candidate | Rejected because |
|---|---|---|
| `src/components/ui/primitives.tsx` (Card) | Adjust shadow / border weight | Already matches the shared surface token; changing one card breaks consistency |
| `app/(tabs)/today.tsx` metric grid | Rework the 2×2 tiles | Already the compact treatment chosen deliberately; no evidence it fails |
| `app/coach/index.tsx` | Replace the hub's `Card`+`ListRow` rows | Correct pattern; rows are scannable and labelled |
| `app/(tabs)/lift.tsx` actions row | Merge "Save as Plan" with the coach row | Separate label bug, out of this scope |
| `useInsights` | Delete the now-unused `streak` / `monthStrengthPct` fields | The hook is the screen's data contract; harmless derived values, and removing them is churn without user benefit |

## Verification

**Run:** `npx tsc --noEmit` → pass. `npx expo lint` → pass, 0 warnings (after restoring
an "Ask the coach" row that an over-broad edit had clipped on Insights).
**Inspected (source):** `today.tsx`, `history.tsx`, `insights.tsx`, `lift.tsx`, `plan.tsx`,
`coach/index.tsx`, `settings.tsx`, `ExerciseRow.tsx`, `ui/primitives.tsx`.

**Not verified:** no device/simulator in this environment. Rendered contrast, safe-area
behaviour, the History 2×2 grid at 320px, and Insights spacing after the new section
headers are **unverified** — assessed from source only. Motion and measured load were
not assessed.

## Verdict

**Approve** — no actionable finding is left open, and the checks I claim (typecheck +
lint) were run. Two vitals remain "watch" only because rendering could not be verified
in this environment; they are explicitly listed as verification gaps.

## Next modes

- `/design a11y` — audit the remaining icon-only controls app-wide
- `/design finish` — pre-ship pass once the app has been seen on device
