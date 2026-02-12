import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return proxyRequest(request, `/api/v1/feedback/reviews/${reviewId}/dispute`);
}
