-- Migration 027: project competition recommendation overrides

CREATE TABLE IF NOT EXISTS project_competition_dismissals (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  dismissed_by_user_id TEXT NOT NULL REFERENCES app_users(id),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_pcd_project
  ON project_competition_dismissals(project_id);

CREATE TABLE IF NOT EXISTS project_competition_pins (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  pinned_by_user_id TEXT NOT NULL REFERENCES app_users(id),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_pcp_project
  ON project_competition_pins(project_id);
