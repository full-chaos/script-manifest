import { NextResponse } from "next/server";

export const runtime = "nodejs";

const defaultGatewayBase = "http://localhost:4000";

function getApiGatewayBase(): string {
  return process.env.API_GATEWAY_URL ?? defaultGatewayBase;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ format: string }> }
) {
  const { format } = await context.params;

  if (format !== "csv" && format !== "zip") {
    return NextResponse.json(
      { error: "invalid_format", detail: "Supported formats: csv, zip" },
      { status: 400 }
    );
  }

  const upstreamUrl = `${getApiGatewayBase()}/api/v1/export/${encodeURIComponent(format)}`;

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store"
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return new NextResponse(errorText, {
        status: upstream.status,
        headers: { "content-type": "application/json" }
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = upstream.headers.get("content-disposition");

    const responseHeaders = new Headers();
    responseHeaders.set("content-type", contentType);
    if (contentDisposition) {
      responseHeaders.set("content-disposition", contentDisposition);
    }

    // Stream the response body through without buffering
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
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
