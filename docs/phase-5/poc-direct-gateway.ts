// POC: Direct browser-to-gateway call (bypassing Next.js proxy)
// This demonstrates the proposed architecture: browser → gateway → service
//
// Context:
//   Current path:  browser → Next.js /api/v1/projects → API gateway → profile-project-service
//   Proposed path: browser → API gateway → profile-project-service
//
// Prerequisites:
//   1. NEXT_PUBLIC_API_GATEWAY_URL must be set in the Next.js environment.
//   2. CORS_ALLOWED_ORIGINS on the gateway must include the production frontend domain.
//   3. The JWT token is already stored in localStorage (see app/lib/authSession.ts).
//
// Auth model:
//   Auth is fully stateless JWT — no httpOnly cookies.
//   The token lives in localStorage["script_manifest_session"].token and is sent as
//   "Authorization: Bearer <token>".  The Next.js proxy layer has ZERO security
//   advantage here; removing it is safe.
//
// CORS config (verified in services/api-gateway/src/index.ts lines 63-68):
//   origin:         process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"]
//   methods:        GET, POST, PUT, PATCH, DELETE, OPTIONS
//   allowedHeaders: Content-Type, Authorization, x-request-id
//   credentials:    true
//
// This means direct browser calls from localhost:3000 are already permitted by the
// gateway's default CORS config — no gateway changes required for local development.

import type { AuthSessionResponse } from "@script-manifest/contracts";

// ---------------------------------------------------------------------------
// Config — set NEXT_PUBLIC_API_GATEWAY_URL in .env.local (writer-web) for direct calls
// ---------------------------------------------------------------------------

const API_GATEWAY =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_GATEWAY_URL) ||
  "http://localhost:4000";

// ---------------------------------------------------------------------------
// Auth helpers — mirrors the logic in apps/writer-web/app/lib/authSession.ts
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "script_manifest_session";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSessionResponse;
    return session.token ?? null;
  } catch {
    return null;
  }
}

function buildAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// POC: Direct Call — GET /api/v1/projects
//
// Equivalent to the current Next.js proxy route at:
//   apps/writer-web/app/api/v1/projects/route.ts  (11 lines, pure passthrough)
//
// The proxy route does nothing except:
//   1. Re-forward Content-Type and Authorization headers.
//   2. Re-forward query params.
//   3. Convert the upstream response to NextResponse.json(...).
//   4. Wrap network failures in a { error: "api_gateway_unavailable" } 502.
//
// The direct call below replicates all meaningful behaviour client-side.
// ---------------------------------------------------------------------------

export async function fetchProjectsDirect(authToken: string): Promise<unknown> {
  const response = await fetch(`${API_GATEWAY}/api/v1/projects`, {
    headers: buildAuthHeaders(authToken),
    credentials: "include", // required when CORS credentials:true is set on gateway
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Gateway error ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// POC: Direct Call — POST /api/v1/projects
// ---------------------------------------------------------------------------

export async function createProjectDirect(
  authToken: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${API_GATEWAY}/api/v1/projects`, {
    method: "POST",
    headers: buildAuthHeaders(authToken),
    credentials: "include",
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Gateway error ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// POC: React hook pattern — drop-in replacement for the proxied useFetch
// ---------------------------------------------------------------------------
// Usage in a React component:
//
//   const token = getStoredToken();
//   if (!token) redirect("/login");
//   const projects = await fetchProjectsDirect(token);
//
// Or using the stored token directly:
//
//   const token = getStoredToken();
//   if (token) {
//     fetchProjectsDirect(token).then(setProjects).catch(console.error);
//   }

// ---------------------------------------------------------------------------
// What needs to change in writer-web for a full Direct Call migration:
//
//   1. Add NEXT_PUBLIC_API_GATEWAY_URL to apps/writer-web/.env.local (dev)
//      and to all deployment environment configs.
//
//   2. In production, CORS_ALLOWED_ORIGINS on the gateway MUST include the
//      live frontend domain (e.g., "https://app.scriptmanifest.com").
//      Current default only allows "http://localhost:3000".
//
//   3. Replace fetch("/api/v1/projects") calls with fetchProjectsDirect(token)
//      one route group at a time (projects → auth → feedback → etc.).
//
//   4. Update error handling: proxy currently returns { error: "api_gateway_unavailable" }
//      with HTTP 502 on network failure; direct calls surface a TypeError instead.
//      Client error boundaries should handle both shapes during the migration window.
//
//   5. The four non-pure proxy routes (upload, bug-report, export, viewer) stay
//      in Next.js — only the 76 pure-proxy routes move to direct calls.
// ---------------------------------------------------------------------------
