import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadScriptViaProxy } from "./scriptUpload";

describe("uploadScriptViaProxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts script metadata + file to writer-web upload proxy", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadScriptViaProxy({
      scriptId: "script_01",
      ownerUserId: "writer_01",
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
    expect(body.get("scriptId")).toBe("script_01");
    expect(body.get("ownerUserId")).toBe("writer_01");
    expect(body.get("filename")).toBe("draft.pdf");
    expect(body.get("contentType")).toBe("application/pdf");
    expect(body.get("size")).toBe("4");
    const uploadedFile = body.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("draft.pdf");
  });
});
