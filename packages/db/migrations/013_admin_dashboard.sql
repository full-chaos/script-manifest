-- Admin audit log: tracks all admin actions for accountability
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);

-- Content reports: user-submitted content reports
CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('script', 'profile', 'review', 'feedback')),
  content_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('harassment', 'hate_speech', 'plagiarism', 'spam', 'inappropriate', 'impersonation', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  resolved_by_user_id TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_content ON content_reports(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON content_reports(reporter_id);

-- Moderation actions: admin enforcement log
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('warning', 'content_removal', 'suspension', 'ban', 'reactivation')),
  reason TEXT NOT NULL,
  content_ref TEXT,
  report_id TEXT REFERENCES content_reports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON moderation_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_mod_actions_admin ON moderation_actions(admin_user_id);
