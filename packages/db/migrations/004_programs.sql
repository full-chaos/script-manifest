-- Migration 004: programs

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

CREATE INDEX IF NOT EXISTS idx_programs_status
      ON programs(status, application_closes_at ASC);

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

CREATE INDEX IF NOT EXISTS idx_program_applications_program_status
      ON program_applications(program_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS program_cohorts (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      capacity INTEGER NULL CHECK (capacity IS NULL OR capacity > 0),
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_program_cohorts_program
      ON program_cohorts(program_id, start_at ASC);

CREATE TABLE IF NOT EXISTS program_cohort_members (
      cohort_id TEXT NOT NULL REFERENCES program_cohorts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      source_application_id TEXT NULL REFERENCES program_applications(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'removed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (cohort_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_program_cohort_members_status
      ON program_cohort_members(cohort_id, status);

CREATE TABLE IF NOT EXISTS program_sessions (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      cohort_id TEXT NULL REFERENCES program_cohorts(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      session_type TEXT NOT NULL DEFAULT 'event'
        CHECK (session_type IN ('workshop', 'mentorship', 'lab', 'event', 'office_hours')),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      meeting_url TEXT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_program_sessions_program
      ON program_sessions(program_id, starts_at ASC);

CREATE TABLE IF NOT EXISTS program_session_attendance (
      session_id TEXT NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited', 'registered', 'attended', 'no_show', 'excused')),
      notes TEXT NOT NULL DEFAULT '',
      marked_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      marked_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_program_session_attendance_status
      ON program_session_attendance(session_id, status);

CREATE TABLE IF NOT EXISTS program_mentorship_matches (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      cohort_id TEXT NULL REFERENCES program_cohorts(id) ON DELETE SET NULL,
      mentor_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      mentee_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'cancelled')),
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (program_id, mentor_user_id, mentee_user_id)
    );

CREATE INDEX IF NOT EXISTS idx_program_mentorship_matches_status
      ON program_mentorship_matches(program_id, status);

CREATE TABLE IF NOT EXISTS program_application_forms (
      program_id TEXT PRIMARY KEY REFERENCES programs(id) ON DELETE CASCADE,
      fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS program_scoring_rubrics (
      program_id TEXT PRIMARY KEY REFERENCES programs(id) ON DELETE CASCADE,
      criteria_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS program_availability_windows (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_program_availability_windows_program_user
      ON program_availability_windows(program_id, user_id, starts_at ASC);

CREATE TABLE IF NOT EXISTS program_session_integrations (
      session_id TEXT PRIMARY KEY REFERENCES program_sessions(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT '',
      meeting_url TEXT NULL,
      recording_url TEXT NULL,
      reminder_offsets_minutes INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS program_outcomes (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      outcome_type TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      recorded_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_program_outcomes_program_created
      ON program_outcomes(program_id, created_at DESC);

CREATE TABLE IF NOT EXISTS program_crm_sync_jobs (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter')),
      reason TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT NOT NULL DEFAULT '',
      triggered_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      processed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_program_crm_sync_jobs_status_next_attempt
      ON program_crm_sync_jobs(status, next_attempt_at ASC);

CREATE TABLE IF NOT EXISTS program_notification_log (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      notification_type TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_program_notification_log_program_type
      ON program_notification_log(program_id, notification_type, sent_at DESC);

CREATE TABLE IF NOT EXISTS program_kpi_snapshots (
      program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (program_id, snapshot_date)
    );
