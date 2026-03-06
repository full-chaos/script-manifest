-- Migration 007: coverage marketplace

CREATE TABLE IF NOT EXISTS coverage_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      specialties TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending_verification'
        CHECK (status IN ('pending_verification', 'active', 'suspended', 'deactivated')),
      stripe_account_id TEXT,
      stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
      avg_rating NUMERIC(3,2),
      total_orders_completed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_providers_user ON coverage_providers(user_id)

CREATE INDEX IF NOT EXISTS idx_coverage_providers_status ON coverage_providers(status)

CREATE TABLE IF NOT EXISTS coverage_services (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tier TEXT NOT NULL CHECK (tier IN ('concept_notes', 'early_draft', 'polish_proofread', 'competition_ready')),
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      turnaround_days INTEGER NOT NULL,
      max_pages INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_services_provider ON coverage_services(provider_id)

CREATE INDEX IF NOT EXISTS idx_coverage_services_active ON coverage_services(active) WHERE active = TRUE

CREATE TABLE IF NOT EXISTS coverage_orders (
      id TEXT PRIMARY KEY,
      writer_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      service_id TEXT NOT NULL REFERENCES coverage_services(id),
      script_id TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'placed'
        CHECK (status IN ('placed', 'payment_held', 'claimed', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled', 'payment_failed', 'refunded')),
      price_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      provider_payout_cents INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      sla_deadline TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_orders_writer ON coverage_orders(writer_user_id)

CREATE INDEX IF NOT EXISTS idx_coverage_orders_provider ON coverage_orders(provider_id)

CREATE INDEX IF NOT EXISTS idx_coverage_orders_status ON coverage_orders(status)

CREATE INDEX IF NOT EXISTS idx_coverage_orders_delivered_at ON coverage_orders(delivered_at)

CREATE INDEX IF NOT EXISTS idx_coverage_orders_sla_deadline ON coverage_orders(sla_deadline)

CREATE TABLE IF NOT EXISTS coverage_deliveries (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES coverage_orders(id),
      summary TEXT NOT NULL DEFAULT '',
      strengths TEXT NOT NULL DEFAULT '',
      weaknesses TEXT NOT NULL DEFAULT '',
      recommendations TEXT NOT NULL DEFAULT '',
      score INTEGER CHECK (score IS NULL OR (score >= 1 AND score <= 100)),
      file_key TEXT,
      file_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE TABLE IF NOT EXISTS coverage_reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES coverage_orders(id),
      writer_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_reviews_provider ON coverage_reviews(provider_id)

CREATE TABLE IF NOT EXISTS coverage_disputes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES coverage_orders(id),
      opened_by_user_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('non_delivery', 'quality', 'other')),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_refund', 'resolved_no_refund', 'resolved_partial')),
      admin_notes TEXT,
      refund_amount_cents INTEGER,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_disputes_status ON coverage_disputes(status)

CREATE INDEX IF NOT EXISTS idx_coverage_disputes_order ON coverage_disputes(order_id)

CREATE TABLE IF NOT EXISTS coverage_provider_reviews (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      reviewed_by_user_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'suspended')),
      reason TEXT,
      checklist TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_provider_reviews_provider ON coverage_provider_reviews(provider_id)

CREATE INDEX IF NOT EXISTS idx_coverage_provider_reviews_created ON coverage_provider_reviews(created_at DESC)

CREATE TABLE IF NOT EXISTS coverage_dispute_events (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL REFERENCES coverage_disputes(id),
      actor_user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      note TEXT,
      from_status TEXT
        CHECK (from_status IS NULL OR from_status IN ('open', 'under_review', 'resolved_refund', 'resolved_no_refund', 'resolved_partial')),
      to_status TEXT
        CHECK (to_status IS NULL OR to_status IN ('open', 'under_review', 'resolved_refund', 'resolved_no_refund', 'resolved_partial')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )

CREATE INDEX IF NOT EXISTS idx_coverage_dispute_events_dispute ON coverage_dispute_events(dispute_id)
