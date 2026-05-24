import { getPool, runMigrations } from "@script-manifest/db";

export type OnboardingProgress = {
  userId: string;
  profileCompleted: boolean;
  projectAdded: boolean;
  firstScriptUploaded: boolean;
  competitionsVisited: boolean;
  coverageVisited: boolean;
  submissionRecorded: boolean;
  placementRecorded: boolean;
  exportUsed: boolean;
  shareUsed: boolean;
};

export interface OnboardingRepository {
  init(): Promise<void>;
  getProgress(userId: string): Promise<OnboardingProgress>;
  markStepComplete(userId: string, step: string): Promise<void>;
}

type OnboardingProgressRow = {
  user_id: string;
  profile_completed: boolean;
  project_added: boolean;
  first_script_uploaded: boolean;
  competitions_visited: boolean;
  coverage_visited: boolean;
  submission_recorded: boolean;
  placement_recorded: boolean;
  export_used: boolean;
  share_used: boolean;
};

const ALLOWED_STEPS = new Set<string>([
  "profile_completed",
  "project_added",
  "first_script_uploaded",
  "competitions_visited",
  "coverage_visited",
  "submission_recorded",
  "placement_recorded",
  "export_used",
  "share_used"
]);

function mapRow(row: OnboardingProgressRow): OnboardingProgress {
  return {
    userId: row.user_id,
    profileCompleted: row.profile_completed,
    projectAdded: row.project_added,
    firstScriptUploaded: row.first_script_uploaded,
    competitionsVisited: row.competitions_visited,
    coverageVisited: row.coverage_visited,
    submissionRecorded: row.submission_recorded,
    placementRecorded: row.placement_recorded,
    exportUsed: row.export_used,
    shareUsed: row.share_used
  };
}

export class PgOnboardingRepository implements OnboardingRepository {
  async init(): Promise<void> {
    if (process.env.SKIP_SCHEMA_INIT === "1") {
      return;
    }
    await runMigrations(getPool());
  }

  async getProgress(userId: string): Promise<OnboardingProgress> {
    const db = getPool();
    await db.query(
      `
        INSERT INTO onboarding_progress (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );

    const result = await db.query<OnboardingProgressRow>(
      `
        SELECT user_id, profile_completed, project_added, first_script_uploaded, competitions_visited, coverage_visited, submission_recorded, placement_recorded, export_used, share_used
        FROM onboarding_progress
        WHERE user_id = $1
      `,
      [userId]
    );

    return mapRow(result.rows[0]!);
  }

  async markStepComplete(userId: string, step: string): Promise<void> {
    if (!ALLOWED_STEPS.has(step)) {
      throw new Error("invalid_onboarding_step");
    }

    const db = getPool();
    await db.query(
      `
        INSERT INTO onboarding_progress (user_id, ${step})
        VALUES ($1, TRUE)
        ON CONFLICT (user_id) DO UPDATE
        SET ${step} = TRUE, updated_at = NOW()
      `,
      [userId]
    );
  }
}

export class MemoryOnboardingRepository implements OnboardingRepository {
  private progressByUserId = new Map<string, OnboardingProgress>();

  async init(): Promise<void> {
  }

  async getProgress(userId: string): Promise<OnboardingProgress> {
    const existing = this.progressByUserId.get(userId);
    if (existing) {
      return existing;
    }

    const created: OnboardingProgress = {
      userId,
      profileCompleted: false,
      projectAdded: false,
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false,
      submissionRecorded: false,
      placementRecorded: false,
      exportUsed: false,
      shareUsed: false
    };
    this.progressByUserId.set(userId, created);
    return created;
  }

  async markStepComplete(userId: string, step: string): Promise<void> {
    if (!ALLOWED_STEPS.has(step)) {
      throw new Error("invalid_onboarding_step");
    }

    const progress = await this.getProgress(userId);
    if (step === "profile_completed") {
      progress.profileCompleted = true;
    } else if (step === "project_added") {
      progress.projectAdded = true;
    } else if (step === "first_script_uploaded") {
      progress.firstScriptUploaded = true;
    } else if (step === "competitions_visited") {
      progress.competitionsVisited = true;
    } else if (step === "coverage_visited") {
      progress.coverageVisited = true;
    } else if (step === "submission_recorded") {
      progress.submissionRecorded = true;
    } else if (step === "placement_recorded") {
      progress.placementRecorded = true;
    } else if (step === "export_used") {
      progress.exportUsed = true;
    } else if (step === "share_used") {
      progress.shareUsed = true;
    }
  }
}
