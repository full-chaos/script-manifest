-- Stripe webhook event log for auditing and debugging
CREATE TABLE IF NOT EXISTS stripe_webhook_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_webhook_log_event_id ON stripe_webhook_log(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_log_type ON stripe_webhook_log(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_log_status ON stripe_webhook_log(processing_status);
