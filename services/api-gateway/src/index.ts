import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request } from "undici";
import { type GatewayContext, type RequestFn, parseAllowlist } from "./helpers.js";
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
import { registerHealthRoutes } from "./routes/health.js";

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
  industryPortalBase?: string;
  programsServiceBase?: string;
  partnerDashboardServiceBase?: string;
  competitionAdminAllowlist?: string[];
  coverageAdminAllowlist?: string[];
  industryAdminAllowlist?: string[];
};

export function buildServer(options: ApiGatewayOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  registerRequestId(server);
  void registerRateLimit(server);

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
    industryPortalBase: options.industryPortalBase ?? "http://localhost:4009",
    programsServiceBase: options.programsServiceBase ?? "http://localhost:4012",
    partnerDashboardServiceBase: options.partnerDashboardServiceBase ?? "http://localhost:4013",
    competitionAdminAllowlist: new Set(
      options.competitionAdminAllowlist ??
        parseAllowlist(process.env.COMPETITION_ADMIN_ALLOWLIST ?? "admin_01,user_admin_01")
    ),
    coverageAdminAllowlist: new Set(
      options.coverageAdminAllowlist ??
        parseAllowlist(process.env.COVERAGE_ADMIN_ALLOWLIST ?? "admin_01,user_admin_01")
    ),
    industryAdminAllowlist: new Set(
      options.industryAdminAllowlist ??
        parseAllowlist(process.env.INDUSTRY_ADMIN_ALLOWLIST ?? "admin_01,user_admin_01")
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

  return server;
}

export { buildQuerySuffix } from "./helpers.js";

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4000);
  const server = buildServer({
    identityServiceBase: process.env.IDENTITY_SERVICE_URL,
    profileServiceBase: process.env.PROFILE_SERVICE_URL,
    competitionDirectoryBase: process.env.COMPETITION_DIRECTORY_SERVICE_URL,
    submissionTrackingBase: process.env.SUBMISSION_TRACKING_SERVICE_URL,
    scriptStorageBase: process.env.SCRIPT_STORAGE_SERVICE_URL,
    feedbackExchangeBase: process.env.FEEDBACK_EXCHANGE_SERVICE_URL,
    rankingServiceBase: process.env.RANKING_SERVICE_URL,
    coverageMarketplaceBase: process.env.COVERAGE_MARKETPLACE_SERVICE_URL,
    industryPortalBase: process.env.INDUSTRY_PORTAL_SERVICE_URL,
    programsServiceBase: process.env.PROGRAMS_SERVICE_URL,
    partnerDashboardServiceBase: process.env.PARTNER_DASHBOARD_SERVICE_URL,
    competitionAdminAllowlist: parseAllowlist(process.env.COMPETITION_ADMIN_ALLOWLIST ?? ""),
    coverageAdminAllowlist: parseAllowlist(process.env.COVERAGE_ADMIN_ALLOWLIST ?? ""),
    industryAdminAllowlist: parseAllowlist(process.env.INDUSTRY_ADMIN_ALLOWLIST ?? "")
  });

  await server.listen({ port, host: "0.0.0.0" });
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
