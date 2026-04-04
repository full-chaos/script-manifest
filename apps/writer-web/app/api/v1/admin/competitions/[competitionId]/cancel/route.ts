import { proxyRequest } from "../../../../_proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ competitionId: string }> }
) {
  const { competitionId } = await context.params;
  return proxyRequest(request, `/api/v1/admin/competitions/${encodeURIComponent(competitionId)}/cancel`);
}
