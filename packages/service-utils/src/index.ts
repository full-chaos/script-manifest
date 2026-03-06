export { validateRequiredEnv, warnMissingEnv } from "./env.js";
export { registerMetrics } from "./metrics.js";
export { bootstrapService, type BootLogger } from "./boot.js";
export { setupErrorReporting } from "./errorReporting.js";
export { hasPermission, hasRole, ROLES, PERMISSIONS, type Role, type Permission } from "./rbac.js";
export { signServiceToken, verifyServiceToken, type ServiceTokenPayload } from "./jwt.js";
export { registerAuthVerification } from "./authMiddleware.js";
// setupTracing isolated to ./tracing subpath to prevent OTel auto-instrumentation from loading on every import
export { publishNotificationEvent } from "./notificationPublisher.js";
export { isMainModule } from "./isMainModule.js";
export { getAuthUserId, readHeader } from "./headerHelpers.js";
export { createFastifyServer, type CreateServerOptions } from "./server.js";
export { registerHealthRoutes, type RegisterHealthRoutesOptions, type HealthCheckResult } from "./health.js";
