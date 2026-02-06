import { proxyRequest } from "../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyRequest(request, "/api/v1/projects");
}

export async function POST(request: Request) {
  return proxyRequest(request, "/api/v1/projects");
}
