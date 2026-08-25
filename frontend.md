# Frontend Conventions (Expo / React Native)

## Stack

- Expo (managed workflow) + Expo Router for navigation
- TypeScript, strict mode on
- `@clerk/clerk-expo` for auth
- No global state library for MVP — screen-local state + a thin data-fetch
  hook per resource is sufficient at this scope. Do not introduce Redux/
  Zustand/MobX unless a specific cross-screen state need arises in Phase 2+.

## Folder structure

See `docs/architecture.md` for the full tree. Key rule: **screens
(`app/(tabs)/*.tsx`) contain layout and composition only** — all data
fetching lives in `src/hooks/`, all API calls live in `src/api/`, all
presentational pieces live in `src/components/`.

## API client pattern

One typed function per endpoint in `src/api/`, e.g.:

```ts
// src/api/dailyLogs.ts
export async function getDailyLog(date: string): Promise<DailyLog> { ... }
export async function upsertDailyLog(date: string, patch: Partial<DailyLog>): Promise<DailyLog> { ... }
```

Every function attaches the Clerk token (see `docs/auth.md`) and throws a
typed `ApiError` on non-2xx responses, caught by the calling hook.

## Data-fetching hook pattern

One hook per screen's primary data need, e.g. `useTodayLog()`,
`useLiftPlanToday()`, `useTrends()`, `useWeeklyVerdict()`. Each hook:

- Fetches on mount
- Exposes `{ data, loading, error, refetch }`
- Implements optimistic updates for mutations (per R2.4): update local
  state immediately, call the API, roll back on failure with a visible
  retry affordance — never fail silently.

## Error handling in UI

- Network/API failures never crash a screen — show an inline error state
  local to the affected component (a field, a card, a section), not a
  full-screen error unless the entire screen's primary data failed to
  load.
- Plan parse failures follow R4.5 and R8: always leave a path back to
  manual entry.

## Styling

- Use the tokens in `docs/design-system.md` via `src/theme/` constants —
  no inline hex values, no ad-hoc colors.
- StyleSheet.create per component; no CSS-in-JS library needed for this
  scope.

## Screens (5, matching `docs/user-flows.md`)

`today.tsx`, `lift.tsx`, `trends.tsx`, `verdict.tsx`, `plan.tsx` — one file
per tab under `app/(tabs)/`. Keep each under ~200 lines; extract
sub-components to `src/components/` once a screen grows past that.
