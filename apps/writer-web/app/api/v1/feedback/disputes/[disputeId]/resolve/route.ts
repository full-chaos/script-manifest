import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  return proxyRequest(request, `/api/v1/feedback/disputes/${disputeId}/resolve`);
}
