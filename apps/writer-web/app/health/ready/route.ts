import { NextResponse } from "next/server";

const defaultGatewayBase = "http://localhost:4000";

export async function GET() {
  const gatewayUrl = process.env.API_GATEWAY_URL ?? defaultGatewayBase;

  try {
    const response = await fetch(new URL("/health/live", gatewayUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, detail: "api-gateway unhealthy" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, detail: "api-gateway unreachable" },
      { status: 503 }
    );
  }
}
