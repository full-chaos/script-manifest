import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { randomUUID } from "node:crypto";
import { request } from "undici";
import { validateRequiredEnv, bootstrapService, setupErrorReporting, isMainModule } from "@script-manifest/service-utils";
import { type GatewayContext, type RequestFn, parseAllowlist, clearAuthCache } from "./helpers.js";
import helmet from "@fastify/helmet";
import { registerRateLimit } from "./plugins/rateLimit.js";
import { registerRequestId } from "./plugins/requestId.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerCompetitionRoutes } from "./routes/competitions.js";
import { registerSubmissionRoutes } from "./routes/submissions.js";
import { registerScriptRoutes } from "./routes/scripts.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { registerRankingRoutes } from "./routes/ranking.js";
import { registerCoverageRoutes } from "./routes/coverage.js";
import { registerIndustryRoutes } from "./routes/industry.js";
import { registerProgramsRoutes } from "./routes/programs.js";
import { registerPartnerRoutes } from "./routes/partners.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerSuspensionRoutes } from "./routes/suspension.js";
import { registerIpBlockingRoutes } from "./routes/ip-blocking.js";
import { registerNotificationAdminRoutes } from "./routes/notification-admin.js";
import { registerSearchAdminRoutes } from "./routes/search-admin.js";
import { registerFeatureFlagRoutes } from "./routes/feature-flags.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIpBlocklist } from "./plugins/ipBlocklist.js";
import { registerMetrics } from "@script-manifest/service-utils";

export type ApiGatewayOptions = {
  logger?: boolean;
  requestFn?: RequestFn;
  identityServiceBase?: string;
  profileServiceBase?: string;
  competitionDirectoryBase?: string;
  submissionTrackingBase?: string;
  scriptStorageBase?: string;
  feedbackExchangeBase?: string;
  rankingServiceBase?: string;
  coverageMarketplaceBase?: string;
  notificationServiceBase?: string;
  industryPortalBase?: string;
  programsServiceBase?: string;
  partnerDashboardServiceBase?: string;
  searchIndexerBase?: string;
  competitionAdminAllowlist?: string[];
  coverageAdminAllowlist?: string[];
  industryAdminAllowlist?: string[];
  adminAllowlist?: string[];
  redisUrl?: string;
};

export async function buildServer(options: ApiGatewayOptions = {}): Promise<FastifyInstance> {
  // Reset auth cache so each server instance starts clean (important for tests)
  clearAuthCache();

  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  registerRequestId(server);
  await server.register(cookie);
  await server.register(cors, {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    credentials: true,
  });
  // Register helmet for security headers, after CORS and before rate limiting
  await server.register(helmet, {
    contentSecurityPolicy: false,  // Disable CSP — frontend is separate origin
  });
  await server.register(swagger, {
    openapi: {
      info: {
        title: "Script Manifest API",
        version: "1.0.0",
        description: "API gateway endpoints for Script Manifest services."
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      }
    }
  });
  await server.register(swaggerUi, {
    routePrefix: "/docs"
  });
  await registerRateLimit(server, options.redisUrl);

  const ctx: GatewayContext = {
    requestFn: options.requestFn ?? request,
    identityServiceBase: options.identityServiceBase ?? "http://localhost:4005",
    profileServiceBase: options.profileServiceBase ?? "http://localhost:4001",
    competitionDirectoryBase: options.competitionDirectoryBase ?? "http://localhost:4002",
    submissionTrackingBase: options.submissionTrackingBase ?? "http://localhost:4004",
    scriptStorageBase: options.scriptStorageBase ?? "http://localhost:4011",
    feedbackExchangeBase: options.feedbackExchangeBase ?? "http://localhost:4006",
    rankingServiceBase: options.rankingServiceBase ?? "http://localhost:4007",
    coverageMarketplaceBase: options.coverageMarketplaceBase ?? "http://localhost:4008",
    notificationServiceBase: options.notificationServiceBase ?? "http://localhost:4010",
    industryPortalBase: options.industryPortalBase ?? "http://localhost:4009",
    programsServiceBase: options.programsServiceBase ?? "http://localhost:4012",
    partnerDashboardServiceBase: options.partnerDashboardServiceBase ?? "http://localhost:4013",
    searchIndexerBase: options.searchIndexerBase ?? "http://localhost:4003",
    competitionAdminAllowlist: new Set(
      options.competitionAdminAllowlist ??
        parseAllowlist(process.env.COMPETITION_ADMIN_ALLOWLIST ?? "")
    ),
    coverageAdminAllowlist: new Set(
      options.coverageAdminAllowlist ??
        parseAllowlist(process.env.COVERAGE_ADMIN_ALLOWLIST ?? "")
    ),
    industryAdminAllowlist: new Set(
      options.industryAdminAllowlist ??
        parseAllowlist(process.env.INDUSTRY_ADMIN_ALLOWLIST ?? "")
    ),
    adminAllowlist: new Set(
      options.adminAllowlist ??
        parseAllowlist(process.env.ADMIN_ALLOWLIST ?? "")
    )
  };

  registerHealthRoutes(server, ctx);

  registerAuthRoutes(server, ctx);
  registerProfileRoutes(server, ctx);
  registerProjectRoutes(server, ctx);
  registerCompetitionRoutes(server, ctx);
  registerSubmissionRoutes(server, ctx);
  registerScriptRoutes(server, ctx);
  registerExportRoutes(server, ctx);
  registerFeedbackRoutes(server, ctx);
  registerRankingRoutes(server, ctx);
  registerCoverageRoutes(server, ctx);
  registerIndustryRoutes(server, ctx);
  registerProgramsRoutes(server, ctx);
  registerPartnerRoutes(server, ctx);
  registerAdminRoutes(server, ctx);
  registerSuspensionRoutes(server, ctx);
  registerIpBlockingRoutes(server, ctx);
  registerIpBlocklist(server, ctx.requestFn, ctx.identityServiceBase);
  registerNotificationAdminRoutes(server, ctx);
  registerSearchAdminRoutes(server, ctx);
  registerFeatureFlagRoutes(server, ctx);

  return server;
}

export { buildQuerySuffix } from "./helpers.js";

export async function startServer(): Promise<void> {
  const boot = bootstrapService("api-gateway");
  setupErrorReporting("api-gateway");

  // Setup distributed tracing when OTEL_EXPORTER_OTLP_ENDPOINT is set.
  // Guard the dynamic import behind the env-var check so that the heavy
  // @opentelemetry/auto-instrumentations-node dependency tree is never
  // loaded when tracing is disabled (avoids inotify/watcher exhaustion
  // under tsx watch in Docker Compose).
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { setupTracing } = await import("@script-manifest/service-utils/tracing");
    const tracingSdk = setupTracing("api-gateway");
    if (tracingSdk) {
      process.once("SIGTERM", () => {
        tracingSdk.shutdown().catch((err) => server.log.error(err, "OTel SDK shutdown error"));
      });
    }
    boot.phase("tracing initialized");
  }

  validateRequiredEnv([
    "IDENTITY_SERVICE_URL",
    "PROFILE_SERVICE_URL",
    "COMPETITION_DIRECTORY_SERVICE_URL",
    "SUBMISSION_TRACKING_SERVICE_URL",
    "SCRIPT_STORAGE_SERVICE_URL",
    "FEEDBACK_EXCHANGE_SERVICE_URL",
    "RANKING_SERVICE_URL",
    "COVERAGE_MARKETPLACE_SERVICE_URL",
    "INDUSTRY_PORTAL_SERVICE_URL",
    "PROGRAMS_SERVICE_URL",
    "PARTNER_DASHBOARD_SERVICE_URL",
    "COMPETITION_ADMIN_ALLOWLIST",
    "COVERAGE_ADMIN_ALLOWLIST",
    "INDUSTRY_ADMIN_ALLOWLIST",
  ]);
  boot.phase("env validated");

  const port = Number(process.env.PORT ?? 4000);
  const server = await buildServer({
    identityServiceBase: process.env.IDENTITY_SERVICE_URL,
    profileServiceBase: process.env.PROFILE_SERVICE_URL,
    competitionDirectoryBase: process.env.COMPETITION_DIRECTORY_SERVICE_URL,
    submissionTrackingBase: process.env.SUBMISSION_TRACKING_SERVICE_URL,
    scriptStorageBase: process.env.SCRIPT_STORAGE_SERVICE_URL,
    feedbackExchangeBase: process.env.FEEDBACK_EXCHANGE_SERVICE_URL,
    rankingServiceBase: process.env.RANKING_SERVICE_URL,
    coverageMarketplaceBase: process.env.COVERAGE_MARKETPLACE_SERVICE_URL,
    notificationServiceBase: process.env.NOTIFICATION_SERVICE_URL,
    industryPortalBase: process.env.INDUSTRY_PORTAL_SERVICE_URL,
    programsServiceBase: process.env.PROGRAMS_SERVICE_URL,
    partnerDashboardServiceBase: process.env.PARTNER_DASHBOARD_SERVICE_URL,
    searchIndexerBase: process.env.SEARCH_INDEXER_SERVICE_URL,
    competitionAdminAllowlist: parseAllowlist(process.env.COMPETITION_ADMIN_ALLOWLIST ?? ""),
    coverageAdminAllowlist: parseAllowlist(process.env.COVERAGE_ADMIN_ALLOWLIST ?? ""),
    industryAdminAllowlist: parseAllowlist(process.env.INDUSTRY_ADMIN_ALLOWLIST ?? ""),
    adminAllowlist: parseAllowlist(process.env.ADMIN_ALLOWLIST ?? ""),
    redisUrl: process.env.REDIS_URL,
  });
  boot.phase("server built");

  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  boot.phase("metrics registered");
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
