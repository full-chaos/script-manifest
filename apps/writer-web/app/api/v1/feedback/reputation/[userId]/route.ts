import { proxyRequest } from "../../../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return proxyRequest(request, `/api/v1/feedback/reputation/${userId}`);
}
