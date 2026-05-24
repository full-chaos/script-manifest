import { proxyRequest } from "../../../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ placementId: string }> }) {
  const { placementId } = await params;
  return proxyRequest(request, `/api/v1/placements/${encodeURIComponent(placementId)}/evidence`);
}

export async function POST(request: Request, { params }: { params: Promise<{ placementId: string }> }) {
  const { placementId } = await params;
  return proxyRequest(request, `/api/v1/placements/${encodeURIComponent(placementId)}/evidence`);
}
