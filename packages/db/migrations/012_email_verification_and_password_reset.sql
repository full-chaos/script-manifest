-- Migration 012: email verification and password reset

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON email_verification_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash
  ON email_verification_tokens(token_hash);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id);
