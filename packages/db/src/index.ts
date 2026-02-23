import { Pool } from "pg";

const DEFAULT_DATABASE_URL = "postgresql://manifest:manifest@localhost:5432/manifest";

const pools = new Map<string, Pool>();

export function getPool(databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): Pool {
  if (!pools.has(databaseUrl)) {
    pools.set(databaseUrl, new Pool({ connectionString: databaseUrl }));
  }

  return pools.get(databaseUrl)!;
}

export async function closePool(databaseUrl?: string): Promise<void> {
  if (databaseUrl) {
    const pool = pools.get(databaseUrl);
    if (pool) {
      await pool.end();
      pools.delete(databaseUrl);
    }
  } else {
    // Close all pools if no specific URL provided
    await Promise.all(
      Array.from(pools.values()).map((pool) => pool.end())
    );
    pools.clear();
  }
}

export async function ensureCoreTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'writer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backfill role column for databases created before admin roles existed.
  await db.query(`
    ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'writer';
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS writer_profiles (
      writer_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      bio VARCHAR(5000) NOT NULL DEFAULT '',
      genres TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      demographics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      representation_status TEXT NOT NULL DEFAULT 'unrepresented',
      headshot_url VARCHAR(2048) NOT NULL DEFAULT '',
      custom_profile_url VARCHAR(2048) NOT NULL DEFAULT '',
      is_searchable BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backfill profile table columns for databases created before rich profile fields existed.
  await db.query(`
    ALTER TABLE writer_profiles
    ADD COLUMN IF NOT EXISTS demographics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS headshot_url VARCHAR(2048) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS custom_profile_url VARCHAR(2048) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      logline VARCHAR(500) NOT NULL DEFAULT '',
      synopsis VARCHAR(5000) NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      genre TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS project_co_writers (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      co_writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      credit_order INTEGER NOT NULL DEFAULT 1 CHECK (credit_order > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, co_writer_user_id),
      CHECK (owner_user_id <> co_writer_user_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS project_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      script_id TEXT NOT NULL,
      version_label TEXT NOT NULL,
      change_summary VARCHAR(4000) NOT NULL DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
      lifecycle_state TEXT NOT NULL DEFAULT 'active'
        CHECK (lifecycle_state IN ('active', 'archived')),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS script_access_requests (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      requester_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reason VARCHAR(500) NOT NULL DEFAULT '',
      decision_reason VARCHAR(500) NULL,
      decided_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_drafts_primary
      ON project_drafts(project_id)
      WHERE is_primary = TRUE;
  `);

  // Add indexes for foreign keys and common queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_projects_owner_user_id
      ON projects(owner_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_project_drafts_project_id
      ON project_drafts(project_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_project_co_writers_co_writer_user_id
      ON project_co_writers(co_writer_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_script_access_requests_script_id
      ON script_access_requests(script_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_script_access_requests_owner_user_id
      ON script_access_requests(owner_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_script_access_requests_requester_user_id
      ON script_access_requests(requester_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id
      ON app_sessions(user_id);
  `);
}

export async function ensureFeedbackExchangeTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS token_ledger (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      debit_user_id TEXT NOT NULL,
      credit_user_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL,
      reference_type TEXT NOT NULL DEFAULT '',
      reference_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_token_ledger_debit_user ON token_ledger(debit_user_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_token_ledger_credit_user ON token_ledger(credit_user_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feedback_listings (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      script_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL,
      format TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'claimed', 'completed', 'expired', 'cancelled')),
      claimed_by_user_id TEXT,
      review_deadline TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_feedback_listings_owner ON feedback_listings(owner_user_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_feedback_listings_status ON feedback_listings(status);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feedback_reviews (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES feedback_listings(id) ON DELETE CASCADE,
      reviewer_user_id TEXT NOT NULL,
      score_story_structure INTEGER CHECK (score_story_structure BETWEEN 1 AND 5),
      comment_story_structure TEXT,
      score_characters INTEGER CHECK (score_characters BETWEEN 1 AND 5),
      comment_characters TEXT,
      score_dialogue INTEGER CHECK (score_dialogue BETWEEN 1 AND 5),
      comment_dialogue TEXT,
      score_craft_voice INTEGER CHECK (score_craft_voice BETWEEN 1 AND 5),
      comment_craft_voice TEXT,
      overall_comment TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted', 'accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_feedback_reviews_listing ON feedback_reviews(listing_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS reviewer_ratings (
      id TEXT PRIMARY KEY,
      review_id TEXT UNIQUE NOT NULL REFERENCES feedback_reviews(id) ON DELETE CASCADE,
      rater_user_id TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS reviewer_strikes (
      id TEXT PRIMARY KEY,
      reviewer_user_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_reviewer_strikes_user ON reviewer_strikes(reviewer_user_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS reviewer_suspensions (
      id TEXT PRIMARY KEY,
      reviewer_user_id TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      lifted_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_reviewer_suspensions_user ON reviewer_suspensions(reviewer_user_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feedback_disputes (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES feedback_reviews(id) ON DELETE CASCADE,
      filed_by_user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_for_filer', 'resolved_for_reviewer', 'dismissed')),
      resolution_note TEXT,
      resolved_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_feedback_disputes_review ON feedback_disputes(review_id);
  `);
}

export async function ensureIndustryPortalTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      role_title TEXT NOT NULL,
      professional_email TEXT NOT NULL,
      website_url VARCHAR(2048) NOT NULL DEFAULT '',
      linkedin_url VARCHAR(2048) NOT NULL DEFAULT '',
      imdb_url VARCHAR(2048) NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (verification_status IN ('pending_review', 'verified', 'rejected', 'suspended')),
      verification_notes TEXT NULL,
      verified_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      verified_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_accounts_status
      ON industry_accounts(verification_status);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_vetting_reviews (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      reviewer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      decision_status TEXT NOT NULL
        CHECK (decision_status IN ('verified', 'rejected', 'suspended')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_vetting_reviews_account
      ON industry_vetting_reviews(account_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_entitlements (
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      access_level TEXT NOT NULL DEFAULT 'none'
        CHECK (access_level IN ('none', 'view', 'download')),
      granted_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (writer_user_id, industry_account_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_entitlements_account
      ON industry_entitlements(industry_account_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_download_audit (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      downloaded_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'industry_portal'
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_download_audit_writer
      ON industry_download_audit(writer_user_id, downloaded_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_lists (
      id TEXT PRIMARY KEY,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      is_shared BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_lists_account
      ON industry_lists(industry_account_id, updated_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_list_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES industry_lists(id) ON DELETE CASCADE,
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL,
      added_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (list_id, writer_user_id, project_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_list_items_list
      ON industry_list_items(list_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_notes (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES industry_lists(id) ON DELETE CASCADE,
      writer_user_id TEXT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_notes_list
      ON industry_notes(list_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_teams (
      id TEXT PRIMARY KEY,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_teams_account
      ON industry_teams(industry_account_id, updated_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_team_members (
      team_id TEXT NOT NULL REFERENCES industry_teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('owner', 'editor', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, user_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_team_members_user
      ON industry_team_members(user_id, team_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_list_permissions (
      list_id TEXT NOT NULL REFERENCES industry_lists(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES industry_teams(id) ON DELETE CASCADE,
      permission TEXT NOT NULL DEFAULT 'view'
        CHECK (permission IN ('view', 'edit')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, team_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_activity_log (
      id TEXT PRIMARY KEY,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      actor_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_activity_log_account
      ON industry_activity_log(industry_account_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_digest_runs (
      id TEXT PRIMARY KEY,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      generated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      recommendations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      override_writer_ids TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_digest_runs_account
      ON industry_digest_runs(industry_account_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS industry_talent_index (
      writer_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      representation_status TEXT NOT NULL,
      genres TEXT[] NOT NULL DEFAULT '{}',
      demographics TEXT[] NOT NULL DEFAULT '{}',
      project_title TEXT NOT NULL,
      project_format TEXT NOT NULL,
      project_genre TEXT NOT NULL,
      logline TEXT NOT NULL DEFAULT '',
      synopsis TEXT NOT NULL DEFAULT '',
      project_updated_at TIMESTAMPTZ NOT NULL,
      search_text TSVECTOR GENERATED ALWAYS AS (
        to_tsvector(
          'english',
          COALESCE(display_name, '') || ' ' ||
          COALESCE(project_title, '') || ' ' ||
          COALESCE(logline, '') || ' ' ||
          COALESCE(synopsis, '')
        )
      ) STORED,
      PRIMARY KEY (writer_id, project_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_talent_index_search
      ON industry_talent_index USING GIN(search_text);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_talent_index_format
      ON industry_talent_index(project_format);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_talent_index_genre
      ON industry_talent_index(project_genre);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_industry_talent_index_updated
      ON industry_talent_index(project_updated_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS mandates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'mandate'
        CHECK (type IN ('mandate', 'owa')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      genre TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed', 'expired')),
      opens_at TIMESTAMPTZ NOT NULL,
      closes_at TIMESTAMPTZ NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mandates_status_closes
      ON mandates(status, closes_at ASC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS mandate_submissions (
      id TEXT PRIMARY KEY,
      mandate_id TEXT NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      fit_explanation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'under_review', 'forwarded', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (mandate_id, writer_user_id, project_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mandate_submissions_mandate
      ON mandate_submissions(mandate_id, created_at DESC);
  `);

  await db.query(`
    ALTER TABLE mandate_submissions
      ADD COLUMN IF NOT EXISTS editorial_notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS forwarded_to TEXT NOT NULL DEFAULT '';
  `);
}

export async function ensureProgramsTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'closed', 'archived')),
      application_opens_at TIMESTAMPTZ NOT NULL,
      application_closes_at TIMESTAMPTZ NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_programs_status
      ON programs(status, application_closes_at ASC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS program_applications (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      statement TEXT NOT NULL DEFAULT '',
      sample_project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'under_review', 'accepted', 'waitlisted', 'rejected')),
      score INTEGER NULL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
      decision_notes TEXT NULL,
      reviewed_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (program_id, user_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_program_applications_program_status
      ON program_applications(program_id, status, updated_at DESC);
  `);
}

export async function ensureRankingTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS competition_prestige (
      competition_id TEXT PRIMARY KEY,
      tier TEXT NOT NULL DEFAULT 'standard'
        CHECK (tier IN ('standard', 'notable', 'elite', 'premier')),
      multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (multiplier > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS writer_scores (
      writer_id TEXT PRIMARY KEY,
      total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      submission_count INTEGER NOT NULL DEFAULT 0,
      placement_count INTEGER NOT NULL DEFAULT 0,
      rank INTEGER,
      tier TEXT CHECK (tier IS NULL OR tier IN ('top_25', 'top_10', 'top_2', 'top_1')),
      score_change_30d NUMERIC(10,2) NOT NULL DEFAULT 0,
      last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_writer_scores_rank ON writer_scores(rank);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_writer_scores_total_score ON writer_scores(total_score DESC);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_writer_scores_tier ON writer_scores(tier);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS placement_scores (
      placement_id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      competition_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status_weight NUMERIC(6,2) NOT NULL,
      prestige_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
      verification_multiplier NUMERIC(3,2) NOT NULL DEFAULT 0.5,
      time_decay_factor NUMERIC(5,4) NOT NULL DEFAULT 1.0,
      confidence_factor NUMERIC(5,4) NOT NULL DEFAULT 1.0,
      raw_score NUMERIC(10,4) NOT NULL DEFAULT 0,
      placement_date TIMESTAMPTZ NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_placement_scores_writer ON placement_scores(writer_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_placement_scores_competition ON placement_scores(competition_id);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS writer_badges (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      label TEXT NOT NULL,
      placement_id TEXT NOT NULL,
      competition_id TEXT NOT NULL,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_writer_badges_writer ON writer_badges(writer_id);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_writer_badges_placement ON writer_badges(placement_id);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS score_snapshots (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      total_score NUMERIC(10,2) NOT NULL,
      snapshot_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_score_snapshots_writer_date ON score_snapshots(writer_id, snapshot_date DESC);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_score_snapshots_writer_date_unique ON score_snapshots(writer_id, snapshot_date);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS anti_gaming_flags (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      reason TEXT NOT NULL
        CHECK (reason IN ('duplicate_submission', 'suspicious_pattern', 'manual_admin')),
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'dismissed', 'confirmed')),
      resolved_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_anti_gaming_flags_writer ON anti_gaming_flags(writer_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_anti_gaming_flags_status ON anti_gaming_flags(status);`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ranking_appeals (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'upheld', 'rejected')),
      resolution_note TEXT,
      resolved_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ranking_appeals_writer ON ranking_appeals(writer_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ranking_appeals_status ON ranking_appeals(status);`);
}

export async function ensureCoverageMarketplaceTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      specialties TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending_verification'
        CHECK (status IN ('pending_verification', 'active', 'suspended', 'deactivated')),
      stripe_account_id TEXT,
      stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
      avg_rating NUMERIC(3,2),
      total_orders_completed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_providers_user ON coverage_providers(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_providers_status ON coverage_providers(status)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_services (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tier TEXT NOT NULL CHECK (tier IN ('concept_notes', 'early_draft', 'polish_proofread', 'competition_ready')),
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      turnaround_days INTEGER NOT NULL,
      max_pages INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_services_provider ON coverage_services(provider_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_services_active ON coverage_services(active) WHERE active = TRUE`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_orders (
      id TEXT PRIMARY KEY,
      writer_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      service_id TEXT NOT NULL REFERENCES coverage_services(id),
      script_id TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'placed'
        CHECK (status IN ('placed', 'payment_held', 'claimed', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled', 'payment_failed', 'refunded')),
      price_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      provider_payout_cents INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      sla_deadline TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_orders_writer ON coverage_orders(writer_user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_orders_provider ON coverage_orders(provider_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_orders_status ON coverage_orders(status)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_deliveries (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES coverage_orders(id),
      summary TEXT NOT NULL DEFAULT '',
      strengths TEXT NOT NULL DEFAULT '',
      weaknesses TEXT NOT NULL DEFAULT '',
      recommendations TEXT NOT NULL DEFAULT '',
      score INTEGER CHECK (score IS NULL OR (score >= 1 AND score <= 100)),
      file_key TEXT,
      file_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES coverage_orders(id),
      writer_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_reviews_provider ON coverage_reviews(provider_id)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_disputes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES coverage_orders(id),
      opened_by_user_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('non_delivery', 'quality', 'other')),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_refund', 'resolved_no_refund', 'resolved_partial')),
      admin_notes TEXT,
      refund_amount_cents INTEGER,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_disputes_status ON coverage_disputes(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_disputes_order ON coverage_disputes(order_id)`);
}
