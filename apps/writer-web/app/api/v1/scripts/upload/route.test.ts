import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("scripts upload route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SCRIPT_UPLOAD_INTERNAL_BASE_URL;
  });

  it("creates upload session server-side and uploads to storage", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === "http://localhost/api/v1/scripts/upload-session") {
        return new Response(
          JSON.stringify({
            uploadUrl: "http://localhost:9000/scripts",
            uploadFields: {
              key: "writer_01/script_01/latest.pdf",
              bucket: "scripts",
              "Content-Type": "application/pdf",
              "X-Amz-Credential": "manifest/20260214/us-east-1/s3/aws4_request"
            },
            bucket: "scripts",
            objectKey: "writer_01/script_01/latest.pdf",
            expiresAt: "2026-02-14T00:10:00.000Z"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.SCRIPT_UPLOAD_INTERNAL_BASE_URL = "http://minio:9000";

    const requestForm = new FormData();
    requestForm.append("scriptId", "script_01");
    requestForm.append("ownerUserId", "writer_01");
    requestForm.append("filename", "draft.pdf");
    requestForm.append("contentType", "application/pdf");
    requestForm.append("size", "22");
    requestForm.append("file", new File(["INT. OFFICE - DAY"], "draft.pdf", { type: "application/pdf" }));

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      uploaded: true,
      objectKey: "writer_01/script_01/latest.pdf"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://localhost/api/v1/scripts/upload-session");
    const sessionRequest = fetchMock.mock.calls[0]?.[1];
    expect(sessionRequest?.method).toBe("POST");
    expect(sessionRequest?.body).toBe(
      JSON.stringify({
        scriptId: "script_01",
        ownerUserId: "writer_01",
        filename: "draft.pdf",
        contentType: "application/pdf",
        size: 22
      })
    );
    const sessionHeaders = sessionRequest?.headers as Headers;
    expect(sessionHeaders.get("authorization")).toBe("Bearer token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://minio:9000/scripts",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );

    const upstreamRequest = fetchMock.mock.calls[1]?.[1];
    const upstreamBody = upstreamRequest?.body as FormData;
    expect(upstreamBody.get("key")).toBe("writer_01/script_01/latest.pdf");
    expect(upstreamBody.get("bucket")).toBe("scripts");
    expect(upstreamBody.get("Content-Type")).toBe("application/pdf");
    expect(upstreamBody.get("X-Amz-Credential")).toBe("manifest/20260214/us-east-1/s3/aws4_request");
    const uploadedFile = upstreamBody.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("draft.pdf");
  });

  it("supports legacy uploadUrl/uploadFields payload", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const requestForm = new FormData();
    requestForm.append("uploadUrl", "http://minio:9000/scripts");
    requestForm.append(
      "uploadFields",
      JSON.stringify({
        key: "writer_01/script_legacy/latest.pdf",
        bucket: "scripts",
        "Content-Type": "application/pdf"
      })
    );
    requestForm.append("objectKey", "writer_01/script_legacy/latest.pdf");
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    const response = await POST({ formData: async () => requestForm } as Request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      uploaded: true,
      objectKey: "writer_01/script_legacy/latest.pdf"
    });
  });

  it("returns 400 for malformed payload", async () => {
    const requestForm = new FormData();
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_upload_request" });
  });
});
