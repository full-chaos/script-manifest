import Fastify from "fastify";
import {
  ScriptFileRegistrationSchema,
  ScriptRegisterRequestSchema,
  ScriptRegisterResponseSchema,
  ScriptUploadSessionRequestSchema,
  ScriptUploadSessionResponseSchema,
  ScriptViewRequestSchema,
  ScriptViewResponseSchema,
  type ScriptFileRegistration
} from "@script-manifest/contracts";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4011);
const storageBucket = process.env.STORAGE_BUCKET ?? "scripts";
const uploadBaseUrl = process.env.STORAGE_UPLOAD_BASE_URL ?? "http://localhost:9000";
const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL ?? uploadBaseUrl;

const scripts = new Map<string, ScriptFileRegistration>();

const demoScript = ScriptFileRegistrationSchema.parse({
  scriptId: "script_demo_01",
  ownerUserId: "writer_01",
  objectKey: "writer_01/script_demo_01/latest.pdf",
  filename: "demo-script.pdf",
  contentType: "application/pdf",
  size: 240_000,
  registeredAt: new Date().toISOString()
});
scripts.set(demoScript.scriptId, demoScript);

const normalizeFilename = (filename: string) =>
  filename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "script.pdf";

const toUrlPath = (bucket: string, objectKey: string) =>
  `/${bucket}/${objectKey}`.replace(/\/{2,}/g, "/");

server.get("/health", async () => ({ service: "script-storage-service", ok: true }));

server.post("/internal/scripts/upload-session", async (req, reply) => {
  const parseResult = ScriptUploadSessionRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: "invalid_upload_session_request",
      issues: parseResult.error.issues
    });
  }

  const requestData = parseResult.data;
  const objectKey = `${requestData.ownerUserId}/${requestData.scriptId}/${Date.now()}-${normalizeFilename(
    requestData.filename
  )}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const responsePayload = ScriptUploadSessionResponseSchema.parse({
    uploadUrl: `${uploadBaseUrl.replace(/\/+$/g, "")}/${storageBucket}`,
    uploadFields: {
      key: objectKey,
      bucket: storageBucket,
      "Content-Type": requestData.contentType,
      "x-mock-presign-token": "phase-1-scaffold"
    },
    bucket: storageBucket,
    objectKey,
    expiresAt
  });

  return reply.status(201).send(responsePayload);
});

server.post("/internal/scripts/register", async (req, reply) => {
  const parseResult = ScriptRegisterRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: "invalid_script_registration",
      issues: parseResult.error.issues
    });
  }

  const script = ScriptFileRegistrationSchema.parse({
    ...parseResult.data,
    registeredAt: new Date().toISOString()
  });
  scripts.set(script.scriptId, script);

  const responsePayload = ScriptRegisterResponseSchema.parse({
    registered: true,
    script
  });

  return reply.status(201).send(responsePayload);
});

server.get("/internal/scripts/:scriptId/view", async (req, reply) => {
  const { scriptId } = req.params as { scriptId: string };
  const { viewerUserId } = req.query as { viewerUserId?: string };
  const requestValidation = ScriptViewRequestSchema.safeParse({
    scriptId,
    viewerUserId
  });
  if (!requestValidation.success) {
    return reply.status(400).send({
      error: "invalid_script_view_request",
      issues: requestValidation.error.issues
    });
  }

  const script = scripts.get(scriptId);
  if (!script) {
    return reply.status(404).send({ error: "script_not_found" });
  }

  const isOwner = viewerUserId === script.ownerUserId;
  const canView = viewerUserId === undefined || isOwner;
  const viewerPath = toUrlPath(storageBucket, script.objectKey);
  const viewerUrl = new URL(viewerPath, publicBaseUrl).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const responsePayload = ScriptViewResponseSchema.parse({
    scriptId: script.scriptId,
    bucket: storageBucket,
    objectKey: script.objectKey,
    filename: script.filename,
    contentType: script.contentType,
    viewerUrl,
    viewerPath,
    expiresAt,
    access: {
      canView,
      isOwner,
      requiresRequest: !canView
    }
  });

  return reply.send(responsePayload);
});

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
