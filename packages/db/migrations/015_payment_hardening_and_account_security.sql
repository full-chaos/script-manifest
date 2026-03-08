-- Migration 015: Payment hardening and account security
-- Idempotent migration following existing patterns
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_payment_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES app_users(id),
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE coverage_orders ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT;
ALTER TABLE coverage_orders ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE coverage_orders ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;

CREATE TABLE IF NOT EXISTS payment_retry_queue (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES coverage_orders(id),
  attempt_number INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','succeeded','abandoned')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_payment_profiles_user ON user_payment_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_profiles_stripe ON user_payment_profiles (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_coverage_orders_payment_intent ON coverage_orders (stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_retry_queue_next ON payment_retry_queue (next_retry_at) WHERE status = 'pending';
