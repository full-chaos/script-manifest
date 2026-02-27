import { ScriptViewResponseSchema } from "@script-manifest/contracts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const apiGatewayBase = process.env.API_GATEWAY_URL ?? "http://localhost:4000";
const scriptStorageServiceBase =
  process.env.SCRIPT_STORAGE_SERVICE_URL ?? "http://localhost:4011";

export async function GET(
  request: Request,
  context: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await context.params;
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization");

  // If the caller provides auth, use the gateway's authenticated endpoint
  // which resolves the user from the token and checks access properly
  if (authorization) {
    const gatewayUrl = new URL(
      `/api/v1/scripts/${encodeURIComponent(scriptId)}/view`,
      apiGatewayBase
    );
    try {
      const upstream = await fetch(gatewayUrl, {
        headers: { authorization },
        cache: "no-store"
      });
      const body = await upstream.json();
      if (!upstream.ok) {
        return NextResponse.json(body, { status: upstream.status });
      }
      const parseResult = ScriptViewResponseSchema.safeParse(body);
      if (!parseResult.success) {
        return NextResponse.json(
          { error: "invalid_script_view_response", issues: parseResult.error.issues },
          { status: 502 }
        );
      }
      return NextResponse.json(parseResult.data);
    } catch (error) {
      return NextResponse.json(
        {
          error: "api_gateway_unavailable",
          detail: error instanceof Error ? error.message : "unknown_error"
        },
        { status: 502 }
      );
    }
  }

  // Fallback: direct to script-storage with query param (demo/unauthenticated)
  // Read at request time so tests can set the env var before calling the handler.
  const defaultViewerUserId = process.env.WRITER_DEMO_USER_ID;
  const viewerUserId = url.searchParams.get("viewerUserId") ?? defaultViewerUserId;

  if (!viewerUserId) {
    return NextResponse.json(
      { error: "unauthorized", detail: "WRITER_DEMO_USER_ID is not configured" },
      { status: 401 }
    );
  }

  const upstreamUrl = new URL(
    `/internal/scripts/${encodeURIComponent(scriptId)}/view`,
    scriptStorageServiceBase
  );
  upstreamUrl.searchParams.set("viewerUserId", viewerUserId);

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    const body = await upstream.json();
    if (!upstream.ok) {
      return NextResponse.json(body, { status: upstream.status });
    }

    const parseResult = ScriptViewResponseSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "invalid_script_view_response",
          issues: parseResult.error.issues
        },
        { status: 502 }
      );
    }

    return NextResponse.json(parseResult.data);
  } catch (error) {
    return NextResponse.json(
      {
        error: "script_storage_service_unavailable",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 502 }
    );
  }
}
