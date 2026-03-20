import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyRequest(request, "/api/v1/admin/ip-blocks");
}

export async function POST(request: Request) {
  return proxyRequest(request, "/api/v1/admin/ip-blocks");
}
