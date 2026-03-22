-- Fix user_mfa.enabled_at: must be nullable so setupMfa can mark
-- a pending enrollment (enabled_at IS NULL) before verification.
-- Migration 016 incorrectly set NOT NULL DEFAULT NOW().

ALTER TABLE user_mfa ALTER COLUMN enabled_at DROP NOT NULL;
ALTER TABLE user_mfa ALTER COLUMN enabled_at DROP DEFAULT;
