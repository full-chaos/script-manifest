import { proxyRequest } from "../../../_proxy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ competitionId: string }> }
) {
  const { competitionId } = await context.params;
  return proxyRequest(
    request,
    `/api/v1/competitions/${encodeURIComponent(competitionId)}/deadline-reminders`
  );
}
