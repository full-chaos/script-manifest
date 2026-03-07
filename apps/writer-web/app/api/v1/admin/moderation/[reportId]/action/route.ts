import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return proxyRequest(request, `/api/v1/admin/moderation/${encodeURIComponent(reportId)}/action`);
}
