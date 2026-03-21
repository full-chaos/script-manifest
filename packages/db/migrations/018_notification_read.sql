-- Migration 018: notification read tracking
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
