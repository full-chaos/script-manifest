-- Phase E: Platform Operations
-- CHAOS-784 — suspension system, notification management, search admin,
-- MFA/2FA, feature flags, IP blocking & abuse prevention

BEGIN;

-- ── 1. User Suspension System (CHAOS-805) ───────────────────────────

CREATE TABLE IF NOT EXISTS user_suspensions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  suspended_by  TEXT NOT NULL REFERENCES app_users(id),
  duration_days INTEGER,           -- NULL = permanent ban
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,       -- NULL = permanent
  lifted_at     TIMESTAMPTZ,       -- set when manually lifted or auto-expired
  lifted_by     TEXT REFERENCES app_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspensions_user    ON user_suspensions(user_id);
CREATE INDEX IF NOT EXISTS idx_suspensions_active  ON user_suspensions(user_id) WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());

-- ── 2. Notification Templates & Broadcasts (CHAOS-806) ──────────────

CREATE TABLE IF NOT EXISTS notification_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  subject       TEXT NOT NULL,
  body_template TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'general',  -- system_maintenance, new_feature, policy_update, general
  created_by    TEXT NOT NULL REFERENCES app_users(id),
  status        TEXT NOT NULL DEFAULT 'active',    -- draft, active, archived
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_broadcasts (
  id            TEXT PRIMARY KEY,
  template_id   TEXT REFERENCES notification_templates(id),
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  audience      TEXT NOT NULL DEFAULT 'all',       -- all, role:<role>, user:<userId>
  sent_by       TEXT NOT NULL REFERENCES app_users(id),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending, sending, sent, failed
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON notification_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_sent   ON notification_broadcasts(sent_at DESC);

-- ── 3. MFA / 2FA (CHAOS-808) ───────────────────────────────────────

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_mfa (
  user_id         TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  totp_secret     TEXT NOT NULL,                -- encrypted TOTP secret
  backup_codes    TEXT[] NOT NULL DEFAULT '{}',  -- hashed single-use codes
  enabled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

-- ── 4. Feature Flags (CHAOS-809) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_flags (
  key              TEXT PRIMARY KEY,
  description      TEXT NOT NULL DEFAULT '',
  enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct      INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
  user_allowlist   TEXT[] NOT NULL DEFAULT '{}',
  updated_by       TEXT REFERENCES app_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. IP Blocking & Abuse Prevention (CHAOS-810) ──────────────────

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id            TEXT PRIMARY KEY,
  ip_address    TEXT NOT NULL,
  reason        TEXT NOT NULL,
  blocked_by    TEXT NOT NULL REFERENCES app_users(id),
  auto_blocked  BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at    TIMESTAMPTZ,       -- NULL = permanent
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_blocklist_ip ON ip_blocklist(ip_address) WHERE expires_at IS NULL OR expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_expires   ON ip_blocklist(expires_at) WHERE expires_at IS NOT NULL;

COMMIT;
