# Data Fetching Migration Guide (CHAOS-1523)

## 1) Why this exists

CHAOS-1512 removed direct lint violations by wrapping mount-time fetches in `queueMicrotask(...)`. That unblocked CI, but it preserved the same failure modes: duplicate requests, no cache reuse, bespoke loading/error branches, and brittle polling.

CHAOS-1514 documented the cost-of-pain table (duplicate requests, stale re-entry, inconsistent UX, and foot-gun patterns). This guide standardizes Phase 1+ migrations so we stop creating one-off fetch/state stacks per page.

## 2) The new stack

Use this stack in order:

1. Typed fetcher: `apps/writer-web/app/lib/fetcher.ts`
   - `fetcher<T>(input, init)`
   - `ApiError` with `status`, `code`, `body`
2. SWR in client surfaces: `useSWR` / `useSWRMutation`
3. RSC + Server Actions for read-heavy flows where client interactivity is not required for initial data read.

## 3) Decision tree: which tool for which case?

- Mostly-static reads on a public page (no auth)
  - Use RSC + cached fetch.
- Auth-bound reads in a client page
  - Use `useSWR` with the typed fetcher.
- Mutations from interactive client UI
  - Use `useSWRMutation` and invalidate with `mutate(key)`.
- Mutations from RSC pages
  - Use Server Action + `revalidatePath`/`revalidateTag`.
- Polling (for example NotificationBell)
  - Use `useSWR` with `refreshInterval`.
- Auth-gated resource where user may be unknown
  - Pause SWR until auth resolves (`null` key / `isPaused` gate until `useAuth().loading === false`).

## 4) Before / after recipes

### A. Admin CRUD page (`admin/competitions`)

Source: `apps/writer-web/app/admin/competitions/page.tsx` (see around lines 49-72)

**Before (current bespoke pattern)**

```tsx
async function loadCompetitions() {
  setLoading(true);
  setStatus("");
  try {
    const response = await fetch("/api/v1/competitions?includeHidden=true&includeCancelled=true", { cache: "no-store" });
    const body = (await response.json()) as { competitions?: Competition[]; error?: string };
    if (!response.ok) {
      setStatus(body.error ? `Error: ${body.error}` : "Unable to load competitions.");
      return;
    }
    setRows(body.competitions ?? []);
  } finally {
    setLoading(false);
  }
}

useEffect(() => {
  queueMicrotask(() => { void loadCompetitions(); });
}, []);
```

**After (Phase 1 target: CHAOS-1524)**

```tsx
// TODO(CHAOS-1524): migrate to useSWR + useSWRMutation
// key: '/api/v1/admin/competitions'
// FILL IN AT PHASE 1
```

### B. Public read-only list (`leaderboard`)

Source: `apps/writer-web/app/leaderboard/page.tsx` (see around lines 84-128)

**Before (current bespoke pattern)**

```tsx
const runLeaderboardQuery = useCallback(async (activeFilters: Filters) => {
  setLoading(true);
  setStatus("");
  const search = new URLSearchParams();
  // ...manual query param construction...
  const response = await fetch(`/api/v1/leaderboard?${search.toString()}`, { cache: "no-store" });
  // ...manual response/error branches...
  setLoading(false);
}, []);

useEffect(() => {
  queueMicrotask(() => { void runLeaderboardQuery(initialFilters); });
}, [runLeaderboardQuery]);
```

**After option 1 (client SWR, Phase 1 target: CHAOS-1525)**

```tsx
// TODO(CHAOS-1525): migrate to client useSWR
// FILL IN AT PHASE 1
```

**After option 2 (RSC for mostly-static reads, Phase 1 target: CHAOS-1525)**

```tsx
// TODO(CHAOS-1525): migrate to Server Component read path
// FILL IN AT PHASE 1
```

Tradeoff summary:
- Client SWR: easier filter interactivity + built-in revalidation.
- RSC: better initial payload characteristics for mostly-static/public reads.

### C. Owner-bound mutation (`profile`)

Source: `apps/writer-web/app/profile/page.tsx` (see around lines 52-111)

**Before (current bespoke pattern)**

```tsx
const loadProfile = useCallback(async (explicitWriterId?: string) => {
  const targetWriterId = explicitWriterId ?? writerId;
  if (!targetWriterId.trim()) return;
  setLoading(true);
  const response = await fetch(`/api/v1/profiles/${encodeURIComponent(targetWriterId)}`, {
    cache: "no-store",
    headers: {}
  });
  // ...manual parse + state fanout + toast branches...
  setLoading(false);
}, [writerId]);

useEffect(() => {
  if (writerId) queueMicrotask(() => { void loadProfile(writerId); });
}, [loadProfile, writerId]);
```

**After (Phase 1 target: CHAOS-1526)**

```tsx
// TODO(CHAOS-1526): migrate to auth-paused useSWR + useSWRMutation save path
// FILL IN AT PHASE 1
```

## 5) Cache-key conventions

- Use API URL strings as keys (example: `'/api/v1/admin/competitions'`).
- If key composition depends on auth/params, return `null` while unresolved.
- Do not use object keys.

```ts
const { user, loading } = useAuth();
const key = loading || !user ? null : `/api/v1/me/projects?writerId=${encodeURIComponent(user.id)}`;
```

## 6) Invalidating cache after a mutation

Use one of:

```ts
const { mutate } = useSWRConfig();
await mutate('/api/v1/admin/competitions');
```

```ts
// via useSWRMutation options
// revalidate: true
```

```ts
const { mutate } = useSWRConfig();
await mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/admin/'));
```

## 7) Standard loading / error / empty-state UI

Existing references:

- Skeleton primitives: `apps/writer-web/app/components/skeleton.tsx`
- Empty state: `apps/writer-web/app/components/emptyState.tsx`
- Toast surface: `apps/writer-web/app/components/toast.tsx`

Missing standardized inline error surface:

```ts
// TODO Phase 1 — add Skeleton/ErrorInline/Empty components (or wrapper conventions)
// Follow-up: CHAOS-1528
```

## 8) Polling

```ts
useSWR(key, { refreshInterval: 30_000, refreshWhenHidden: false });
```

Set `refreshWhenHidden: false` so polling pauses while tab is hidden.

## 9) Auth-bound resources

```ts
const { user, loading } = useAuth();
const { data } = useSWR(loading || !user ? null : '/api/v1/me/projects');
```

## 10) Error handling

Handle `ApiError` from `apps/writer-web/app/lib/fetcher.ts`.

- `status` for HTTP branch handling (401/403/404/5xx)
- `code` for API-level classification
- `body` for safe diagnostics

Render blocking failures inline; use `Toast` for non-blocking failures.

## 11) Migration cookbook

Phase 2 PRs append entries here. Each entry: title, link to PR, what pattern was migrated, anything surprising.

- 

## 12) Forbidden patterns (will fail lint once CHAOS-1520 lands)

Do not introduce these patterns in new code:

- `useEffect(() => { fetch(...) }, [])`
- `queueMicrotask(() => fetch(...))`

```tsx
// ❌ forbidden
useEffect(() => {
  queueMicrotask(async () => {
    const res = await fetch('/api/v1/something');
    setData(await res.json());
  });
}, []);
```
