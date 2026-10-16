# Performance Audit — Log App

**Date:** 2026-10-15 · **Mode:** audit only — no code changed.
**Method:** static trace of all three flows across the full stack (mobile → API →
backend → Neon / AI providers → UI), live probes where cheap (Express behavior,
test suite), config and schema inspection. Anything not measured is labelled
**estimate** with a concrete recipe to measure it.

---

## 1. Executive summary — the biggest bottlenecks

| Rank | Bottleneck | Flow | Severity | Basis |
|------|-----------|------|----------|-------|
| 1 | **AI turn does up to 5 sequential model round-trips before/without early tokens** — TTFT includes session resolve + 12-query context build + history fetch + 2 writes + first model call | AI response | **High** | Measured (code): `runCoachChatStream`, `MAX_TOOL_ROUNDS=4` default, `historyTurns=8`, `toolTokens=1600` |
| 2 | **AI context rebuilt from scratch every turn, incl. an unbounded lifetime-PR aggregation** — one `groupBy` scans the user's entire lift history with no date bound, plus 365d of weights, on every message | AI response | **High** | Measured (code): `buildAthleteContext` 12 parallel queries |
| 3 | **Neon cold resume + untuned `pg` pool** — pooler URL, but pool has defaults (`max: 10`, no connection/statement timeouts, no keepalive); first query after Neon idle can stall for seconds, and every API call pays a per-request auth DB lookup on top | App open, login, all API | **High** | Measured (code/config); latency magnitude is estimate |
| 4 | **Login/first-load waterfall is fully sequential** — Clerk load → `GET /me` (blocks all routing) → tab mount → ~8 parallel GETs, each repeating token + auth DB lookup; Today spinner is pinned to the slowest (`refreshing = OR(all loadings)`) | App open, login | **Medium** | Measured (code) |
| 5 | **Startup pays for everything up front** — Clerk + PostHog (session replay ON) + EAS OTA update check + theme AsyncStorage before first paint; no bundle measurement exists, no lazy routes confirmed | App open | **Medium** | Measured (config); bundle impact is estimate |
| 6 | **No production performance telemetry** — Sentry `tracesSampleRate: 0`, no API timing logs, no p50/p95 anywhere; every number below about latency is an estimate | All | **Medium (enabler)** | Measured (config) |

What is **not** a problem (verified so good intentions don't waste effort):
Indexes are complete (`lift_logs[userId,date]`, `meal_logs[userId,date]`,
`coach_messages[sessionId,createdAt]`, etc. — no missing-index finding).
Dashboard reads are parallel `Promise.all`, not N+1. `makeUseStyles` is memoized.
Photos are shrunk to 1280px/q0.7 before upload. `compression()` is on.
`take`/range caps bound list endpoints.

---

## 2. Findings with evidence and root causes

### F1. AI time-to-first-token waits behind up to 5 sequential model calls
- **Files:** `log-app-backend/src/services/coach.ts:2081-2230` (`runCoachChatStream`),
  `src/config/index.ts:59-66` (budgets).
- **Evidence (measured):** every turn runs: session resolve → `buildAthleteContext` +
  history (`Promise.all`, good) → persist user message + touch session (2 sequential
  writes) → tool loop `for round <= MAX_TOOL_ROUNDS` (default 4 → up to **5 sequential
  `streamRound` fetches**) → persist answer → background memory update. Streaming
  forwards deltas as they arrive (good), but TTFT still waits for all pre-work plus
  the first round-trip of a reasoning-heavy model (`chatSmart = gpt-4.1` for any
  message >120 chars or matching deep-topic regex — i.e. most real questions).
  Token budgets per call: 1600 (tool rounds) / 400 (final reply); history replays up
  to 8 turns per round when response-chaining is off.
- **Root cause:** correctness-first turn pipeline (session → full context → tools →
  reply) with no fast path; model choice defaults to the slow tier for substantive
  questions.
- **Impact:** TTFT likely seconds-to-tens-of-seconds on hard questions (estimate —
  no prod logs exist; the code already emits per-round `ttftMs`, `stages`,
  `[coach] client turn {headersMs, firstDeltaMs, totalMs}` — the data is one log
  query away).

### F2. Full athlete context rebuilt per turn, with an unbounded aggregation
- **Files:** `coach.ts:166-224` (`buildAthleteContext`).
- **Evidence (measured):** 12 queries per turn, including `liftLog.groupBy by
  exerciseName` with **no date bound** (full-table aggregation over the user's
  lifetime sets — grows forever), `dailyLog` 365d of weights, 28d of *all* sets
  with no `take`, and the full active plan JSON. Only the meal scope is trimmed
  (`buildMealContext`); every general/training turn pays the full dossier even for
  "what did I log today?" (which then *also* spends tool rounds re-fetching the day).
- **Root cause:** no caching, no scoping of context to the question; lifetime-PRs
  query never bounded when `getLiftSummary` (12 recent + top sets) already covers it.
- **Impact:** pre-token DB + prompt-build cost grows with account age; input-token
  spend on every round (worse with chaining off). Magnitude unmeasured — see §6.

### F3. Database: Neon cold resume risk + default pool + per-request auth lookup
- **Files:** `src/db/client.ts:49-52`, `src/middleware/auth.ts:69`,
  `deployment.md:76-82`, `docker-compose.yml` (single container).
- **Evidence (measured):** `new Pool({connectionString, ssl})` — all `pg` defaults:
  `max 10`, `connectionTimeoutMillis 0` (wait forever), no statement timeout, no
  keepalive query. Neon suspends idle compute; first query after suspend pays
  TLS + resume (seconds — estimate, provider-dependent). Every authenticated call
  adds `findUnique(user)` (~ms warm, seconds cold — the auth audit kept it
  uncached deliberately). Single VPS → 10 pool connections is plenty, but one hung
  provider/DB stall can exhaust it with no timeout to shed load.
- **Root cause:** pool never tuned for serverless Postgres; no warmup/keepalive;
  no timeouts as backpressure.
- **Impact:** worst first impressions (cold open, first post-login call) and tail
  latency on every flow; pool exhaustion = full outage under stall.

### F4. Login → first paint is a sequential gate chain
- **Files:** `app/_layout.tsx:23-92` (`AuthGate`), `src/hooks/useMe.ts`,
  `app/(tabs)/today.tsx:85-116,195`.
- **Evidence (measured):** `AuthGate` renders tabs only after `isLoaded` AND
  `GET /me` resolves (network + token + DB write on first login via
  `findOrCreateUserByClerkId`). Then Today fires ~8 GETs (`daily`, `me`, `lift`,
  `activity`, `meals`, `planToday`×2, `recent`, `comparison`) — parallel (good) but
  each carries token fetch + auth DB lookup, and `refreshing = loading || …`
  (line 195) pins the pull-spinner to the **slowest** of them. `useMe` in gate +
  Today dedupes via inflight-join (good — no duplicate `/me`).
- **Root cause:** routing depends on server state (`onboarded_at`); no optimistic
  route, no skeleton-first paint; spinner coupled to max(latencies).
- **Impact:** slow first load after login (estimate 1–4s warm, worse cold); every
  added Today widget makes the worst case worse.

### F5. Startup cost is front-loaded and unmeasured
- **Files:** `app/_layout.tsx:155-179`, `app.json`, `eas.json`, `metro.config.js`,
  `src/api/cache.ts`.
- **Evidence (measured):** cold start initializes Clerk, PostHog **with session
  replay + uncaught-exception capture**, and EAS OTA (`updates.url` set → update
  check on launch) before/with first paint; splash additionally waits on theme
  AsyncStorage (10s fallback). Source is ~540KB across ~105 files (measured:
  `app/` 251KB, `src/` 288KB) plus Expo/Clerk/PostHog/SVG/router native modules —
  but **no bundle export has ever been measured** (pnpm workspace; install sizes
  are not bundle sizes). Client GET cache (30s–5min TTLs) helps repeat views, not
  first paint. No ETag/304 usage (client never sends `If-None-Match`), no CDN.
- **Root cause:** everything in the critical path; heaviest SDK features (replay)
  on by default; no budget or measurement.
- **Impact:** app-open time unknown-but-composite; OTA check alone can add
  ~0.5–2s per cold start (estimate — measure with `expo-updates` logs).

### F6. No performance telemetry in production
- **Evidence (measured):** `sentry.ts` sets `tracesSampleRate: 0` (errors only);
  no API access/timing logs in prod (`[req]` logger is dev-only); no PostHog
  performance events from backend; AI stage/timing logs exist but go to stdout
  (VPS logs, unaggregated). There is **no p50/p95 for any endpoint, no TTFT
  series, no startup-time series**.
- **Impact:** every latency claim in this report (except code structure) is an
  estimate; optimizations can't be verified without this first.

---

## 3. Baseline measurements (measured vs estimate)

| Metric | Value | Basis |
|--------|-------|-------|
| Mobile source size | ~540KB (`app/` 251KB / 30 files, `src/` 288KB / 75 files) | Measured (`Measure-Object`) |
| Backend suite | 193 tests, ~2.4s | Measured (`vitest run`) |
| Backend/frontend typecheck | clean | Measured (`tsc --noEmit`) |
| AI budgets | ≤5 sequential model calls/turn; history 8; 1600/400 tokens; timeouts 60/90s | Measured (code+config) |
| AI context queries | 12 parallel/turn + per-tool DB calls | Measured (code) |
| Today initial GETs | ~8 parallel (+2 on Lift/Insights) | Measured (code) |
| DB pool | max 10, no timeouts/keepalive | Measured (config) |
| App startup / login / API p50-p95 / AI TTFT / bundle bytes / query latency | **Unknown** | No telemetry — see §6 |

---

## 4. Recommendations ranked by impact vs effort

### Quick wins (hours, low risk)

1. **Add a `statement_timeout` + `connectionTimeoutMillis` + pool sizing to `pg` Pool**
   (`log-app-backend/src/db/client.ts:49-52`). Fail fast instead of hanging;
   prevents pool-exhaustion outages. *Measure: 5xx/timeout rate, p95 API latency.*
2. **Bound the lifetime-PR aggregation in coach context** (e.g. reuse the
   `getLiftSummary` 12-recent shape or add a 1y bound in
   `services/coach.ts:212-216`). Stops per-turn cost growing with account age.
   *Measure: context-stage ms from existing `stages` logs; input tokens/turn.*
3. **Unblock Today spinner from the slowest widget** (`today.tsx:195`:
   `refreshing` per-section or drop pull-spinner coupling; render cached sections
   first). Pure perceived-latency win. *Measure: time-to-first-content via manual
   timing / PostHog event.*
4. **Turn on minimal backend access logging in prod** (method/path/status/ms —
   the dev `[req]` logger exists; gate by env or sample it). Without this, nothing
   below is verifiable. *Measure: produces the p50/p95 baseline itself.*
5. **Verify Nginx `proxy_buffering off` + generous `proxy_read_timeout` on VPS**
   (`deployment.md:28-31` requires it for SSE). If missing, streaming is silently
   buffered = catastrophic perceived AI latency. *Measure: TTFT before/after via
   client `[coach] client turn.firstDeltaMs`.*

### Medium effort (days)

6. **Answer simple coach questions without the full dossier** — route "today"-style
   questions to `buildMealContext`-sized scope (targets + today + memory) instead of
   the 12-query full context; skip tool rounds when a direct answer suffices
   (`coach.ts:166-224, 2181-2214`). *Measure: TTFT + input tokens on FAQ-style turns.*
7. **Defer/parallelize post-login work** — render tabs optimistically from cached
   `/me` (client cache already exists) while revalidating; prefetch `/me` right
   after `setActive` in `sign-in.tsx` instead of waiting for `AuthGate`.
   *Measure: login→interactive time.*
8. **Neon keepalive + pooler check** — scheduled `/ready` ping (cron or uptime
   monitor already implied by deploy gates) to prevent compute suspend; confirm
   `-pooler` host in prod `DATABASE_URL`. *Measure: cold-start query latency.*
9. **Audit PostHog session replay cost** — quantify its CPU/bandwidth/upload impact
   on low-end Android; consider sampling or disabling on release until measured
   (`_layout.tsx:163-172`, `metro.config.js`). *Measure: cold start with/without,
   outbound bytes.*
10. **Measure the bundle, then trim** — `npx expo export` + bundle analyzer;
    candidates: `react-native-svg`, doc/image pickers, PostHog plugin (only if data
    says so). Set a budget. *Measure: JS bytes, TTI on a mid-range Android.*

### Major changes (plan carefully)

11. **Short-TTL server cache for athlete context** (e.g. 60s `clerkUserId`-scoped
    dossier) — kills 12 queries/turn; invalidation risk is low (logs change slowly
    vs turn rate) but real. Alternative first: cache only the lifetime-PRs slice.
12. **Streaming fast-path for no-tool answers** — reply directly when the router is
    confident (skip session-create + persist round-trips off the critical path;
    persist async). Changes write ordering — needs care.
13. **Edge/CDN or regional VPS** if users are far from the single VPS + Neon region;
    measure client RTT distribution first (PostHog can capture it).

---

## 5. Expected improvement and how to measure it

| Change | Expected (estimate) | How to measure |
|--------|--------------------|----------------|
| Pool timeouts + keepalive | Kill multi-second cold-start tails; bounded worst case | Prod access logs: p95/p99 per endpoint, timeout count |
| Context scoping/bounding | −30–60% input tokens on simple turns; −100s of ms pre-token DB | `stages.context` ms + `usage.input_tokens` (already logged) |
| Spinner decoupling | First content in ~time of fastest call, not slowest | Manual stopwatch / new PostHog `today_first_paint` event |
| Nginx streaming check | TTFT seconds→sub-second if buffering is on | `firstDeltaMs` client log |
| Login prefetch | −1 RTT off critical path (~200–800ms) | `setActive`→tabs timestamp |
| Bundle trim | Unknown until measured | Export analyzer; TTI on Moto G-class device |

All latency expectations are **estimates** pending §6 instrumentation.

---

## 6. Risks, trade-offs, dependencies

- **Context trimming vs answer quality:** smaller dossiers can make the coach ask
  for data it used to know. Mitigate with the meal-scope precedent (already proven)
  and A/B on question classes, not a global cut.
- **Caching the dossier:** stale-target risk (user changes protein goal mid-chat).
  60s TTL + write-invalidation bounds it; start with the immutable slice (lifetime PRs).
- **Pool timeouts:** too-aggressive `statement_timeout` fails legit long queries
  (plan create/activate transactions). Set ≥10s and watch 5xx.
- **Login prefetch:** races with onboarding state; keep `AuthGate` as the authority,
  prefetch is hint-only.
- **Dependencies:** backend access logs need log retention on the VPS; PostHog
  client timing needs event quota; bundle work needs an EAS build slot.
- **How to collect missing metrics:** (a) enable sampled prod access logs →
  p50/p95 per endpoint; (b) query VPS stdout for existing `[coach] turn` /
  `roundTimings` / `[coach] client turn` lines → TTFT + stage breakdown;
  (c) `npx expo export --platform android` + analyzer → bundle bytes;
  (d) `EXPLAIN (ANALYZE, BUFFERS)` on the 12 context queries + verdict/trends
  queries against a realistic-size Neon branch; (e) cold-start: fresh install,
  airplane-off, stopwatch to interactive Today, 3 runs median.

---

## 7. Phased implementation plan

**Phase 0 — Instrument (½ day, unlocks everything else).**
Prod access logs (rec 4) + confirm Nginx streaming flags (rec 5) + pull existing
AI timing logs into one view. Output: the missing baseline table (§3).

**Phase 1 — Quick wins (1–2 days).**
Pool timeouts (1) → PR-bound (2) → spinner decoupling (3) → keepalive (8).
Re-measure after each; stop if the baseline says the bottleneck moved.

**Phase 2 — Structural (1–2 weeks).**
Context routing (6) → login prefetch (7) → replay/bundle audit (9, 10).
Each behind a flag or easily revertible; verify with Phase-0 telemetry.

**Phase 3 — Strategic (as needed).**
Server context cache (11) → streaming fast-path (12) → infra moves (13).
Only if Phase 1–2 data still shows the pain.

*Suggested order to optimize first: Phase 0 → rec 5 (streaming check, 5 min, could
be the whole AI complaint) → rec 1 (outage-class tail risk) → rec 2 (compounding
cost) → rec 3 (perceived latency) → Phase 2.*

---

## 8. Phase 0 — implemented 2026-10-15 (instrumentation only, no behavior change)

**Before:** request timing was dev-only (with user id + raw URL); zero DB timing;
ledger warn carried a user id; mobile emitted no timing events; 193 tests.

**After (verified):** backend `vitest` 12 files / 199 tests PASS (6 new),
backend + mobile `tsc` clean, `expo lint` clean, `APP_IMPORT_OK` smoke check.

| Signal | What was added | Privacy / overhead |
|--------|---------------|-------------------|
| API latency | `src/middleware/requestTiming.ts` wired in `app.ts` (replaces dev-only logger): `[req] METHOD redacted-path status ms` in **all** envs; `/health` skipped | No headers/bodies/query values/tokens/user ids; UUID segments → `:id` (bounded cardinality for p50/p95 aggregation); ~2 `Date.now()` + short string ops per request |
| DB latency | Pool-boundary timer in `src/db/client.ts`: logs `[db] slow query {ms} {text}` only above `DB_SLOW_MS` (default 200ms, new `.env.example` entry) | Query text normalized/truncated to 120 chars; bind params never touched; results pass through untouched; wrap-once guarded |
| AI TTFT/total | Already present and kept: `[coach] turn` summary (`preModelMs/modelMs/totalMs`, per-round `ttftMs`, tool timings, token counts, `contextChars`) — verified content-free (no prompts, messages, or user ids) | Zero new code; zero overhead change |
| App startup | `app_startup {cold_start_ms}` on first screen (module-eval mark → first pathname) | Durations only; no-op without PostHog key; never throws |
| Login | `login_completed {duration_ms, method}` on `setActive` success (Google + email) | No email/token/account data |
| AI turn (client) | `coach_turn {total_ms, first_delta_ms, agent, failed}` on non-aborted turns | No message content; user-stopped turns skipped |

Also: ledger warn dropped its user id (prod logs now carry no user identifiers).
Deliberately **not** added: per-request mobile API events (PostHog quota; backend
access logs cover it), in-memory p50 aggregation (stateless server; aggregate the
log lines instead), request-body logging (PII risk, no benefit).

**How to read the new data:** per-endpoint p50/p95 = aggregate `[req]` lines by
`METHOD + path` (paths pre-redacted); slow-query offenders = `[db]` lines;
TTFT series = server `[coach] turn` (`rounds[].ttftMs`, `preModelMs`) joined with
client `coach_turn.first_delta_ms`; startup/login trends = PostHog
`app_startup` / `login_completed` distributions. Revisit §3 baselines once a week
of production logs exists — that decides Phase 1–2 ordering with measured numbers
instead of estimates.

---

## 9. Phase 1 — AI streaming investigation (2026-10-15, no infra changed)

### Verdict up front
**The application does not buffer the stream.** Progressive token delivery was
proven through the real Express stack (new route-level test, below). If users
perceive AI slowness, the cause is either the pre-model pipeline + model latency
(§2 F1 — orchestration, explicitly out of scope this phase) or Nginx proxy
buffering on the VPS — which **could not be verified**: no Nginx config exists in
this repo (VPS was configured manually per `deployment.md`), and production was
correctly left untouched. A minimal endpoint-specific snippet is proposed below
for approval, plus the exact check to confirm whether it is even needed.

### Evidence — full path trace

| Hop | Finding | Evidence |
|-----|---------|----------|
| Provider → Express | `streamRound` forwards each `output_text.delta` via `onDelta` synchronously; nothing accumulates (`full` is append-only bookkeeping) | Code: `coach.ts:1998-2000, 2029-2052` |
| Express middleware | `compression()` bypasses `text/event-stream` via explicit filter; `helmet()` sets headers only | Code: `app.ts:27-35`; proven live by the test below |
| Route | Correct SSE framing: `Content-Type`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`, `flushHeaders()` before any model work, per-delta `res.write`, `{done:true}` + `res.end()`, `{error}` path after headers, abort on `req close` | Code: `routes/coach.ts:246-299` |
| Producer timing | **New test** `tests/coachStream.test.ts` boots the real app (mocked auth + mocked `runCoachChatStream` emitting 3 tokens 60ms apart) and asserts: SSE headers present, first token <150ms after headers, token spread ≥80ms (impossible under buffering), prompt abort ends the stream, service failure → `{error}` then end, invalid body → 400 before streaming | Measured: 4/4 pass; full suite 13 files / 203 tests PASS; `tsc` clean |
| Nginx | **Not inspectable from here** — no `*.conf`/nginx file in repo; VPS configured by hand | Repo-wide glob: zero hits |
| Mobile consumer | `expo/fetch` `ReadableStream` reader dispatches per `data:` line immediately (no batching, no client timeout — relies on server 90s/round + user Stop); deltas `setMessages` per token | Code: `src/api/coach.ts:112-176`, `useCoachChat.ts` |

### Incidental fix (found by the new test, kept minimal)
The Phase 0 request logger read `req.path` in the `finish` handler — but Express
strips `req.url` as routers delegate, so it logged mount-relative paths
(`POST /chat/stream` instead of `POST /api/coach/chat/stream`), which would have
corrupted per-endpoint aggregation. Now captured at middleware entry from
`req.originalUrl`. Covered implicitly by the new test's log output.

### Proposed Nginx change (NOT applied — awaiting approval + VPS access)
Endpoint-specific only, inside the existing `https://api.<domain>` server block:

```nginx
location = /api/coach/chat/stream {
    proxy_pass http://localhost:$PORT;
    proxy_buffering off;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 300s;
}
```

Confirm-first check (proves whether this is even the problem — run from anywhere):
`curl -N -X POST https://api.<domain>/api/coach/chat/stream -H "Authorization: Bearer <token>" …`
and watch whether `data:` lines arrive progressively or all at once; compare
`first_delta_ms` in the new client `coach_turn` events before/after. If tokens
already arrive progressively in production, Nginx is innocent — do not touch it.

### TTFT before/after
Unavailable — Phase 0 telemetry shipped minutes before this investigation, so no
production samples exist yet. The signals to compare (server `rounds[].ttftMs` +
`preModelMs` vs client `first_delta_ms`) are defined in §8; re-run this comparison
after one week of logs before spending on orchestration changes.

### Remaining uncertainties
1. Actual VPS Nginx config (buffering flags, `proxy_read_timeout`, HTTP version).
2. Provider-side latency split (model TTFT vs token pacing) — needs prod `roundTimings`.
3. Whether `expo/fetch` streaming behaves identically on the production Android
   build as in dev (no evidence of difference; Hermes `ReadableStream` is stable).
4. Mobile per-token `setMessages` re-render cost on low-end devices — plausibly
   janky on long replies, unmeasured (React Compiler is on; verify with profiling
   before optimizing).

---

## 10. VPS update — Nginx findings (reported 2026-10-15, NOT independently verified)

Status honesty first: I have no VPS access and no production credentials, so
everything in this section about the live server is **reported, not verified by
me**. No Nginx config exists in this repo (glob for `*.conf`/nginx: zero hits;
`git log` shows no infra commits), and I changed nothing — no code, no config,
no deploy this round.

### Reported findings (from the VPS investigation)
- Nginx reverse-proxies to `http://127.0.0.1:4000`; the HTTPS server block has a
  general `location /` with **no** `proxy_buffering off` and **no**
  `proxy_read_timeout` override (i.e. the 60s default applies).
- Express route test (Phase 1, `tests/coachStream.test.ts` 4/4) already proved
  tokens emit progressively app-side; mobile consumer batches nothing.
- A dedicated `location = /api/coach/chat/stream` snippet (`proxy_buffering off`,
  `proxy_http_version 1.1`, `proxy_read_timeout 300s`, upstream/headers preserved)
  was **prepared but its applied state is UNKNOWN** — not confirmed saved,
  `nginx -t` not confirmed passed, reload not confirmed.

### Technical read (from code + Nginx documented behavior — no probe possible here)
- `X-Accel-Buffering: no` is already sent by the route (`routes/coach.ts:260`).
  Per Nginx docs this disables buffering **for that response** even with
  `proxy_buffering on` upstream — so the missing location flag may already be
  neutralized for buffering. The snippet remains good hygiene, but it may change
  nothing observable.
- The sharper unconfirmed risk is **`proxy_read_timeout` (default 60s)**: tool-loop
  turns (up to 5 sequential model calls, Phase 0 timeouts 60/90s) can legitimately
  exceed 60s end-to-end and would surface as `504`, not slowness. The snippet's
  `300s` fixes exactly this.
- Second unconfirmed risk: **`gzip` with `gzip_proxied`** — if the VPS enables
  gzip for proxied responses, Nginx re-buffers SSE regardless of the app's
  compression bypass. Check `gzip_proxied` in the active config; SSE must be
  excluded (e.g. `gzip_proxied any` must NOT apply to `text/event-stream`).

### What changed / was tested / remains unverified
- **Changed by me this round:** nothing except this section of `PERFORMANCE_AUDIT.md`.
- **Tested (this repo):** app-side progressive delivery — already green in Phase 1.
- **Unverified:** whether the snippet is saved/applied/reloaded; Test A/B/C results
  from the curl playbook; whether production delivery is already progressive
  (which would make the whole buffering question moot).

### Required confirmations (owner/VPS side — no approval asked beyond what exists)
1. `nginx -t` output, and whether the daemon was reloaded after any edit.
2. Test C received headers (is `X-Accel-Buffering: no` present end-to-end?).
3. Test A timestamps + Test B `firstbyte`/`total` numbers for 3 runs, before and
   after if the snippet lands.

### Pivot: measure session/DB-context/model latency next (no orchestration or DB changes)
With app buffering cleared and Nginx pending only empirical confirmation, the next
bottleneck hunt uses only the Phase 0 signals — no code, no infra changes:

```bash
# Per-endpoint latency (paths pre-redacted) — p50/p95 per METHOD+path:
grep '\[req\]' api.log | awk '{print $2, $3, $4, $5}' \
  | awk '{k=$1" "$2; t[$k]+=$4; n[$k]++; if($4>m[$k])m[$k]=$4} END{for(k in n)print n[k], k, "max="m[k]"ms"}' | sort -rn | head -20
# Slow-query offenders (already thresholded at DB_SLOW_MS):
grep '\[db\] slow query' api.log | sort -t' ' -k4 -rn | head -20
# AI turn split — pre-model vs model vs tools, TTFT per round (one JSON per turn):
grep '\[coach\] turn' api.log | tail -5
# Client-side TTFT/total distribution (PostHog): coach_turn.first_delta_ms / total_ms
```

Decision rule: if `preModelMs` (session + 12-query context + writes) dominates,
the fix is context scoping/caching (audit §4 recs 2/6/11 — needs approval as
orchestration-adjacent). If round `ttftMs`/model time dominates, it is model
selection (explicitly deferred). If a single endpoint's p95 dominates, it is
query-level work. No AI orchestration or database configuration changes until
these numbers name the bottleneck.

---

## 11. Production probe 2026-10-15 — unauthenticated POST/PUT with body → 500 (NEW, URGENT)

Probed `https://api.neerajx.site` (domain from `eas.json`) with tokenless
`curl.exe` from Windows — no credentials used, no quota spent, nothing written.
Full headers captured: `nginx/1.24.0 (Ubuntu)`, HTTP/1.1 keep-alive, helmet
header set present, `/health` → 200 in ~100ms (proxy + app alive).

### Measured matrix (all unauthenticated; per code, every one should be 401)

| Request | Result | Time |
|---------|--------|------|
| `GET /api/me`, `GET /api/verdict/weekly` | 401 UNAUTHORIZED ✓ | ~150–180ms |
| `DELETE /api/meals/:uuid` | 401 ✓ | ~97ms |
| `PUT /api/me` `{}` (empty body) | 401 ✓ | ~107ms |
| `POST /api/meals` `{}` (empty body) | 401 ✓ | ~64ms |
| `POST /api/coach/chat/stream` + message body | **500 SERVER_ERROR** ✗ | ~551ms total (DNS 242ms + TLS 473ms cold handshake included) |
| `POST /api/plans/parse`, `POST /api/coach/plan`, `POST /api/meals` (bodies) | **500** ✗ | ~110–230ms |
| `PUT /api/me` `{"track_weight":true}` | **500** ✗ | ~125ms |
| `PUT /api/logs/daily/:date` `{"calories":100}` | **500** ✗ | ~83ms |

### Pattern (confirmed by paired empty/non-empty probes)
**Any request with a non-empty JSON body → 500; empty/missing body → correct 401.**
`PUT /me` flips 401→500 purely by adding one body field; `POST /meals` flips
500→401 purely by emptying the body. The throw therefore happens with/around a
non-empty parsed body, upstream of `requireAuth`'s 401 response.

### Why this blocks the streaming question — and may be worse
- The authenticated SSE test cannot proceed: a valid token would still carry a
  body, and the body-triggered throw precedes auth handling. Streaming TTFT
  comparison is **blocked until this is fixed**.
- If the throw is body-dependent rather than auth-dependent, **all production
  writes** (lift/meal/plan/coach POSTs and daily PUTs from the real app) may be
  500ing too — i.e. a possible full write outage, not a perf issue. Verify from
  the app immediately (log any set/meal and watch for failure).

### Suspects (ranked, all unverified — server logs decide)
1. **Deployed code ≠ this checkout.** The VPS may run an older image with a
   body-touching defect since fixed here. Check on the VPS: `git log --oneline -3`
   / image build date vs repo HEAD `95e1dbd`.
2. **Clerk middleware vs non-empty bodies** under the pinned `@clerk/express`
   version — needs the server-side `Unhandled error:` line to confirm.
3. Proxy body handling — unlikely (valid JSON, no 400/413, small payloads).

### Immediate next steps (VPS side, no approval needed — all read-only)
1. `docker compose logs --tail=50 api` (or host journal) right after one failing
   probe — the `Unhandled error:` line names the thrower.
2. Confirm deployed commit vs `95e1dbd`; redeploy if behind.
3. Confirm from the mobile app whether real writes currently succeed or fail.
4. Do NOT apply the Nginx snippet for a buffering problem that may not exist —
   if writes are 500ing, that dwarfs any streaming concern.

---

## 12. AI latency — implemented 2026-10-15 (pipeline only; models/prompts/rounds untouched)

### 78s TTFT decomposition (from code structure — prod-signal confirmation still needed)
Pre-model work per turn is: session resolve (1–2 queries) + 12-query context +
history fetch (one `Promise.all`) + persist user message + session touch. On a warm
database that is milliseconds-to-tens-of-ms; on cold Neon, seconds — not 78s.
Reasoning is enabled by default on **all** agents (`thinking: config.ai.thinking !==
"disabled"`, `coach.ts:1025-1041`), the disable flag is documented-ignored by the
non-OpenAI provider, and 78s fits inside one 90s `streamRound` timeout. Structural
verdict: the 78s is almost certainly **single-round reasoning-model thinking time
on the full dossier + 8-turn history**, not pipeline stages and not tool-round
count (rounds happen *after* the first token streams). Confirm with one prod
`[coach] turn` line: `rounds[0].ttftMs` ≈ 78s + `model` + `contextChars` settles it;
if instead `preModelMs` dominates, suspect cold Neon (then: Phase 2 DB work).

### Changes (3, all behavior-preserving except perceived latency)
1. **Bounded the lifetime-PR aggregation** (`services/coach.ts`): `groupBy
   by exerciseName` was the only unbounded query in the turn (full-table scan,
   growing with account age). Now `date: { gte: yearAgo }` (same trailing year as
   the weight history). Output identical for any PR within the year.
2. **Parallelized pre-model writes**: `coachMessage.create` + `coachSession.update`
   were sequential awaits; now one `Promise.all` (~1 DB RTT saved off TTFT).
3. **Early status ping**: `onStatus("Checking your logs…")` before round 0. The
   client already clears status on first delta, so a thinking-heavy first round no
   longer reads as dead air. Perceived TTFT only; timing untouched.

### Before / after (measured where measurable)
- Lifetime scan: unbounded → 365-day bound (full-table aggregation eliminated).
- Persist path: 2 sequential writes → 1 batch.
- Pre-round client signals: 0 → 1.
- Suite: 203 → **205 tests PASS** (2 new regression tests: PR date bound exact to
  `2025-10-10T00:00:00Z` under frozen time; status-before-delta ordering +
  single user persist), `tsc` clean, full run green.
- Expected user-visible effect: ms-scale (warm DB) on actual TTFT; unbounded-scan
  growth eliminated for veteran accounts; dead-air perception fixed. The 78s
  thinking time itself is **not** reduced by this change — that needs the prod
  attribution above, then a model/thinking decision (explicitly deferred, needs
  approval as orchestration-adjacent).

### Deliberately not touched (needs prod evidence + approval)
Model routing/thinking flags, token budgets (`toolTokens`/`replyTokens`), tool-round
defaults, history depth, instruction replay, context truncation — each trades
answer quality for speed and cannot be sized without `roundTimings`/`model`/
`contextChars` from live turns.

### Attribution CONFIRMED 2026-10-15 from 3 production turns (deepseek-v4-flash, chaining OFF)
Slowest turn: `totalMs 90365`, `preModelMs 2526` (session 253 + context 1766 +
persist 506), rounds `4022 → 4112 → 78703ms` with round TTFTs `null, null, 78406ms`,
`contextChars 4650`, inputs `5230 → 6131 → 6395` tokens. Client-perceived first
token ≈ 2.5 + 4.0 + 4.1 + 78.4 ≈ **89s** (the reported "78s" is round-2 TTFT exactly).
- **Pipeline exonerated:** pre-model is 2.5s, not 78s. Tool rounds precede the first
  token but emit no text here (`ttftMs null`) — round *count* cannot explain it either.
- **Context size exonerated for this incident:** the 78.7s round ran on 6395 input
  tokens while sibling rounds on 5–6k tokens took ~4s — a **~19x outlier at equal
  input scale, same model, same turn**. Not prefill-bound, not thinking-proportional.
- **Verdict: provider-side stall** (overloaded/experimental endpoint, cold model, or
  runaway reasoning on `deepseek-v4-flash`). Note round 2 stopped 11s short of the
  90s per-round timeout — without it, this turn hangs indefinitely.
- **Corroborating DB signal for Phase 2:** session 253ms for 1–2 point lookups,
  context 1.7–2.7s, tool DB calls uniformly ~500ms, persist ~500ms — a slow-DB
  floor under every turn (~2.5–3.5s pre-model). Not the 78s, but the TTFT floor.
- **Watch items (no action):** `chained:false` replays ~5–6k input tokens per round
  (turn totals 17.8k/23.9k in) — provider lacks response storage, so unavoidable
  without a provider change; one round hit exactly `outputTokens:1600` (tool-token
  ceiling — possible truncated args, monitor).
- My uncommitted pipeline changes against these numbers: persist ~506→~250ms,
  one bounded groupBy, early status ping — none would have touched the 78s, as predicted.

---

## 13. Stall strategy — implemented 2026-10-15 (retry same-model only; no model/routing/token changes)

### Plan (as approved in scope)
Silent-failure single retry for `callModel` (non-streaming) and `streamRound`
(SSE), plus an env-gated inactivity watchdog. Retry fires **only when zero bytes
surfaced** (no delta forwarded, no tool call collected) — the single-return
invariant holds, so tools execute at most once per round and the client never
sees doubled text. Anything already visible fails with 502 instead of replaying.
Model fallback deliberately excluded (needs model-selection approval).

### Changes
- `services/coach.ts`: `MODEL_ATTEMPTS = 2`; `callModel` retries network/timeout
  throws and HTTP 5xx (never 4xx incl. 429, never empty-200); `streamRound`
  retries fetch-throw/5xx/silent-stall/silent-mid-stream-error, maps visible-partial
  failures to 502 (previously raw rethrow), per-attempt fresh signals, stall timer
  armed/reset/cleared per round (`AI_STALL_MS`, **default 0 = off** — threshold
  cannot be sized from one 78s incident: below it converts slow successes into
  failures, above the 90s timeout it never fires).
- `config/index.ts` + `.env.example`: `AI_STALL_MS` (default 0, sizing guidance).
- Verified mechanism with an isolated Node probe: aborting the fetch signal
  rejects a pending body `read()` with the abort reason (incl. custom
  `TimeoutError`), which is what the watchdog relies on.

### Before / after (measured)
- Transient silent failures (socket error, 5xx-before-bytes, pre-byte stall):
  turn fails → **succeeds on retry** (proven by tests T1/T3/T4/T6/T7 below).
- Mid-stream failures after visible output: unchanged fail-fast 502, fetch ×1 (T5).
- 4xx/empty-200: unchanged, single attempt (T2).
- Tool single-execution across a retry: proven `findManyPlans ×1`, fetch ×3 (T6).
- Suite: 205 → **212 tests PASS** (7 new), `tsc` clean, full run green.

### Trade-offs and remaining risks
- Worst-case failure latency doubles (non-streaming 60→~120s, inside mobile 120s
  budgets; silent streaming fail 90s→~180s, user-Stoppable; aborts unaffected).
  Success path: zero extra calls/cost.
- The observed 78s-*completing* round would **not** be retried (it emitted output)
  — correctly: replaying it could only duplicate. A repeat is bounded by the 90s
  timeout, not fixed here; fixing *that* needs a sized watchdog threshold (p99
  round data) or a fallback model (approval required).
- 429 not retried (fail fast; immediate retry burns quota).
- Watchdog boundary race (final chunk vs stall fire) resolves to fail-fast 502 —
  same property as the pre-existing 90s timeout; acceptable at a generous threshold.

---

## 16. Vision model: `v4-flash-vision-exp` → `v4.1-flash` (2026-10-15, owner-approved)

Catalog comparison (CommandCode, Oct 2026): V4.1 Flash scores 39.5 vs 34.8 at the
identical $0.15/$0.60, and drops the `exp` (experimental-endpoint) tag — the class
of endpoint behind the observed stall variance. Changed the code default
(`config.models.physique`), the doc comment, and both `.env.example` pins.
`tsc` clean, 219 tests PASS. **Env precedence caveat:** `COACH_PHYSIQUE_MODEL` /
`COACH_MEAL_VISION_MODEL` override the default — if the VPS `.env` pins the exp
id explicitly, it must be updated there too (production change, owner side).
Trial watch: food/photo estimation accuracy + `coach_turn.first_delta_ms`
(meal/physique paths); rollback is one env var.

### Chat/plan/meal fallbacks → v4.1-flash (2026-10-15, owner-approved)
`chatFast`/`chatSmart`/`plan`/`meal` code fallbacks changed from
`gpt-4.1-mini`/`gpt-4.1` to `deepseek/deepseek-v4.1-flash` (same price band,
scored 39.5; ~3–13x cheaper than the GPT list prices they replace). Env pins
still win where set. Deliberately untouched: `OPENAI_*` parsing chain (URL-pinned
to `api.openai.com` — moving providers needs a code change; advised against:
rare, cheap, works), `openai.model` (single diagnostic log line), and the dev-only
`scripts/compare-meal-models.ts` A/B harness (its OpenAI side is intentional).
`tsc` clean, 219 tests PASS. VPS side (owner): pin the six `COACH_*` ids in `.env`
(see report), restart, trial one week on `first_delta_ms` + plan-schema success;
rollback = repin + restart.

### Meal-vision fallback → v4.1 + OpenAI inventory (2026-10-15, owner-approved)
`config.models.mealVision` fallback changed `gpt-4.1` → `deepseek/deepseek-v4.1-flash`
(same move as physique; a text-model fallback silently returns nothing for
images on a vision path). `tsc` clean, 219 tests PASS. Same env-precedence
caveat: a pinned `COACH_MEAL_VISION_MODEL` on the VPS wins over this default.
Full OpenAI coupling inventory (code grep): boot-required `OPENAI_API_KEY`,
`OPENAI_MODEL` (diagnostic only), `OPENAI_PARSE_MODEL` + hardcoded
`api.openai.com` URL in `planParser.ts` (pinned — moving providers needs a code
change), and the `gpt-4.1-mini`/`gpt-4.1` fallbacks for chatFast/chatSmart/plan/
meal (dormant wherever VPS env pins `COACH_*`, as prod logs confirm for chat).
DeepSeek replacements audited per slot; swaps pending owner approval.

### Local + fallback alignment to v4.1-flash (2026-10-15, owner-approved)
Code fallbacks for `chatFast`/`chatSmart`/`plan`/`meal` changed from
`gpt-4.1-mini`/`gpt-4.1` to `deepseek/deepseek-v4.1-flash` (env pins still win).
Local `log-app-backend/.env` pins aligned too (6 vars: FAST, MODEL, PLAN,
VISION, MEAL, MEAL_VISION — all v4.1-flash; verified via boot check resolving
every slot). Deliberately untouched: `OPENAI_*` parsing chain (URL-pinned),
`openai.model` (diagnostic only), `scripts/compare-meal-models.ts` (its OpenAI
side is intentional). `tsc` clean, 219 tests PASS. VPS side (owner): mirror the
six pins in the VPS `.env`, restart, trial one week.

---

## 15. Startup/login + dashboard loading — implemented 2026-10-15 (mobile only)

### Audit (blocking work found vs already-fine)
- Sections already render progressively (per-section `loading && empty` gates on
  Today; `firstLoad` placeholders on Insights) — no full-screen gate to remove.
- Real blocks found: (1) pull-spinner `refreshing = OR(all section loadings)`
  pinned the indicator to the slowest widget; (2) `AuthGate`'s `useMe()` fired a
  guaranteed-401 `GET /me` on every signed-out cold start (plus error state);
  (3) hook-state `profile` survived sign-out → stale previous-user flash on next login.

### Changes (3, mobile only, no UI redesign)
1. **Manual-refresh-owned spinner** (`app/(tabs)/today.tsx`): `refetchAll` is now
   `async` over `Promise.allSettled` with its own flag; sections were and remain
   independently interactive. Dropped the two orphaned loading aliases.
2. **`useMe(enabled = true)`** (`src/hooks/useMe.ts`): skips fetch + invalidation
   sync while disabled and clears profile/error on disable. All 8 other callers
   use the default — behavior identical for them.
3. **`AuthGate` passes `isSignedIn === true`** (`app/_layout.tsx`): no `/me` until
   a session exists; fixes the wasted 401 and the stale-profile flash together.

### Before / after (measured where measurable)
- Pull-spinner bound to slowest of 5 → bound to the user's own pull gesture.
- Signed-out cold start: 1 wasted 401 + error state → zero requests.
- Suite: mobile `tsc` clean, `expo lint` clean (2 orphaned-alias warnings caught
  and removed by the lint gate itself). Backend untouched this phase.
- Deliberately not touched: OTA check timing and PostHog replay (product
  analytics surface — needs owner call), `AuthGate`'s signed-in `/me` dependency
  (routing genuinely depends on `onboarded_at`), sign-in flow (works).

---

## 14. Database — implemented 2026-10-15 (config + cache only; no query/infra changes)

### Findings (failures vs slow queries, separated with evidence)
- **Connection failures (`ETIMEDOUT`):** TCP-connect-phase errors. Code causes
  found: `connectionTimeoutMillis` unset (pg default 0 = wait forever — a stuck
  connect hangs instead of failing), no `pool.on('error')` listener (idle-client
  backend errors unhandled), and pooled sockets held across Neon's documented
  5-minute scale-to-zero suspend (Free fixed; paid configurable — docs verified,
  resume "hundreds of ms" per Neon, dead pooled sockets after suspend per
  node-pg history). No statement timeout was added: with a `-pooler`
  (PgBouncer transaction-mode) host it is unsafe without verifying pooler mode.
- **Slow successes (250ms auth, 1.7–2.7s context, ~500ms tools):** uniform cost
  across trivial indexed reads with complete index coverage (verified in schema)
  = network RTT + suspend-resume, not query shape. 13 concurrent context queries
  additionally exceed the pg default `max: 10` (client-side queueing by arithmetic).

### Changes (4, behavior-preserving, security-neutral)
1. **Auth-lookup cache** (`middleware/auth.ts`): 60s TTL, 2000-entry cap,
   oldest-first eviction. Safe because the `clerkUserId→userId` mapping is
   immutable (unique key, ids never change, no user-delete path) — cannot go
   stale. Removes the measured ~250ms DB lookup from every cache-hit request.
2. **Pool hardening** (`db/client.ts`, extracted testable `buildPoolOptions()`):
   `max 20`, `connectionTimeoutMillis 10s` (fail fast, was infinite),
   `idleTimeoutMillis 10s` explicit, TCP `keepAlive`, log-only `pool.on('error')`
   listener (never crashes). No success-path behavior change.
3. **Keepalive `SELECT 1` every 4 min** (under the 5-min suspend; `DB_KEEPALIVE_MS`
   off-switch, `unref`'d, skipped under tests). Negligible cost either way.
4. **Explicitly declined:** `statement_timeout` (pooler-mode risk), context query
   reduction (all 12 return needed content), longer auth TTL, connection rotation.

### Before / after (measured)
- Suite: 212 → **219 tests PASS** (7 new: pool shape, keepalive parsing ×2,
  cache hit/TTL-expiry/create-path/P2002-path), `tsc` clean, full run green.
- Expected: ~250ms off every cache-hit request (all endpoints); context session
  stage ~253ms→~0ms on hit; `ETIMEDOUT` class converted to fast failures +
  visibility (confirm in logs: fewer timeouts, `[db] slow` lines improving).
- Verify in prod: `[req]` p50/p95 per endpoint before/after deploy; `stages.session`
  and `stages.context` in `[coach] turn` lines; absence of new `idle client error`.
