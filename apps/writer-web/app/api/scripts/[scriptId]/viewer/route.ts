import { ScriptViewResponseSchema } from "@script-manifest/contracts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const scriptStorageServiceBase =
  process.env.SCRIPT_STORAGE_SERVICE_URL ?? "http://localhost:4011";
const defaultViewerUserId = process.env.WRITER_DEMO_USER_ID ?? "writer_01";

export async function GET(
  request: Request,
  context: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await context.params;
  const url = new URL(request.url);
  const viewerUserId = url.searchParams.get("viewerUserId") ?? defaultViewerUserId;
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
