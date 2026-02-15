import { NextResponse } from "next/server";
import type { ScriptUploadSessionResponse } from "@script-manifest/contracts";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

type UploadFields = Record<string, string>;
type UploadSessionRequestPayload = {
  scriptId: string;
  ownerUserId: string;
  filename: string;
  contentType: string;
  size: number;
};

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

function normalizeTextField(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseUploadSessionRequest(formData: FormData, file: File): UploadSessionRequestPayload | null {
  const scriptId = normalizeTextField(formData.get("scriptId"));
  const ownerUserId = normalizeTextField(formData.get("ownerUserId"));

  if (!scriptId || !ownerUserId) {
    return null;
  }

  const filename = normalizeTextField(formData.get("filename")) ?? file.name;
  const contentType = normalizeTextField(formData.get("contentType")) ?? file.type ?? "application/octet-stream";
  const sizeField = normalizeTextField(formData.get("size"));
  const size = sizeField ? Number(sizeField) : file.size;

  if (!Number.isFinite(size) || size < 0) {
    return null;
  }

  return {
    scriptId,
    ownerUserId,
    filename,
    contentType,
    size
  };
}

function isAllowedUploadUrl(uploadUrl: string): boolean {
  const allowedBase = process.env.STORAGE_UPLOAD_BASE_URL ?? "http://localhost:9000";
  const internalBase = process.env.SCRIPT_UPLOAD_INTERNAL_BASE_URL;
  
  try {
    const url = new URL(uploadUrl);
    const allowed = new URL(allowedBase);
    const internal = internalBase ? new URL(internalBase) : null;
    
    // Check if the URL matches either the allowed base or the internal base
    const matchesAllowed = url.origin === allowed.origin;
    const matchesInternal = internal ? url.origin === internal.origin : false;
    
    return matchesAllowed || matchesInternal;
  } catch {
    return false;
  }
}

function resolveServerUploadUrl(uploadUrl: string): string {
  const internalBase = process.env.SCRIPT_UPLOAD_INTERNAL_BASE_URL;
  if (!internalBase) {
    return uploadUrl;
  }

  const source = new URL(uploadUrl);
  const base = new URL(internalBase.endsWith("/") ? internalBase : `${internalBase}/`);
  return new URL(`${source.pathname.replace(/^\/+/g, "")}${source.search}`, base).toString();
}

function authHeadersForSessionRequest(request: Request): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return headers;
}

async function createUploadSession(
  request: Request,
  payload: UploadSessionRequestPayload
): Promise<{ session: ScriptUploadSessionResponse } | { errorResponse: NextResponse }> {
  const sessionResponse = await fetch(new URL("/api/v1/scripts/upload-session", request.url), {
    method: "POST",
    headers: authHeadersForSessionRequest(request),
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const sessionBody = (await sessionResponse.json()) as ScriptUploadSessionResponse | { error?: string };
  if (!sessionResponse.ok) {
    return {
      errorResponse: NextResponse.json(
        {
          error: "upload_session_failed",
          detail: "error" in sessionBody && sessionBody.error ? sessionBody.error : "unable_to_create_upload_session"
        },
        { status: sessionResponse.status }
      )
    };
  }

  return { session: sessionBody as ScriptUploadSessionResponse };
}

export async function POST(request: Request): Promise<NextResponse> {
  // Require authentication
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_upload_request" }, { status: 400 });
  }

  // Validate file size to prevent resource exhaustion
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", detail: "max_50mb" },
      { status: 413 }
    );
  }

  let uploadUrlValue = normalizeTextField(formData.get("uploadUrl"));
  let uploadFields = parseUploadFields(formData.get("uploadFields"));
  let objectKey = normalizeTextField(formData.get("objectKey"));

  if (!uploadUrlValue || !uploadFields) {
    const uploadSessionPayload = parseUploadSessionRequest(formData, file);
    if (!uploadSessionPayload) {
      return NextResponse.json({ error: "invalid_upload_request" }, { status: 400 });
    }

    const sessionResult = await createUploadSession(request, uploadSessionPayload);
    if ("errorResponse" in sessionResult) {
      return sessionResult.errorResponse;
    }

    uploadUrlValue = sessionResult.session.uploadUrl;
    uploadFields = sessionResult.session.uploadFields;
    objectKey = sessionResult.session.objectKey;
  }

  // SSRF protection: validate uploadUrl is from allowed endpoint
  if (!isAllowedUploadUrl(uploadUrlValue)) {
    return NextResponse.json(
      { error: "invalid_upload_url", detail: "url_not_allowed" },
      { status: 400 }
    );
  }

  const resolvedUploadUrl = resolveServerUploadUrl(uploadUrlValue);
  const upstreamBody = new FormData();
  for (const [key, value] of Object.entries(uploadFields)) {
    upstreamBody.append(key, value.trim());
  }
  upstreamBody.append("file", file, file.name);

  try {
    const upstreamResponse = await fetch(resolvedUploadUrl, {
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

    return NextResponse.json(
      {
        uploaded: true,
        objectKey
      },
      { status: 201 }
    );
  } catch (error) {
    // Log full error details server-side for debugging without exposing them to clients
    console.error("Upload proxy failed:", error);
    return NextResponse.json(
      {
        error: "upload_proxy_failed",
        detail: "upstream_request_failed"
      },
      { status: 502 }
    );
  }
}
