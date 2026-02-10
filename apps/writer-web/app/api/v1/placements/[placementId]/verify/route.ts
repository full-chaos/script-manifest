import { proxyRequest } from "../../../_proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ placementId: string }> }
) {
  const { placementId } = await context.params;
  return proxyRequest(request, `/api/v1/placements/${encodeURIComponent(placementId)}/verify`);
}
