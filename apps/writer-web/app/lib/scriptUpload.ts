type UploadViaProxyParams = {
  scriptId: string;
  ownerUserId: string;
  file: File;
  contentType?: string;
  headers?: HeadersInit;
};

export type ScriptUploadProxyResponse = {
  uploaded: true;
  objectKey: string | null;
};

export async function uploadScriptViaProxy(params: UploadViaProxyParams): Promise<Response> {
  const requestForm = new FormData();
  requestForm.append("scriptId", params.scriptId);
  requestForm.append("ownerUserId", params.ownerUserId);
  requestForm.append("filename", params.file.name);
  requestForm.append("contentType", params.contentType ?? params.file.type ?? "application/octet-stream");
  requestForm.append("size", String(params.file.size));
  requestForm.append("file", params.file, params.file.name);

  return fetch("/api/v1/scripts/upload", {
    method: "POST",
    headers: params.headers,
    body: requestForm
  });
}
