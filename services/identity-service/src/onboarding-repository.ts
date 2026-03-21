import { getPool } from "@script-manifest/db";

export type OnboardingProgress = {
  userId: string;
  profileCompleted: boolean;
  firstScriptUploaded: boolean;
  competitionsVisited: boolean;
  coverageVisited: boolean;
};

export interface OnboardingRepository {
  init(): Promise<void>;
  getProgress(userId: string): Promise<OnboardingProgress>;
  markStepComplete(userId: string, step: string): Promise<void>;
}

type OnboardingProgressRow = {
  user_id: string;
  profile_completed: boolean;
  first_script_uploaded: boolean;
  competitions_visited: boolean;
  coverage_visited: boolean;
};

const ALLOWED_STEPS = new Set<string>([
  "profile_completed",
  "first_script_uploaded",
  "competitions_visited",
  "coverage_visited"
]);

function mapRow(row: OnboardingProgressRow): OnboardingProgress {
  return {
    userId: row.user_id,
    profileCompleted: row.profile_completed,
    firstScriptUploaded: row.first_script_uploaded,
    competitionsVisited: row.competitions_visited,
    coverageVisited: row.coverage_visited
  };
}

export class PgOnboardingRepository implements OnboardingRepository {
  async init(): Promise<void> {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS onboarding_progress (
        user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
        first_script_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
        competitions_visited BOOLEAN NOT NULL DEFAULT FALSE,
        coverage_visited BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
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
        SELECT user_id, profile_completed, first_script_uploaded, competitions_visited, coverage_visited
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
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false
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
    } else if (step === "first_script_uploaded") {
      progress.firstScriptUploaded = true;
    } else if (step === "competitions_visited") {
      progress.competitionsVisited = true;
    } else if (step === "coverage_visited") {
      progress.coverageVisited = true;
    }
  }
}
