import assert from "node:assert/strict";
import test from "node:test";
import {
  API_BASE_URL,
  authHeaders,
  expectOkJson,
  jsonRequest,
  makeUnique,
  registerUser
} from "./helpers.js";

type UploadSessionResponse = {
  uploadUrl: string;
  uploadFields: Record<string, string>;
  objectKey: string;
};

test("compose flow: upload session -> minio upload -> register -> viewer access", async () => {
  const session = await registerUser("upload-writer");
  const scriptId = makeUnique("script");
  const fileName = "integration-upload.pdf";
  const fileContents = Buffer.from("%PDF-1.4\n% integration upload flow\n", "utf8");

  const uploadSession = await expectOkJson<UploadSessionResponse>(
    `${API_BASE_URL}/api/v1/scripts/upload-session`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(session.token)
      },
      body: JSON.stringify({
        scriptId,
        ownerUserId: session.user.id,
        filename: fileName,
        contentType: "application/pdf",
        size: fileContents.byteLength
      })
    },
    201
  );

  assert.ok(uploadSession.uploadUrl.startsWith("http://localhost:9000/"));
  assert.ok(uploadSession.objectKey.includes(scriptId));

  const uploadForm = new FormData();
  for (const [key, value] of Object.entries(uploadSession.uploadFields)) {
    uploadForm.append(key, value);
  }
  uploadForm.append(
    "file",
    new File([fileContents], fileName, { type: "application/pdf" }),
    fileName
  );

  const uploadResult = await fetch(uploadSession.uploadUrl, {
    method: "POST",
    body: uploadForm
  });
  assert.ok(uploadResult.ok, `upload failed with status ${uploadResult.status}`);

  await expectOkJson(
    `${API_BASE_URL}/api/v1/scripts/register`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(session.token)
      },
      body: JSON.stringify({
        scriptId,
        ownerUserId: session.user.id,
        objectKey: uploadSession.objectKey,
        filename: fileName,
        contentType: "application/pdf",
        size: fileContents.byteLength
      })
    },
    201
  );

  const viewResult = await jsonRequest<{
    scriptId: string;
    viewerUrl: string;
    access: { canView: boolean; isOwner: boolean };
  }>(`${API_BASE_URL}/api/v1/scripts/${encodeURIComponent(scriptId)}/view`, {
    method: "GET",
    headers: authHeaders(session.token)
  });

  assert.equal(viewResult.status, 200, viewResult.rawBody);
  assert.equal(viewResult.body.scriptId, scriptId);
  assert.equal(viewResult.body.access.canView, true);
  assert.equal(viewResult.body.access.isOwner, true);
  assert.ok(viewResult.body.viewerUrl.includes(uploadSession.objectKey));
});
