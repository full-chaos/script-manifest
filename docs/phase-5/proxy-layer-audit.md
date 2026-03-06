# Proxy Layer Audit — Phase 5.4 (CHAOS-606)

## Executive Summary

- Audited all `80` `route.ts` files under `apps/writer-web/app/api`.
- Classification result: `76` Pure proxy, `2` Custom logic, `2` Special handling.
- The `_proxy.ts` utility is a thin passthrough that forwards query params and only two request headers (`Content-Type`, `Authorization`), while dropping upstream response headers.
- API gateway CORS currently allows `http://localhost:3000` by default, allows credentials, and includes `Content-Type`, `Authorization`, and `x-request-id`.
- Recommendation: **partial removal** of Next.js proxy routes. Keep only routes with real value (`scripts/upload`, `bug-report`, `export/[format]`, `scripts/[scriptId]/viewer`), remove the rest.

## Current Architecture

Current request path:

`browser -> Next.js API routes -> API Gateway -> microservices`

Proposed request path for proxied endpoints:

`browser -> API Gateway -> microservices`

## Proxy Utility Analysis (`apps/writer-web/app/api/v1/_proxy.ts`)

Behavior observed from full file read:

- Base URL: `process.env.API_GATEWAY_URL ?? "http://localhost:4000"`.
- Forwards all incoming query params to the upstream URL.
- Forwards request headers:
  - `content-type` (if present)
  - `authorization` (if present)
- Does not forward other request headers (for example `cookie`, `x-request-id`, `accept-language`, custom client headers).
- For methods with body (`POST`/`PUT`/`PATCH`/`DELETE` etc.), reads `request.text()` and forwards raw text body.
- Uses `fetch(..., { cache: "no-store" })`.
- Reads upstream response as text, then:
  - empty response body -> `new NextResponse(null, { status })`
  - non-empty response body -> `safeJsonParse(...)` then `NextResponse.json(...)`
- Error handling: catches network/runtime fetch failures and returns JSON `{ error: "api_gateway_unavailable", detail }` with HTTP `502`.

Header implications:

- Response headers from upstream are not preserved by `_proxy.ts`.
- In practice this strips headers like `Set-Cookie`, `Cache-Control`, `ETag`, and `Content-Disposition` from generic proxied responses.
- This is acceptable for the current stateless JWT model (no httpOnly cookie dependency), but it removes cache and download metadata unless route-specific code handles it.

## Route Classification

Classification method:

- Full inventory from `find apps/writer-web/app/api -name 'route.ts'` (`80` files).
- Read directly: `_proxy.ts`, `v1/scripts/upload/route.ts`, `v1/bug-report/route.ts`, and representative pure-proxy/special routes.
- For the remaining simple wrappers, classified as **Assumed pure proxy (pattern match)** when they follow the same `proxyRequest(...)` passthrough structure.

| Route | File | Category | Notes |
|-------|------|----------|-------|
| `/api/scripts/[scriptId]/viewer` | `apps/writer-web/app/api/scripts/[scriptId]/viewer/route.ts` | Special handling | Custom dual-path fetch (gateway when auth present, direct script-storage fallback), schema validation. |
| `/api/v1/admin/competitions/[competitionId]` | `apps/writer-web/app/api/v1/admin/competitions/[competitionId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/competitions` | `apps/writer-web/app/api/v1/admin/competitions/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/appeals/[appealId]/resolve` | `apps/writer-web/app/api/v1/admin/rankings/appeals/[appealId]/resolve/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/appeals` | `apps/writer-web/app/api/v1/admin/rankings/appeals/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/flags/[flagId]/resolve` | `apps/writer-web/app/api/v1/admin/rankings/flags/[flagId]/resolve/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/flags` | `apps/writer-web/app/api/v1/admin/rankings/flags/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/prestige/[competitionId]` | `apps/writer-web/app/api/v1/admin/rankings/prestige/[competitionId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/prestige` | `apps/writer-web/app/api/v1/admin/rankings/prestige/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/admin/rankings/recompute` | `apps/writer-web/app/api/v1/admin/rankings/recompute/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/auth/login` | `apps/writer-web/app/api/v1/auth/login/route.ts` | Pure proxy | Read directly; thin `POST` passthrough via `proxyRequest`. |
| `/api/v1/auth/logout` | `apps/writer-web/app/api/v1/auth/logout/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/auth/me` | `apps/writer-web/app/api/v1/auth/me/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/auth/oauth/[provider]/callback` | `apps/writer-web/app/api/v1/auth/oauth/[provider]/callback/route.ts` | Pure proxy | Read directly; dynamic param passthrough to gateway path. |
| `/api/v1/auth/oauth/[provider]/complete` | `apps/writer-web/app/api/v1/auth/oauth/[provider]/complete/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/auth/oauth/[provider]/start` | `apps/writer-web/app/api/v1/auth/oauth/[provider]/start/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/auth/register` | `apps/writer-web/app/api/v1/auth/register/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/bug-report` | `apps/writer-web/app/api/v1/bug-report/route.ts` | Custom logic | Linear SDK integration, payload validation, env checks, issue creation, custom error mapping. |
| `/api/v1/competitions/[competitionId]/deadline-reminders` | `apps/writer-web/app/api/v1/competitions/[competitionId]/deadline-reminders/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/competitions` | `apps/writer-web/app/api/v1/competitions/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/disputes/[id]` | `apps/writer-web/app/api/v1/coverage/disputes/[id]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/disputes` | `apps/writer-web/app/api/v1/coverage/disputes/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/cancel` | `apps/writer-web/app/api/v1/coverage/orders/[id]/cancel/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/claim` | `apps/writer-web/app/api/v1/coverage/orders/[id]/claim/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/complete` | `apps/writer-web/app/api/v1/coverage/orders/[id]/complete/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/deliver` | `apps/writer-web/app/api/v1/coverage/orders/[id]/deliver/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/delivery` | `apps/writer-web/app/api/v1/coverage/orders/[id]/delivery/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/dispute` | `apps/writer-web/app/api/v1/coverage/orders/[id]/dispute/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]/review` | `apps/writer-web/app/api/v1/coverage/orders/[id]/review/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/orders/[id]` | `apps/writer-web/app/api/v1/coverage/orders/[id]/route.ts` | Pure proxy | Read directly; one-method passthrough route. |
| `/api/v1/coverage/orders` | `apps/writer-web/app/api/v1/coverage/orders/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/providers/[id]/reviews` | `apps/writer-web/app/api/v1/coverage/providers/[id]/reviews/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/providers/[id]` | `apps/writer-web/app/api/v1/coverage/providers/[id]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/providers/[id]/services` | `apps/writer-web/app/api/v1/coverage/providers/[id]/services/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/providers/[id]/stripe-onboarding` | `apps/writer-web/app/api/v1/coverage/providers/[id]/stripe-onboarding/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/providers` | `apps/writer-web/app/api/v1/coverage/providers/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/services/[id]` | `apps/writer-web/app/api/v1/coverage/services/[id]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/coverage/services` | `apps/writer-web/app/api/v1/coverage/services/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/export/[format]` | `apps/writer-web/app/api/v1/export/[format]/route.ts` | Special handling | Custom stream proxy for file export; validates format; preserves content headers manually. |
| `/api/v1/feedback/disputes/[disputeId]/resolve` | `apps/writer-web/app/api/v1/feedback/disputes/[disputeId]/resolve/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/disputes` | `apps/writer-web/app/api/v1/feedback/disputes/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/listings/[listingId]/cancel` | `apps/writer-web/app/api/v1/feedback/listings/[listingId]/cancel/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/listings/[listingId]/claim` | `apps/writer-web/app/api/v1/feedback/listings/[listingId]/claim/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/listings/[listingId]` | `apps/writer-web/app/api/v1/feedback/listings/[listingId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/listings` | `apps/writer-web/app/api/v1/feedback/listings/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/reputation/[userId]` | `apps/writer-web/app/api/v1/feedback/reputation/[userId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/reviews/[reviewId]/dispute` | `apps/writer-web/app/api/v1/feedback/reviews/[reviewId]/dispute/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/reviews/[reviewId]/rate` | `apps/writer-web/app/api/v1/feedback/reviews/[reviewId]/rate/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/reviews/[reviewId]` | `apps/writer-web/app/api/v1/feedback/reviews/[reviewId]/route.ts` | Pure proxy | Read directly; dynamic id passthrough. |
| `/api/v1/feedback/reviews/[reviewId]/submit` | `apps/writer-web/app/api/v1/feedback/reviews/[reviewId]/submit/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/reviews` | `apps/writer-web/app/api/v1/feedback/reviews/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/tokens/balance` | `apps/writer-web/app/api/v1/feedback/tokens/balance/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/tokens/grant-signup` | `apps/writer-web/app/api/v1/feedback/tokens/grant-signup/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/feedback/tokens/transactions` | `apps/writer-web/app/api/v1/feedback/tokens/transactions/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/leaderboard` | `apps/writer-web/app/api/v1/leaderboard/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/placements/[placementId]` | `apps/writer-web/app/api/v1/placements/[placementId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/placements/[placementId]/verify` | `apps/writer-web/app/api/v1/placements/[placementId]/verify/route.ts` | Pure proxy | Read directly; dynamic param passthrough. |
| `/api/v1/placements` | `apps/writer-web/app/api/v1/placements/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/profiles/[writerId]` | `apps/writer-web/app/api/v1/profiles/[writerId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/projects/[projectId]/co-writers/[coWriterUserId]` | `apps/writer-web/app/api/v1/projects/[projectId]/co-writers/[coWriterUserId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/projects/[projectId]/co-writers` | `apps/writer-web/app/api/v1/projects/[projectId]/co-writers/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/projects/[projectId]/drafts/[draftId]/primary` | `apps/writer-web/app/api/v1/projects/[projectId]/drafts/[draftId]/primary/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/projects/[projectId]/drafts/[draftId]` | `apps/writer-web/app/api/v1/projects/[projectId]/drafts/[draftId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/projects/[projectId]/drafts` | `apps/writer-web/app/api/v1/projects/[projectId]/drafts/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/projects/[projectId]` | `apps/writer-web/app/api/v1/projects/[projectId]/route.ts` | Pure proxy | Read directly; multi-method passthrough (GET/PUT/DELETE). |
| `/api/v1/projects` | `apps/writer-web/app/api/v1/projects/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/rankings/appeals` | `apps/writer-web/app/api/v1/rankings/appeals/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/rankings/methodology` | `apps/writer-web/app/api/v1/rankings/methodology/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/rankings/writers/[writerId]/badges` | `apps/writer-web/app/api/v1/rankings/writers/[writerId]/badges/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/rankings/writers/[writerId]` | `apps/writer-web/app/api/v1/rankings/writers/[writerId]/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/scripts/[scriptId]/access-requests/[requestId]/approve` | `apps/writer-web/app/api/v1/scripts/[scriptId]/access-requests/[requestId]/approve/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/scripts/[scriptId]/access-requests/[requestId]/reject` | `apps/writer-web/app/api/v1/scripts/[scriptId]/access-requests/[requestId]/reject/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/scripts/[scriptId]/access-requests` | `apps/writer-web/app/api/v1/scripts/[scriptId]/access-requests/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/scripts/[scriptId]/view` | `apps/writer-web/app/api/v1/scripts/[scriptId]/view/route.ts` | Pure proxy | Read directly; dynamic param passthrough. |
| `/api/v1/scripts/register` | `apps/writer-web/app/api/v1/scripts/register/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/scripts/upload-session` | `apps/writer-web/app/api/v1/scripts/upload-session/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/scripts/upload` | `apps/writer-web/app/api/v1/scripts/upload/route.ts` | Custom logic | Multipart handling, SSRF guard, optional upload session creation, upstream upload proxy with custom errors. |
| `/api/v1/submissions/[submissionId]/placements` | `apps/writer-web/app/api/v1/submissions/[submissionId]/placements/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/submissions/[submissionId]/project` | `apps/writer-web/app/api/v1/submissions/[submissionId]/project/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |
| `/api/v1/submissions` | `apps/writer-web/app/api/v1/submissions/route.ts` | Pure proxy | Assumed pure proxy (pattern match). |

## CORS Configuration

Source: `services/api-gateway/src/index.ts`.

- Gateway registers `@fastify/cors` with:
  - `origin: process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"]`
  - methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`
  - `allowedHeaders: ["Content-Type", "Authorization", "x-request-id"]`
  - `credentials: true`
- This means direct browser-to-gateway calls from local writer-web (`localhost:3000`) are already allowed by default.
- Because auth is JWT-in-header and not cookie-session based, this CORS posture supports direct calls without a Next.js proxy requirement.

## Risk Assessment

- Availability behavior changes if proxy is removed:
  - with proxy: browser receives normalized JSON `502` (`api_gateway_unavailable`) on gateway network failure.
  - without proxy: browser sees a CORS/network-level failure (`TypeError: Failed to fetch`) when gateway is down/unreachable.
- Error-shape consistency may shift for clients that currently rely on proxy-normalized errors.
- Any endpoint depending on custom server-side behavior must stay in Next.js routes.
- `_proxy.ts` currently strips upstream response headers, so removing pure proxy routes can actually improve header fidelity for direct calls.

## Recommendation

Recommendation: **partial removal** of the proxy layer.

Rationale:

- Keep Next.js routes only where they add real behavior:
  - `apps/writer-web/app/api/v1/scripts/upload/route.ts` (custom upload + SSRF protections)
  - `apps/writer-web/app/api/v1/bug-report/route.ts` (server-side Linear SDK integration)
  - `apps/writer-web/app/api/v1/export/[format]/route.ts` (stream/download header handling)
  - `apps/writer-web/app/api/scripts/[scriptId]/viewer/route.ts` (auth-aware dual upstream + schema validation)
- Remove or bypass the `76` pure proxy routes to reduce duplicate surface area and maintenance overhead.
- Stateless JWT architecture removes the main historical reason to keep a BFF proxy for cookie/session handling.

## Migration Plan (if removing)

1. Introduce a frontend API client that calls gateway endpoints directly using `API_GATEWAY_URL`.
2. Migrate one route group at a time (for example `auth`, then `projects`, then `feedback`) while preserving request/response contract tests.
3. Keep the four non-pure routes in Next.js as explicit server-only handlers.
4. Add client-side network error translation for gateway-unavailable cases so UX remains consistent with current proxy `502` messaging.
5. Decommission pure proxy routes and monitor for CORS/auth regressions in staging.
6. After confidence window, remove `_proxy.ts` only when no routes depend on it.

## POC: Direct Browser-to-Gateway Proof of Concept

### Route Chosen

`GET /api/v1/projects` (`apps/writer-web/app/api/v1/projects/route.ts`) was selected as the POC target because:

- It is a textbook **pure proxy** route — 11 lines with no custom logic.
- Both `GET` and `POST` are implemented as identical `proxyRequest(request, "/api/v1/projects")` calls.
- The upstream is `profile-project-service`, which has no streaming, file, or third-party SDK requirements.
- It is one of the most frequently called routes in writer-web, making the latency improvement immediately visible.

### CORS Configuration (Verified from `services/api-gateway/src/index.ts` lines 63–68)

```typescript
await server.register(cors, {
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
  credentials: true,
});
```

Key findings:

- Default `CORS_ALLOWED_ORIGINS` is `["http://localhost:3000"]`, which matches writer-web's local dev origin — **no gateway changes are needed for local development**.
- `credentials: true` permits the browser to send the `Authorization` header cross-origin.
- `allowedHeaders` includes `Content-Type` and `Authorization`, covering all headers the browser needs to make Direct Calls.
- **Production risk**: the default does not include any production domain. `CORS_ALLOWED_ORIGINS` must be set to the live frontend URL (e.g., `https://app.scriptmanifest.com`) before deployment.

### POC Snippet (Direct Call)

Full POC file: `docs/phase-5/poc-direct-gateway.ts`

```typescript
// POC: Direct browser-to-gateway call (bypassing Next.js proxy)
// Proposed architecture: browser → API gateway → microservice

const API_GATEWAY = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

async function fetchProjectsDirect(authToken: string): Promise<unknown> {
  const response = await fetch(`${API_GATEWAY}/api/v1/projects`, {
    headers: {
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",  // required: CORS credentials:true is set on the gateway
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Gateway error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}
```

Auth source: `apps/writer-web/app/lib/authSession.ts` exposes `getAuthHeaders()` which reads the JWT from `localStorage["script_manifest_session"].token` — no server-side session or cookie is involved.

### What Changes for Direct Calls

| Concern | Current (proxy) | Direct Call |
|---------|----------------|-------------|
| Fetch target | `/api/v1/projects` (relative, same origin) | `${NEXT_PUBLIC_API_GATEWAY_URL}/api/v1/projects` |
| Auth delivery | Proxy re-forwards `Authorization` header | Browser sends `Authorization` header directly |
| Error on gateway down | `{ error: "api_gateway_unavailable" }` HTTP 502 | `TypeError: Failed to fetch` (CORS/network) |
| Response headers | Stripped by `_proxy.ts` (`NextResponse.json`) | Full upstream headers preserved |
| Hop count | browser → Next.js → gateway → service | browser → gateway → service |

### Benefits

- **Removed network hop** — eliminates the Next.js server as a middleman, reducing round-trip latency.
- **Simpler error handling** — no more opaque `502 api_gateway_unavailable` wrapping gateway errors.
- **No 502 JSON wrapping** — Direct Calls expose real HTTP status codes from the gateway.
- **Header fidelity** — `Cache-Control`, `ETag`, and other upstream response headers reach the browser.
- **Less surface area** — removes 76 files of boilerplate proxy code.

### Risks

- `CORS_ALLOWED_ORIGINS` must be set to the production frontend domain before go-live; the default allows only `localhost:3000`.
- Error shape changes during migration window — clients that pattern-match on `{ error: "api_gateway_unavailable" }` need updating.
- Network failures surface as `TypeError` instead of structured JSON; client error boundaries must handle both shapes during the transition.

### Migration Path

1. Add `NEXT_PUBLIC_API_GATEWAY_URL` to `apps/writer-web/.env.local` (local) and all deployment environment configs.
2. Set `CORS_ALLOWED_ORIGINS` to the production frontend domain on the gateway.
3. Migrate one route group at a time: `projects` → `auth` → `feedback` → `scripts` → remaining groups.
4. Update client error handling to translate `TypeError: Failed to fetch` to user-friendly messages, matching the current 502 UX.
5. After each group migrates, delete the corresponding Next.js proxy routes.
6. When no routes depend on `_proxy.ts`, remove it as the final cleanup step.
