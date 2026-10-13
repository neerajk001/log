# Design System

This is the exact token set validated in the approved interactive
prototype (`app-ui-interactive.html`). Implement these as theme constants
in `src/theme/` — do not introduce new colors or fonts without updating
this doc first.

## Design direction

Dark-first, data-dense, calm and honest. The brand is a single flat mint
accent on near-black (no gradients, no cheerful mascot energy). Feel: an
iron/chalk training journal — disciplined, quantitative, honest. Numbers are
always monospaced; this is a data app, and the typography should say so.

## Color tokens

The brand surface is mint-on-black, established on the onboarding screens
(`src/theme/brand.ts`) and now used app-wide. The `dark` scheme is the brand
surface; the tokens below are its canonical keys.

| Token          | Hex       | Usage                                    |
|----------------|-----------|--------------------------------------------|
| `ink`          | `#0A0B0B` | App background                            |
| `surface`      | `#15191B` | Cards, tiles                              |
| `surfaceAlt`   | `#1E2325` | Elevated cards / fields                   |
| `text`         | `#F2F3F0` | Primary text (warm off-white, not pure white) |
| `textDim`      | `#A9B0AE` | Secondary/label text                      |
| `textMuted`    | `#7C8482` | Muted text, inactive tabs                 |
| `mint`         | `#BEE3B6` | Primary accent — buttons, active states, progress, positive trends |
| `onMint`       | `#0C150C` | Text/icons on a mint fill                 |
| `border`       | `#242B2D` | Borders, dividers                         |
| `cardBorder`   | `rgba(190,227,182,0.16)` | Minimal card outline — a low-opacity tint of the action color |

Do not introduce a second accent color. `mint` is the only "action" color
in the app; it also carries positive-trend data. Accent hues
(blue/purple/amber/teal/pink) are reserved for metric badges and muscle/type
tags — never for buttons or navigation.

## Themes (light / dark / true black)

The app ships three schemes behind one token key set (`Palette` in
`src/theme/colors.ts`). Components never branch on theme — they read tokens
via `useTheme()`.

- `light` — the daylight palette (`bg #F4F6F2`, `primary #2F855A`).
- `dark` — the brand surface: near-black `ink` backgrounds, mint action
  color, warm off-white text (`bg #0A0B0B`, `surface #15191B`,
  `text #F2F3F0`, `textDim #A9B0AE`, `textMuted #7C8482`, borders
  `#242B2D`). The action color is `mint #BEE3B6` with `onMint #0C150C`
  text; soft/tinted surfaces are translucent mint.
- `trueBlack` — pure-black backgrounds (`bg #000000`, `surface #0B0B0C`)
  with neutral-white text and the same mint accent, for maximum contrast.

Semantic and accent hues are brightened on the dark schemes so they stay
readable on dark surfaces (e.g. `success #2F9E68` → `#BEE3B6`), and every
`*Soft` background becomes a translucent tint of its hue instead of a
pastel. Tag text colors live in per-scheme tables in `src/utils/tags.ts`.

The user picks System (default, follows the OS) / Light / Dark /
True Black in Settings → Appearance; the choice persists in AsyncStorage
(`log.theme-preference`). See `frontend.md` for the implementation pattern.

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
- Card border: 1px solid `cardBorder` (a faint tint of the action color) on
  `surface` — no drop shadows except the phone frame itself and the FAB.
- Section title spacing: 20px top margin, 10px bottom margin.

## Signature component: the verdict stamp

The weekly verdict renders as a rotated (-6deg), 3px-bordered mint box with
heavy Oswald uppercase text in `onMint`, evoking a referee's ink stamp — this
is the one deliberately expressive element in an otherwise restrained UI.
Do not reuse this treatment for anything except the weekly verdict.

## Component conventions

- **Tiles** (calorie/protein/sleep on Today): equal-width 3-column grid,
  label above value above target subtext.
- **Exercise cards**: name + target on the left, action button on the
  right; a "done" state changes border/background to a subtle mint tint
  — never removes the card or collapses it.
- **FAB**: bottom-right, mint background, `onMint` text, monospace label,
  reserved exclusively for "Log Lift" — do not add a second FAB.
- **Tab bar**: 5 items max, dot indicator above label, `mint` for
  active state, `textMuted` for inactive. No icons — text labels only, per the
  approved prototype.

## Reference implementation

The full working reference for exact spacing, sizing, and interaction
states is the delivered HTML prototype. When in doubt about a pixel value
not specified here, match the prototype rather than guessing a new one.
