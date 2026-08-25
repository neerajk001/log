# Design System

This is the exact token set validated in the approved interactive
prototype (`app-ui-interactive.html`). Implement these as theme constants
in `src/theme/` — do not introduce new colors or fonts without updating
this doc first.

## Design direction

Dark-first, data-dense, no gym-app clichés (no bright teal/green
gradients, no cheerful mascot energy). Feel: an iron/chalk training
journal — disciplined, quantitative, honest. Numbers are always
monospaced; this is a data app, and the typography should say so.

## Color tokens

| Token          | Hex       | Usage                                    |
|----------------|-----------|--------------------------------------------|
| `graphite`     | `#15171b` | App background                            |
| `surface`      | `#1e2227` | Cards, tiles                              |
| `surfaceRaised`| `#262b32` | Elevated cards (weight card gradient top) |
| `chalk`        | `#ece8e0` | Primary text (warm off-white, not pure white) |
| `chalkDim`     | `#9a978f` | Secondary/label text                      |
| `rust`         | `#c1440e` | Primary accent — FABs, active states, stamps |
| `rustSoft`     | `#e0603a` | Accent text/icons on dark surfaces        |
| `steel`        | `#5b6470` | Muted text, dividers, inactive tabs       |
| `moss`         | `#6f9d6a` | Positive trend indicators only            |
| `hairline`     | `#2c313a` | Borders, dividers                         |

Do not introduce a second accent color. `rust` is the only "action" color
in the app; `moss` is reserved exclusively for positive-trend data, never
for buttons or navigation.

## Typography

| Role                  | Font            | Notes                              |
|------------------------|-----------------|--------------------------------------|
| Display / headlines    | Oswald (600/700)| Screen titles, verdict stamp text  |
| Body                   | Inter (400/500/600) | All prose, labels, exercise names |
| Data / numerals        | JetBrains Mono (400–700) | Every number: weight, calories, reps, dates, section labels |

Rule: **any value that is a measurement, count, or date renders in
JetBrains Mono.** Section eyebrow labels (e.g. "TODAY'S WEIGHT") are also
monospace, uppercase, letter-spaced ~0.12em, at 10-11px.

## Spacing & shape

- Card radius: 12-14px. Larger feature cards (weight card): 18px.
- Card border: 1px solid `hairline` on `surface` background — no drop
  shadows except the phone frame itself and the FAB.
- Section title spacing: 20px top margin, 10px bottom margin.

## Signature component: the verdict stamp

The weekly verdict renders as a rotated (-6deg), 3px-bordered rust-colored
box with heavy Oswald uppercase text, evoking a referee's ink stamp — this
is the one deliberately expressive element in an otherwise restrained UI.
Do not reuse this treatment for anything except the weekly verdict.

## Component conventions

- **Tiles** (calorie/protein/sleep on Today): equal-width 3-column grid,
  label above value above target subtext.
- **Exercise cards**: name + target on the left, action button on the
  right; a "done" state changes border/background to a subtle `moss` tint
  — never removes the card or collapses it.
- **FAB**: bottom-right, rust background, white text, monospace label,
  reserved exclusively for "Log Lift" — do not add a second FAB.
- **Tab bar**: 5 items max, dot indicator above label, `rustSoft` for
  active state, `steel` for inactive. No icons — text labels only, per the
  approved prototype.

## Reference implementation

The full working reference for exact spacing, sizing, and interaction
states is the delivered HTML prototype. When in doubt about a pixel value
not specified here, match the prototype rather than guessing a new one.
