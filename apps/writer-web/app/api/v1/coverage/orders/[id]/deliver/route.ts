import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(request, `/api/v1/coverage/orders/${id}/deliver`);
}
