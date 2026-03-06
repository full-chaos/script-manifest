-- Migration 002: feedback exchange

CREATE TABLE IF NOT EXISTS token_ledger (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      debit_user_id TEXT NOT NULL,
      credit_user_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      reason TEXT NOT NULL,
      reference_type TEXT NOT NULL DEFAULT '',
      reference_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_token_ledger_debit_user ON token_ledger(debit_user_id);

CREATE INDEX IF NOT EXISTS idx_token_ledger_credit_user ON token_ledger(credit_user_id);

CREATE TABLE IF NOT EXISTS feedback_listings (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      script_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL,
      format TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'claimed', 'completed', 'expired', 'cancelled')),
      claimed_by_user_id TEXT,
      review_deadline TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_feedback_listings_owner ON feedback_listings(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_listings_status ON feedback_listings(status);

CREATE TABLE IF NOT EXISTS feedback_reviews (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES feedback_listings(id) ON DELETE CASCADE,
      reviewer_user_id TEXT NOT NULL,
      score_story_structure INTEGER CHECK (score_story_structure BETWEEN 1 AND 5),
      comment_story_structure TEXT,
      score_characters INTEGER CHECK (score_characters BETWEEN 1 AND 5),
      comment_characters TEXT,
      score_dialogue INTEGER CHECK (score_dialogue BETWEEN 1 AND 5),
      comment_dialogue TEXT,
      score_craft_voice INTEGER CHECK (score_craft_voice BETWEEN 1 AND 5),
      comment_craft_voice TEXT,
      overall_comment TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted', 'accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_feedback_reviews_listing ON feedback_reviews(listing_id);

CREATE TABLE IF NOT EXISTS reviewer_ratings (
      id TEXT PRIMARY KEY,
      review_id TEXT UNIQUE NOT NULL REFERENCES feedback_reviews(id) ON DELETE CASCADE,
      rater_user_id TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS reviewer_strikes (
      id TEXT PRIMARY KEY,
      reviewer_user_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_reviewer_strikes_user ON reviewer_strikes(reviewer_user_id);

CREATE TABLE IF NOT EXISTS reviewer_suspensions (
      id TEXT PRIMARY KEY,
      reviewer_user_id TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      lifted_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_reviewer_suspensions_user ON reviewer_suspensions(reviewer_user_id);

CREATE TABLE IF NOT EXISTS feedback_disputes (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES feedback_reviews(id) ON DELETE CASCADE,
      filed_by_user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_for_filer', 'resolved_for_reviewer', 'dismissed')),
      resolution_note TEXT,
      resolved_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_feedback_disputes_review ON feedback_disputes(review_id);
