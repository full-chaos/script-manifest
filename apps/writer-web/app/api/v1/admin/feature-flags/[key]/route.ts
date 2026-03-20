import { proxyRequest } from "../../../_proxy";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  return proxyRequest(request, `/api/v1/admin/feature-flags/${encodeURIComponent(key)}`);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  return proxyRequest(request, `/api/v1/admin/feature-flags/${encodeURIComponent(key)}`);
}
