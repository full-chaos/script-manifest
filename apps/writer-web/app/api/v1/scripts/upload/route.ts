import { NextResponse } from "next/server";

export const runtime = "nodejs";

type UploadFields = Record<string, string>;

function parseUploadFields(value: FormDataEntryValue | null): UploadFields | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const fields: UploadFields = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry !== "string") {
        return null;
      }
      fields[key] = entry;
    }
    return fields;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData();
  const uploadUrlValue = formData.get("uploadUrl");
  const uploadFields = parseUploadFields(formData.get("uploadFields"));
  const file = formData.get("file");

  if (typeof uploadUrlValue !== "string" || !uploadUrlValue || !uploadFields || !(file instanceof File)) {
    return NextResponse.json({ error: "invalid_upload_request" }, { status: 400 });
  }

  const upstreamBody = new FormData();
  for (const [key, value] of Object.entries(uploadFields)) {
    upstreamBody.append(key, value);
  }
  upstreamBody.append("file", file, file.name);

  try {
    const upstreamResponse = await fetch(uploadUrlValue, {
      method: "POST",
      body: upstreamBody,
      cache: "no-store"
    });

    if (!upstreamResponse.ok) {
      const detail = await upstreamResponse.text();
      return NextResponse.json(
        { error: "upload_failed", detail: detail || "storage_rejected_upload" },
        { status: upstreamResponse.status }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "upload_proxy_failed",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 502 }
    );
  }
}
