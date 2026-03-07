-- Migration 011: terms of service acceptance tracking

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
