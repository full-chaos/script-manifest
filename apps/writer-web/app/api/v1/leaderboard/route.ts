import { proxyRequest } from "../_proxy";

export async function GET(request: Request) {
  return proxyRequest(request, "/api/v1/leaderboard");
}
