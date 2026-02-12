import { proxyRequest } from "../../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ appealId: string }> }) {
  const { appealId } = await params;
  return proxyRequest(request, `/api/v1/admin/rankings/appeals/${encodeURIComponent(appealId)}/resolve`);
}
