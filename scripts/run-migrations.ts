import { closePool, getPool } from "../packages/db/src/index.js";
import { runMigrations } from "../packages/db/src/migrate.js";
import { PgIdentityRepository } from "../services/identity-service/src/repository.js";
import { PgAdminRepository } from "../services/identity-service/src/admin-repository.js";
import { PgMfaRepository } from "../services/identity-service/src/mfa-repository.js";
import { PgOnboardingRepository } from "../services/identity-service/src/onboarding-repository.js";
import { PgProfileProjectRepository } from "../services/profile-project-service/src/repository.js";
import { PgCompetitionDirectoryRepository } from "../services/competition-directory-service/src/pgRepository.js";
import { PgSubmissionTrackingRepository } from "../services/submission-tracking-service/src/pgRepository.js";
import { PgFeedbackExchangeRepository } from "../services/feedback-exchange-service/src/repository.js";
import { PgNotificationRepository } from "../services/notification-service/src/pgRepository.js";
import { PgCoverageMarketplaceRepository } from "../services/coverage-marketplace-service/src/pgRepository.js";
import { PgIndustryPortalRepository } from "../services/industry-portal-service/src/repository.js";
import { PgProgramsRepository } from "../services/programs-service/src/repository.js";
import { PgPartnerDashboardRepository } from "../services/partner-dashboard-service/src/repository.js";
import { PgRankingRepository } from "../services/ranking-service/src/repository.js";
import { PgScriptStorageRepository } from "../services/script-storage-service/src/repository.js";

type Migrator = {
  name: string;
  init: () => Promise<void>;
};

async function main(): Promise<void> {
  const migrators: Migrator[] = [
    { name: "base SQL migrations", init: () => runMigrations(getPool()) },
    { name: "identity core", init: () => new PgIdentityRepository().init() },
    { name: "identity admin", init: () => new PgAdminRepository().init() },
    { name: "identity mfa", init: () => new PgMfaRepository().init() },
    { name: "identity onboarding", init: () => new PgOnboardingRepository().init() },
    { name: "profile projects", init: () => new PgProfileProjectRepository().init() },
    { name: "competition directory", init: () => new PgCompetitionDirectoryRepository().init() },
    { name: "submission tracking", init: () => new PgSubmissionTrackingRepository().init() },
    { name: "feedback exchange", init: () => new PgFeedbackExchangeRepository().init() },
    { name: "notifications", init: () => new PgNotificationRepository().init() },
    { name: "ranking", init: () => new PgRankingRepository().init() },
    { name: "coverage marketplace", init: () => new PgCoverageMarketplaceRepository().init() },
    { name: "industry portal", init: () => new PgIndustryPortalRepository().init() },
    { name: "programs", init: () => new PgProgramsRepository().init() },
    { name: "partner dashboard", init: () => new PgPartnerDashboardRepository().init() },
    { name: "script storage", init: () => new PgScriptStorageRepository().init() }
  ];

  for (const migrator of migrators) {
    process.stdout.write(`Running schema init: ${migrator.name}\n`);
    await migrator.init();
  }

  process.stdout.write("Schema init completed successfully.\n");
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
