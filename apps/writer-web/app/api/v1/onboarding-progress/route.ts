import { proxyRequest } from "../_proxy";

export async function PATCH(request: Request) {
  return proxyRequest(request, "/api/v1/onboarding/progress");
}
