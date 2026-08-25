# Frontend Conventions (Next.js App Router)

## Stack

- Next.js (App Router) + TypeScript, strict mode on
- React Server Components by default; Client Components only where
  interactivity is needed (forms, optimistic updates, hooks)
- `@clerk/nextjs` for auth
- Tailwind CSS for styling, driven by the tokens in `docs/design-system.md`
- No global state library for MVP — route/page-local state + a thin
  data-fetching hook per resource is sufficient at this scope. Do not
  introduce Redux/Zustand/MobX unless a specific cross-screen state need
  arises in Phase 2+.

## Folder structure

See `docs/architecture.md` for the full tree. Key rule: **pages
(`app/(app)/* /page.tsx`) contain layout and composition only** — all data
mutations go through `src/api/client.ts`, all presentational pieces live in
`src/components/`, all data-fetching hooks live in `src/hooks/`.

Two valid data-access patterns, both acceptable:
1. **Client Components** call the `/api/*` Route Handlers via the typed
   client in `src/api/client.ts` (mirrors the original mobile client
   exactly; keeps a clean API boundary). This is the default for
   interactive screens (Today, Lift, Plan).
2. **Server Components** (Trends/Verdict read views) may call `lib/services/*`
   directly for the initial render, then hydrate with client interactivity.
   Keep all writes in Route Handlers regardless.

## API client pattern

One typed function per endpoint in `src/api/`, e.g.:

```ts
// src/api/dailyLogs.ts
export async function getDailyLog(date: string): Promise<DailyLog> { ... }
export async function upsertDailyLog(date: string, patch: Partial<DailyLog>): Promise<DailyLog> { ... }
```

Every function throws a typed `ApiError` on non-2xx responses, caught by the
calling hook. No manual token handling — Clerk's session cookie is sent
automatically on same-origin requests.

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

- Use the tokens in `docs/design-system.md` via Tailwind classes mapped from
  `src/theme/tokens` — no inline hex values, no ad-hoc colors.
- Compose with Tailwind utilities; extract small presentational components
  to `src/components/` when a screen grows past ~200 lines.

## Screens (5, matching `docs/user-flows.md`)

`today/page.tsx`, `lift/page.tsx`, `trends/page.tsx`, `verdict/page.tsx`,
`plan/page.tsx` — one route per tab under `app/(app)/`. Keep each under
~200 lines; extract sub-components to `src/components/` once a screen grows
past that.
