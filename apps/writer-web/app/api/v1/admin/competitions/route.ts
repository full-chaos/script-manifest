import { proxyRequest } from "../../_proxy";

export async function POST(request: Request) {
  return proxyRequest(request, "/api/v1/admin/competitions");
}
