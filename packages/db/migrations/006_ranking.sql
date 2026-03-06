-- Migration 006: ranking

CREATE TABLE IF NOT EXISTS competition_prestige (
      competition_id TEXT PRIMARY KEY,
      tier TEXT NOT NULL DEFAULT 'standard'
        CHECK (tier IN ('standard', 'notable', 'elite', 'premier')),
      multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (multiplier > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS writer_scores (
      writer_id TEXT PRIMARY KEY,
      total_score NUMERIC(10,2) NOT NULL DEFAULT 0,
      submission_count INTEGER NOT NULL DEFAULT 0,
      placement_count INTEGER NOT NULL DEFAULT 0,
      rank INTEGER,
      tier TEXT CHECK (tier IS NULL OR tier IN ('top_25', 'top_10', 'top_2', 'top_1')),
      score_change_30d NUMERIC(10,2) NOT NULL DEFAULT 0,
      last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_writer_scores_rank ON writer_scores(rank);

CREATE INDEX IF NOT EXISTS idx_writer_scores_total_score ON writer_scores(total_score DESC);

CREATE INDEX IF NOT EXISTS idx_writer_scores_tier ON writer_scores(tier);

CREATE TABLE IF NOT EXISTS placement_scores (
      placement_id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      competition_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status_weight NUMERIC(6,2) NOT NULL,
      prestige_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
      verification_multiplier NUMERIC(3,2) NOT NULL DEFAULT 0.5,
      time_decay_factor NUMERIC(5,4) NOT NULL DEFAULT 1.0,
      confidence_factor NUMERIC(5,4) NOT NULL DEFAULT 1.0,
      raw_score NUMERIC(10,4) NOT NULL DEFAULT 0,
      placement_date TIMESTAMPTZ NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_placement_scores_writer ON placement_scores(writer_id);

CREATE INDEX IF NOT EXISTS idx_placement_scores_competition ON placement_scores(competition_id);

CREATE TABLE IF NOT EXISTS writer_badges (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      label TEXT NOT NULL,
      placement_id TEXT NOT NULL,
      competition_id TEXT NOT NULL,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_writer_badges_writer ON writer_badges(writer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_writer_badges_placement ON writer_badges(placement_id);

CREATE TABLE IF NOT EXISTS score_snapshots (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      total_score NUMERIC(10,2) NOT NULL,
      snapshot_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_score_snapshots_writer_date ON score_snapshots(writer_id, snapshot_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_snapshots_writer_date_unique ON score_snapshots(writer_id, snapshot_date);

CREATE TABLE IF NOT EXISTS anti_gaming_flags (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      reason TEXT NOT NULL
        CHECK (reason IN ('duplicate_submission', 'suspicious_pattern', 'manual_admin')),
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'dismissed', 'confirmed')),
      resolved_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_anti_gaming_flags_writer ON anti_gaming_flags(writer_id);

CREATE INDEX IF NOT EXISTS idx_anti_gaming_flags_status ON anti_gaming_flags(status);

CREATE TABLE IF NOT EXISTS ranking_appeals (
      id TEXT PRIMARY KEY,
      writer_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'upheld', 'rejected')),
      resolution_note TEXT,
      resolved_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_ranking_appeals_writer ON ranking_appeals(writer_id);

CREATE INDEX IF NOT EXISTS idx_ranking_appeals_status ON ranking_appeals(status);
