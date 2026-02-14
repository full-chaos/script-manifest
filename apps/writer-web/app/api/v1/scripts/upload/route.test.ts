import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("scripts upload route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts uploaded file to storage server-side", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const requestForm = new FormData();
    requestForm.append("uploadUrl", "http://minio:9000/scripts");
    requestForm.append(
      "uploadFields",
      JSON.stringify({
        key: "writer_01/script_01/latest.pdf",
        bucket: "scripts",
        "Content-Type": "application/pdf"
      })
    );
    requestForm.append("file", new File(["INT. OFFICE - DAY"], "draft.pdf", { type: "application/pdf" }));

    const response = await POST({ formData: async () => requestForm } as Request);

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://minio:9000/scripts",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );

    const upstreamRequest = fetchMock.mock.calls[0]?.[1];
    const upstreamBody = upstreamRequest?.body as FormData;
    expect(upstreamBody.get("key")).toBe("writer_01/script_01/latest.pdf");
    expect(upstreamBody.get("bucket")).toBe("scripts");
    expect(upstreamBody.get("Content-Type")).toBe("application/pdf");
    const uploadedFile = upstreamBody.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("draft.pdf");
  });

  it("returns 400 for malformed payload", async () => {
    const requestForm = new FormData();
    requestForm.append("uploadUrl", "http://minio:9000/scripts");
    requestForm.append("uploadFields", "{");
    requestForm.append("file", new File([""], "draft.pdf", { type: "application/pdf" }));

    const response = await POST({ formData: async () => requestForm } as Request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_upload_request" });
  });
});
