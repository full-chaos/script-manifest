CREATE TABLE search_outbox (
  id             BIGSERIAL    PRIMARY KEY,
  collection     TEXT         NOT NULL,
  document_id    TEXT         NOT NULL,
  operation      TEXT         NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload        JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ
);

CREATE INDEX idx_search_outbox_unpublished
  ON search_outbox (created_at) WHERE published_at IS NULL;
