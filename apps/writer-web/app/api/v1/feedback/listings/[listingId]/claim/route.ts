import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return proxyRequest(request, `/api/v1/feedback/listings/${listingId}/claim`);
}
