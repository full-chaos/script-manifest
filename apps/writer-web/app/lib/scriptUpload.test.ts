import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScriptUploadSessionResponse } from "@script-manifest/contracts";
import { uploadScriptViaProxy } from "./scriptUpload";

describe("uploadScriptViaProxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts upload session metadata + file to writer-web upload proxy", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const session: ScriptUploadSessionResponse = {
      uploadUrl: "http://minio:9000/scripts",
      uploadFields: {
        key: "writer_01/script_01/file.pdf",
        bucket: "scripts",
        "Content-Type": "application/pdf"
      },
      bucket: "scripts",
      objectKey: "writer_01/script_01/file.pdf",
      expiresAt: "2026-02-14T00:00:00.000Z"
    };

    await uploadScriptViaProxy({
      session,
      file: new File(["body"], "draft.pdf", { type: "application/pdf" }),
      headers: { authorization: "Bearer token" }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/scripts/upload",
      expect.objectContaining({ method: "POST", headers: { authorization: "Bearer token" }, body: expect.any(FormData) })
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as FormData;
    expect(body.get("uploadUrl")).toBe("http://minio:9000/scripts");
    expect(body.get("uploadFields")).toBe(JSON.stringify(session.uploadFields));
    const uploadedFile = body.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("draft.pdf");
  });
});
