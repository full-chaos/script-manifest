import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("scripts upload route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SCRIPT_UPLOAD_INTERNAL_BASE_URL;
    delete process.env.STORAGE_UPLOAD_BASE_URL;
  });

  it("requires authentication", async () => {
    const requestForm = new FormData();
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm,
      headers: new Headers()
    } as Request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("rejects files exceeding size limit", async () => {
    const largeFile = new File(
      [new ArrayBuffer(51 * 1024 * 1024)],
      "large.pdf",
      { type: "application/pdf" }
    );
    const requestForm = new FormData();
    requestForm.append("file", largeFile);

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "file_too_large" });
  });

  it("validates uploadUrl against SSRF attacks", async () => {
    const requestForm = new FormData();
    requestForm.append("uploadUrl", "http://internal-service:8080/admin");
    requestForm.append("uploadFields", JSON.stringify({ key: "test" }));
    requestForm.append("objectKey", "test/key");
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    process.env.STORAGE_UPLOAD_BASE_URL = "http://localhost:9000";

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_upload_url",
      detail: "url_not_allowed"
    });
  });

  it("accepts uploadUrl from allowed endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const requestForm = new FormData();
    requestForm.append("uploadUrl", "http://localhost:9000/scripts");
    requestForm.append(
      "uploadFields",
      JSON.stringify({
        key: "writer_01/script_allowed/latest.pdf",
        bucket: "scripts",
        "Content-Type": "application/pdf"
      })
    );
    requestForm.append("objectKey", "writer_01/script_allowed/latest.pdf");
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    process.env.STORAGE_UPLOAD_BASE_URL = "http://localhost:9000";

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

    expect(response.status).toBe(201);
  });

  it("sanitizes error messages on upstream failure", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(
      new Error("Internal network error: Cannot connect to 192.168.1.100")
    );
    vi.stubGlobal("fetch", fetchMock);

    const requestForm = new FormData();
    requestForm.append("uploadUrl", "http://localhost:9000/scripts");
    requestForm.append(
      "uploadFields",
      JSON.stringify({
        key: "test/key",
        bucket: "scripts",
        "Content-Type": "application/pdf"
      })
    );
    requestForm.append("objectKey", "test/key");
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    process.env.STORAGE_UPLOAD_BASE_URL = "http://localhost:9000";

    const response = await POST({
      url: "http://localhost/api/v1/scripts/upload",
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toBe("upload_proxy_failed");
    expect(json.detail).toBe("upstream_request_failed");
    // Should NOT contain internal network details
    expect(json.detail).not.toContain("192.168.1.100");
    expect(json.detail).not.toContain("Internal network error");
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

    process.env.SCRIPT_UPLOAD_INTERNAL_BASE_URL = "http://minio:9000";
    process.env.STORAGE_UPLOAD_BASE_URL = "http://localhost:9000";

    const response = await POST({
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

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
      formData: async () => requestForm,
      headers: new Headers({ authorization: "Bearer token" })
    } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_upload_request" });
  });
});
