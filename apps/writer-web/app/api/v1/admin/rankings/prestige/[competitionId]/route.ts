import { proxyRequest } from "../../../../_proxy";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  return proxyRequest(request, `/api/v1/admin/rankings/prestige/${encodeURIComponent(competitionId)}`);
}
