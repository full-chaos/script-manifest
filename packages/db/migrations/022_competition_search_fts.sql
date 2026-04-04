-- Migration 022: Add PostgreSQL full-text search vector for competition search

ALTER TABLE competitions
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX competitions_search_vector_idx
  ON competitions USING GIN (search_vector);
