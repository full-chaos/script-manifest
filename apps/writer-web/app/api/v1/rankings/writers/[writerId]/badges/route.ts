import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ writerId: string }> }) {
  const { writerId } = await params;
  return proxyRequest(request, `/api/v1/rankings/writers/${encodeURIComponent(writerId)}/badges`);
}
