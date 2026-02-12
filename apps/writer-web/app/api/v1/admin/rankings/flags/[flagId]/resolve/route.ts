import { proxyRequest } from "../../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ flagId: string }> }) {
  const { flagId } = await params;
  return proxyRequest(request, `/api/v1/admin/rankings/flags/${encodeURIComponent(flagId)}/resolve`);
}
