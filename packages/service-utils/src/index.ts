#YN|export { validateRequiredEnv, warnMissingEnv } from "./env.js";
#RR|export { registerMetrics } from "./metrics.js";
#NH|export { bootstrapService, type BootLogger } from "./boot.js";
#TW|export { setupErrorReporting } from "./errorReporting.js";
#RX|export { hasPermission, hasRole, ROLES, PERMISSIONS, type Role, type Permission } from "./rbac.js";
#RT|export { signServiceToken, verifyServiceToken, type ServiceTokenPayload } from "./jwt.js";
#VV|export { registerAuthVerification } from "./authMiddleware.js";
#MJ|// setupTracing isolated to ./tracing subpath to prevent OTel auto-instrumentation from loading on every import
#BJ|export { publishNotificationEvent } from "./notificationPublisher.js";
#TY|export { isMainModule } from "./isMainModule.js";
#SQ|export { getAuthUserId, readHeader } from "./headerHelpers.js";
#JK|export { createFastifyServer, type CreateServerOptions } from "./server.js";
#JQ|export { registerHealthRoutes, type RegisterHealthRoutesOptions, type HealthCheckResult } from "./health.js";
#JW|export { BaseMemoryRepository } from "./testing/BaseMemoryRepository.js";
#WB|export { getKafkaClient, _resetKafkaClient } from "./kafka.js";
