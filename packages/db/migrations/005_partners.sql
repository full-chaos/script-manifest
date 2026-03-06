-- Migration 005: partners

CREATE TABLE IF NOT EXISTS organizer_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website_url TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS organizer_memberships (
      organizer_account_id TEXT NOT NULL REFERENCES organizer_accounts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'judge', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organizer_account_id, user_id)
    );

CREATE TABLE IF NOT EXISTS partner_competitions (
      id TEXT PRIMARY KEY,
      organizer_account_id TEXT NOT NULL REFERENCES organizer_accounts(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      genre TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'open', 'closed', 'published', 'archived')),
      submission_opens_at TIMESTAMPTZ NOT NULL,
      submission_closes_at TIMESTAMPTZ NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organizer_account_id, slug)
    );

CREATE INDEX IF NOT EXISTS idx_partner_competitions_status
      ON partner_competitions(status, submission_closes_at ASC);

CREATE TABLE IF NOT EXISTS partner_submissions (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      script_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'in_review', 'shortlisted', 'finalist', 'winner', 'published', 'withdrawn')),
      entry_fee_cents INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

ALTER TABLE partner_submissions
      ADD COLUMN IF NOT EXISTS form_responses JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_partner_submissions_competition
      ON partner_submissions(competition_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS partner_judge_assignments (
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      submission_id TEXT NOT NULL REFERENCES partner_submissions(id) ON DELETE CASCADE,
      judge_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (submission_id, judge_user_id)
    );

CREATE INDEX IF NOT EXISTS idx_partner_judge_assignments_competition
      ON partner_judge_assignments(competition_id, judge_user_id);

CREATE TABLE IF NOT EXISTS partner_evaluations (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      submission_id TEXT NOT NULL REFERENCES partner_submissions(id) ON DELETE CASCADE,
      judge_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      round TEXT NOT NULL DEFAULT 'default',
      raw_score NUMERIC(5,2) NOT NULL CHECK (raw_score >= 0 AND raw_score <= 100),
      normalized_score NUMERIC(6,3),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (submission_id, judge_user_id, round)
    );

CREATE INDEX IF NOT EXISTS idx_partner_evaluations_competition_round
      ON partner_evaluations(competition_id, round, updated_at DESC);

CREATE TABLE IF NOT EXISTS partner_normalization_runs (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      round TEXT NOT NULL DEFAULT 'default',
      triggered_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      evaluated_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS partner_published_results (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      submission_id TEXT NOT NULL REFERENCES partner_submissions(id) ON DELETE CASCADE,
      placement_status TEXT NOT NULL
        CHECK (placement_status IN ('quarterfinalist', 'semifinalist', 'finalist', 'winner')),
      published_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_partner_published_results_competition
      ON partner_published_results(competition_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_draft_swaps (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      submission_id TEXT NOT NULL REFERENCES partner_submissions(id) ON DELETE CASCADE,
      replacement_script_id TEXT NOT NULL,
      fee_cents INTEGER NOT NULL DEFAULT 500,
      reason TEXT NOT NULL DEFAULT '',
      processed_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS partner_sync_jobs (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('import', 'export')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
      external_run_id TEXT,
      detail TEXT NOT NULL DEFAULT '',
      triggered_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_partner_sync_jobs_competition
      ON partner_sync_jobs(competition_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_competition_intake_configs (
      competition_id TEXT PRIMARY KEY REFERENCES partner_competitions(id) ON DELETE CASCADE,
      form_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      fee_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS partner_entrant_messages (
      id TEXT PRIMARY KEY,
      competition_id TEXT NOT NULL REFERENCES partner_competitions(id) ON DELETE CASCADE,
      sender_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      target_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      message_kind TEXT NOT NULL CHECK (message_kind IN ('direct', 'broadcast', 'reminder')),
      template_key TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_partner_entrant_messages_competition_created
      ON partner_entrant_messages(competition_id, created_at DESC);
