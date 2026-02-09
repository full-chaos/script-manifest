import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyRequest(request, "/api/v1/scripts/register");
}
