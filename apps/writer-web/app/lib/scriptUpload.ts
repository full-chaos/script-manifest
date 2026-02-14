import type { ScriptUploadSessionResponse } from "@script-manifest/contracts";

type UploadViaProxyParams = {
  session: ScriptUploadSessionResponse;
  file: File;
  headers?: HeadersInit;
};

export async function uploadScriptViaProxy(params: UploadViaProxyParams): Promise<Response> {
  const requestForm = new FormData();
  requestForm.append("uploadUrl", params.session.uploadUrl);
  requestForm.append("uploadFields", JSON.stringify(params.session.uploadFields));
  requestForm.append("file", params.file, params.file.name);

  return fetch("/api/v1/scripts/upload", {
    method: "POST",
    headers: params.headers,
    body: requestForm
  });
}
