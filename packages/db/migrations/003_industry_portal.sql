-- Migration 003: industry portal

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

CREATE INDEX IF NOT EXISTS idx_industry_accounts_status
      ON industry_accounts(verification_status);

CREATE TABLE IF NOT EXISTS industry_vetting_reviews (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      reviewer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      decision_status TEXT NOT NULL
        CHECK (decision_status IN ('verified', 'rejected', 'suspended')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_industry_vetting_reviews_account
      ON industry_vetting_reviews(account_id);

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

CREATE INDEX IF NOT EXISTS idx_industry_entitlements_account
      ON industry_entitlements(industry_account_id);

CREATE TABLE IF NOT EXISTS industry_download_audit (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      downloaded_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'industry_portal'
    );

CREATE INDEX IF NOT EXISTS idx_industry_download_audit_writer
      ON industry_download_audit(writer_user_id, downloaded_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_industry_lists_account
      ON industry_lists(industry_account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS industry_list_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES industry_lists(id) ON DELETE CASCADE,
      writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      project_id TEXT NULL REFERENCES projects(id) ON DELETE SET NULL,
      added_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (list_id, writer_user_id, project_id)
    );

CREATE INDEX IF NOT EXISTS idx_industry_list_items_list
      ON industry_list_items(list_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_industry_notes_list
      ON industry_notes(list_id, created_at DESC);

CREATE TABLE IF NOT EXISTS industry_teams (
      id TEXT PRIMARY KEY,
      industry_account_id TEXT NOT NULL REFERENCES industry_accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_industry_teams_account
      ON industry_teams(industry_account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS industry_team_members (
      team_id TEXT NOT NULL REFERENCES industry_teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('owner', 'editor', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_industry_team_members_user
      ON industry_team_members(user_id, team_id);

CREATE TABLE IF NOT EXISTS industry_list_permissions (
      list_id TEXT NOT NULL REFERENCES industry_lists(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES industry_teams(id) ON DELETE CASCADE,
      permission TEXT NOT NULL DEFAULT 'view'
        CHECK (permission IN ('view', 'edit')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (list_id, team_id)
    );

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

CREATE INDEX IF NOT EXISTS idx_industry_activity_log_account
      ON industry_activity_log(industry_account_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_industry_digest_runs_account
      ON industry_digest_runs(industry_account_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_industry_talent_index_search
      ON industry_talent_index USING GIN(search_text);

CREATE INDEX IF NOT EXISTS idx_industry_talent_index_format
      ON industry_talent_index(project_format);

CREATE INDEX IF NOT EXISTS idx_industry_talent_index_genre
      ON industry_talent_index(project_genre);

CREATE INDEX IF NOT EXISTS idx_industry_talent_index_updated
      ON industry_talent_index(project_updated_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_mandates_status_closes
      ON mandates(status, closes_at ASC);

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

CREATE INDEX IF NOT EXISTS idx_mandate_submissions_mandate
      ON mandate_submissions(mandate_id, created_at DESC);

ALTER TABLE mandate_submissions
      ADD COLUMN IF NOT EXISTS editorial_notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS forwarded_to TEXT NOT NULL DEFAULT '';
