-- Migration 019: onboarding progress tracking

CREATE TABLE IF NOT EXISTS onboarding_progress (
  user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  first_script_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  competitions_visited BOOLEAN NOT NULL DEFAULT FALSE,
  coverage_visited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
