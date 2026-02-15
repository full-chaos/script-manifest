import Fastify, { type FastifyInstance } from "fastify";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  ScriptFileRegistrationSchema,
  ScriptRegisterRequestSchema,
  ScriptRegisterResponseSchema,
  ScriptUploadSessionRequestSchema,
  ScriptUploadSessionResponseSchema,
  ScriptViewRequestSchema,
  ScriptViewResponseSchema,
  ScriptVisibilitySchema,
  type ScriptFileRegistration,
  type ScriptVisibility
} from "@script-manifest/contracts";

type ScriptRecord = ScriptFileRegistration & {
  visibility: ScriptVisibility;
  approvedViewers: Set<string>;
};

export type ScriptStorageServiceOptions = {
  logger?: boolean;
  storageBucket?: string;
  uploadBaseUrl?: string;
  publicBaseUrl?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3ForcePathStyle?: boolean;
};

export function buildServer(options: ScriptStorageServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const storageBucket = options.storageBucket ?? "scripts";
  const uploadBaseUrl = options.uploadBaseUrl ?? options.publicBaseUrl ?? "http://localhost:9000";
  const publicBaseUrl = options.publicBaseUrl ?? uploadBaseUrl;
  const s3Client = buildS3Client({
    endpoint: options.s3Endpoint,
    region: options.s3Region,
    accessKeyId: options.s3AccessKeyId,
    secretAccessKey: options.s3SecretAccessKey,
    forcePathStyle: options.s3ForcePathStyle
  });

  // Initialize bucket once at server startup to prevent race conditions
  let bucketReady: Promise<void> | null = null;
  if (s3Client) {
    bucketReady = ensureBucket(s3Client, storageBucket).catch((error) => {
      server.log.error({ error, storageBucket }, "failed to initialize bucket");
      // Return a rejected promise that will be checked in upload-session route
      return Promise.reject(error);
    });
  }

  const scripts = new Map<string, ScriptRecord>();

  const demoRegistration = ScriptFileRegistrationSchema.parse({
    scriptId: "script_demo_01",
    ownerUserId: "writer_01",
    objectKey: "writer_01/script_demo_01/latest.pdf",
    filename: "demo-script.pdf",
    contentType: "application/pdf",
    size: 240_000,
    registeredAt: new Date().toISOString()
  });
  const demoScript: ScriptRecord = {
    ...demoRegistration,
    visibility: "private",
    approvedViewers: new Set()
  };
  scripts.set(demoScript.scriptId, demoScript);

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {
      storage: Boolean(storageBucket)
    };
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "script-storage-service", ok, checks });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, boolean> = {
      storage: Boolean(storageBucket)
    };
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "script-storage-service", ok, checks });
  });

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

    let uploadUrl = `${uploadBaseUrl.replace(/\/+$/g, "")}/${storageBucket}`;
    let uploadFields: Record<string, string> = {
      key: objectKey,
      bucket: storageBucket,
      "Content-Type": requestData.contentType,
      "x-mock-presign-token": "phase-1-scaffold"
    };

    if (s3Client && bucketReady) {
      try {
        // Wait for bucket to be ready
        await bucketReady;

        const presignedPost = await createPresignedPost(s3Client, {
          Bucket: storageBucket,
          Key: objectKey,
          Expires: 15 * 60,
          Fields: {
            "Content-Type": requestData.contentType
          },
          Conditions: [
            ["eq", "$Content-Type", requestData.contentType]
          ]
        });

        uploadUrl = rewriteUploadUrlForClient(presignedPost.url, uploadBaseUrl);
        uploadFields = presignedPost.fields;
      } catch (error) {
        req.log.error(
          { error, storageBucket, objectKey },
          "failed to generate presigned upload session"
        );
        // Return error instead of silently falling back to mock credentials
        return reply.status(503).send({
          error: "upload_session_unavailable",
          detail: "storage_service_unavailable"
        });
      }
    }

    const responsePayload = ScriptUploadSessionResponseSchema.parse({
      uploadUrl,
      uploadFields,
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

    const registration = ScriptFileRegistrationSchema.parse({
      ...parseResult.data,
      registeredAt: new Date().toISOString()
    });
    const script: ScriptRecord = {
      ...registration,
      visibility: "private",
      approvedViewers: new Set()
    };
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

    const isOwner = viewerUserId !== undefined && viewerUserId === script.ownerUserId;
    let canView: boolean;
    if (script.visibility === "public") {
      canView = true;
    } else if (script.visibility === "approved_only") {
      canView = isOwner || (viewerUserId !== undefined && script.approvedViewers.has(viewerUserId));
    } else {
      // "private" — only owner
      canView = isOwner;
    }
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

  server.post("/internal/scripts/:scriptId/approve-viewer", async (req, reply) => {
    const { scriptId } = req.params as { scriptId: string };
    const ownerUserId = req.headers["x-auth-user-id"] as string | undefined;
    const body = req.body as { viewerUserId?: string };

    if (!ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const script = scripts.get(scriptId);
    if (!script) {
      return reply.status(404).send({ error: "script_not_found" });
    }

    if (ownerUserId !== script.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    if (!body.viewerUserId || typeof body.viewerUserId !== "string") {
      return reply.status(400).send({ error: "missing_viewer_user_id" });
    }

    script.approvedViewers.add(body.viewerUserId);

    if (script.visibility === "private") {
      script.visibility = "approved_only";
    }

    return reply.send({ scriptId, viewerUserId: body.viewerUserId, approved: true });
  });

  server.patch("/internal/scripts/:scriptId/visibility", async (req, reply) => {
    const { scriptId } = req.params as { scriptId: string };
    const body = req.body as { visibility?: string; ownerUserId?: string };
    const ownerUserId = body.ownerUserId ?? (req.headers["x-auth-user-id"] as string | undefined);

    const script = scripts.get(scriptId);
    if (!script) {
      return reply.status(404).send({ error: "script_not_found" });
    }

    if (!ownerUserId || ownerUserId !== script.ownerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ScriptVisibilitySchema.safeParse(body.visibility);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_visibility",
        issues: parsed.error.issues
      });
    }

    script.visibility = parsed.data;
    return reply.send({ scriptId, visibility: script.visibility });
  });

  return server;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4011);
  const server = buildServer({
    storageBucket: process.env.STORAGE_BUCKET,
    uploadBaseUrl: process.env.STORAGE_UPLOAD_BASE_URL,
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
    s3Endpoint: process.env.STORAGE_S3_ENDPOINT,
    s3Region: process.env.STORAGE_S3_REGION,
    s3AccessKeyId: process.env.STORAGE_S3_ACCESS_KEY,
    s3SecretAccessKey: process.env.STORAGE_S3_SECRET_KEY,
    s3ForcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE !== "false"
  });

  await server.listen({ port, host: "0.0.0.0" });
}

function normalizeFilename(filename: string): string {
  return (
    filename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "script.pdf"
  );
}

function buildS3Client(options: {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}): S3Client | null {
  if (!options.endpoint || !options.accessKeyId || !options.secretAccessKey) {
    return null;
  }

  return new S3Client({
    endpoint: options.endpoint,
    region: options.region ?? "us-east-1",
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey
    },
    forcePathStyle: options.forcePathStyle ?? true
  });
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    if (!isMissingBucketError(error)) {
      throw error;
    }
  }

  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

function isMissingBucketError(error: unknown): boolean {
  const unknownError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  const code = unknownError.$metadata?.httpStatusCode;
  return (
    code === 404 ||
    unknownError.name === "NotFound" ||
    unknownError.name === "NoSuchBucket"
  );
}

function rewriteUploadUrlForClient(sourceUrl: string, publicBaseUrl: string): string {
  const signed = new URL(sourceUrl);
  const base = new URL(publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`);
  
  // Start from the base URL and append the signed path, preserving query and hash
  const result = new URL(base.toString());
  const strippedPath = signed.pathname.replace(/^\/+/, "");
  
  // Ensure we join base pathname and strippedPath with a single slash
  if (result.pathname.endsWith("/")) {
    result.pathname = `${result.pathname}${strippedPath}`;
  } else {
    result.pathname = `${result.pathname}/${strippedPath}`;
  }
  
  // Preserve original query parameters and hash fragment
  result.search = signed.search;
  result.hash = signed.hash;
  
  return result.toString();
}

function toUrlPath(bucket: string, objectKey: string): string {
  return `/${bucket}/${objectKey}`.replace(/\/{2,}/g, "/");
}

function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return metaUrl === pathToFileURL(process.argv[1]).href;
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
