# Data Fetching Guide (writer-web)

Authoritative reference for fetching, caching, and mutating data in `apps/writer-web`. Originally drafted as a migration guide in CHAOS-1523; finalized in CHAOS-1520 once the migration from `useEffect + fetch` to SWR + Server Components was complete.

## 1) Architecture

```mermaid
flowchart TD
  user[User] --> page[Next.js App Router page]
  page -->|"Server Component"| sf[serverFetch (lib)]
  sf --> gw[API Gateway]
  page -->|"Client Component"| swr[useSWR / useSWRMutation]
  swr --> fetcher[fetcher (lib)]
  fetcher --> bff[/api/v1/* route proxy/]
  bff --> gw
  gw --> svc[Backend services]
  swr -->|"refreshAuth, mutate(key)"| swr
```

Four layers:

1. **Typed fetcher** — `apps/writer-web/app/lib/fetcher.ts`. Wraps `fetch`, returns parsed JSON typed via generics, throws `ApiError(status, code, body)` on non-2xx.
2. **SWR (client)** — `useSWR` for reads, `useSWRMutation` for writes. Cache, dedupe, focus/visibility/reconnect revalidation, polling come for free.
3. **Server Component reads** — `apps/writer-web/app/lib/serverFetch.ts`. Reads `sm_session` cookie, forwards Authorization to the gateway, returns parsed JSON or throws `ApiError`.
4. **Server Actions / route handlers** — for mutations originating from RSC pages.

## 2) Decision tree

| Surface | Recommended primitive |
| --- | --- |
| Public, read-mostly page | Server Component + `serverFetch` |
| Auth-bound page, interactive UI | Client `useSWR` with the typed `fetcher` |
| Mutation from client UI (forms, buttons) | `useSWRMutation` + `mutate(key)` |
| Mutation from RSC page | Server Action + `revalidatePath` / `revalidateTag` |
| Polling (e.g. unread badge) | `useSWR(key, { refreshInterval })` |
| Auth-gated resource where user may be unknown | Pause SWR with `null` key until `useAuth().loading === false` |
| One-shot fire-and-forget side effect on mount | `useSWRMutation` triggered from `useEffect` |
| Filter / search state that should survive navigation | URL `searchParams` driving a Server Component re-render |

## 3) Pattern catalogue

### 3.1 Auth-bound read (`useSWR`)

```tsx
const { user, loading: authLoading } = useAuth();
const profileKey = authLoading || !user ? null : `/api/v1/profiles/${encodeURIComponent(user.id)}`;
const { data, isLoading, mutate } = useSWR<{ profile: WriterProfile }>(profileKey, {
  onError(err) {
    toast.error(err instanceof ApiError ? err.message : "Failed to load profile.");
  },
});
```

Reference implementations:
- `apps/writer-web/app/profile/page.tsx`
- `apps/writer-web/app/coverage/dashboard/page.tsx`

### 3.2 Mutation (`useSWRMutation`)

```tsx
async function putProfile(url: string, { arg }: { arg: WriterProfileDraft }) {
  return fetcher(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(arg),
  });
}

const { trigger, isMutating } = useSWRMutation(profileKey, putProfile, {
  populateCache: true,
  revalidate: false,
  onSuccess() {
    toast.success("Profile saved.");
  },
});
```

Reference: `apps/writer-web/app/profile/page.tsx`.

### 3.3 Polling

```tsx
const { data } = useSWR<UnreadCountResponse>(
  "/api/v1/notifications/unread-count",
  fetcher,
  { refreshInterval: 30_000, shouldRetryOnError: false },
);
```

Reference: `apps/writer-web/app/components/notificationBell.tsx`.

### 3.4 Server Component read

```tsx
// app/leaderboard/page.tsx — Server Component, no "use client"
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LeaderboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  let data: LeaderboardResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await serverFetch<LeaderboardResponse>("/api/v1/leaderboard", {
      searchParams: { format: firstParam(params.format), genre: firstParam(params.genre) },
    });
  } catch (err) {
    errorMessage = err instanceof ApiError ? err.message : "Failed to load leaderboard.";
  }
  return <LeaderboardView data={data} errorMessage={errorMessage} />;
}
```

The interactive filter form lives in a sibling client island (`app/leaderboard/filters.tsx`) that uses `useRouter()` + `useSearchParams()` to push new filter state into the URL.

### 3.5 Client island that re-renders the Server Component

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function LeaderboardFilters(/* ... */) {
  const router = useRouter();
  const params = useSearchParams();
  function handleSubmit(form: HTMLFormElement) {
    const next = new URLSearchParams(params);
    next.set("format", new FormData(form).get("format")?.toString() ?? "");
    router.push(`/leaderboard?${next.toString()}`);
  }
  // ...
}
```

### 3.6 Auth session (`AuthProvider`)

`AuthProvider` is itself a thin wrapper around `useSWR("/api/v1/auth/me")`. To trigger revalidation imperatively (after login/logout/email-verification), import `refreshAuth` from `app/lib/AuthProvider`:

```tsx
import { refreshAuth } from "../lib/AuthProvider";
refreshAuth(); // → mutate("/api/v1/auth/me")
```

The legacy `AUTH_CHANGED_EVENT` window event is still honored for back-compat.

## 4) When NOT to use SWR

- **Form input state** — drive with `useState` / a form library. SWR is a data cache, not form state.
- **One-shot user actions that show a modal / navigate** — call the fetcher directly inside an event handler. Wrapping a single button-click in `useSWRMutation` is overkill.
- **Long-running uploads with progress** — use `fetch` + `XMLHttpRequest`-style progress; SWR has no progress primitive.
- **Push channels (WebSocket / SSE)** — use a dedicated subscription hook; SWR can hold the latest snapshot but should not own the transport.
- **Server Component data** — call `serverFetch` directly. Never import SWR in a Server Component.

## 5) Cache-key conventions

- Keys are API URL strings (`/api/v1/admin/competitions`).
- If the key depends on async-resolved data (auth, route params), return `null` until resolved.
- Do not use object keys. Always stringify query parameters into the URL.

```ts
const { user, loading } = useAuth();
const key = loading || !user ? null : `/api/v1/me/projects?writerId=${encodeURIComponent(user.id)}`;
```

## 6) Invalidating after a mutation

```ts
// Single key
const { mutate } = useSWRConfig();
await mutate("/api/v1/admin/competitions");
```

```ts
// useSWRMutation auto-revalidate
useSWRMutation(key, fetcher, { revalidate: true });
```

```ts
// Pattern match
await mutate((key) => typeof key === "string" && key.startsWith("/api/v1/admin/"));
```

## 7) Standard UI primitives

- Skeleton placeholders: `apps/writer-web/app/components/skeleton.tsx`
- Empty state: `apps/writer-web/app/components/emptyState.tsx`
- Toast surface: `apps/writer-web/app/components/toast.tsx`

Show skeletons during initial `isLoading === true`, switch to empty state when data resolves to `[]`, raise toasts only for non-blocking failures. Render blocking errors inline.

## 8) Error handling

Catch `ApiError` from `apps/writer-web/app/lib/fetcher.ts`:

- `status` — HTTP branch handling (401/403/404/5xx).
- `code` — API-level classification (e.g. `email_not_verified`).
- `body` — safe diagnostics for logs / dev tooling.

The global `SWRProvider` (`app/lib/SWRProvider.tsx`) is configured to:
- Skip retries on 4xx, retry on 5xx.
- Call `refreshAuth()` on any 401 (force a re-check of the session).

## 9) Lint enforcement

A custom ESLint rule prevents regressions:

```
script-manifest-data-fetching/no-fetch-in-effect (error)
```

Flags any `fetch()` call inside a `useEffect`, `useLayoutEffect`, or `useInsertionEffect` body — including transitively through `queueMicrotask`, `setTimeout`, etc. Rule source: `apps/writer-web/eslint-rules/no-fetch-in-effect.cjs`. Wired in `apps/writer-web/eslint.config.mjs`.

`queueMicrotask` may still appear in client components, but only for **non-data-fetch** state initialization (e.g. reading `localStorage` or `window.location.search` and deferring `setState` past the effect body to satisfy `react-hooks/set-state-in-effect`). Each remaining occurrence must carry a `// non-data-fetch: …` comment explaining why.

## 10) Migration cookbook

| Phase | Linear | What landed |
| --- | --- | --- |
| 0 — Foundation | CHAOS-1515 | swr dep, `SWRProvider`, typed `fetcher` + `ApiError`, this guide. |
| 1 — Pilot | CHAOS-1516 | profile + leaderboard (initial) + admin/competitions converted; pattern proven. |
| 2 — Bulk client | CHAOS-1517 (1529–1532) | ~26 pages migrated across admin / coverage / user-content / misc batches. |
| 3 — Special cases | CHAOS-1518 | AuthProvider on SWR, NotificationBell polling, `useClock`, signin OAuth via `useSWRMutation`. |
| 4 — RSC | CHAOS-1519 | leaderboard + coverage marketplace converted to Server Components; `serverFetch` helper. |
| 5 — Cleanup | CHAOS-1520 | Final 7 stragglers (admin metrics, methodology, feature flags, script viewer, onboarding ping x2, OnboardingChecklist) migrated; custom ESLint rule landed; docs finalized. |

## 11) Forbidden patterns

```tsx
// ❌ fetch inside useEffect — lint will fail
useEffect(() => {
  fetch("/api/v1/something").then(r => r.json()).then(setData);
}, []);
```

```tsx
// ❌ queueMicrotask wrapping a fetch — lint will fail
useEffect(() => {
  queueMicrotask(async () => {
    const res = await fetch("/api/v1/something");
    setData(await res.json());
  });
}, []);
```

```tsx
// ❌ useState + manual loading + fetch triple — lint will fail (no-fetch-in-effect)
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch("/api/v1/something").then(/* ... */).finally(() => setLoading(false));
}, []);
```

```tsx
// ✅ replace with useSWR
const { data, isLoading } = useSWR<Payload>("/api/v1/something", fetcher);
```
