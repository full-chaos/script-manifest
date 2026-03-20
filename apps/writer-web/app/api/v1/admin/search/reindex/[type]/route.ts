import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  return proxyRequest(request, `/api/v1/admin/search/reindex/${encodeURIComponent(type)}`);
}
