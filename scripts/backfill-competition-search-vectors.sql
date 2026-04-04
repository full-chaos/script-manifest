-- Backfill / force-rebuild competition search vectors.
--
-- The search_vector column is GENERATED ALWAYS AS ... STORED, so Postgres
-- auto-computes it on INSERT/UPDATE and during the initial ALTER TABLE.
-- This script exists as a safety net: run it manually if the migration was
-- interrupted or you suspect stale vectors after a restore.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/backfill-competition-search-vectors.sql
--
-- The trick: touching a source column (title) with its own value forces
-- Postgres to recompute every generated column on the row. We process in
-- batches of 500 to avoid locking the table for too long on large datasets.

DO $$
DECLARE
  batch_size INT := 500;
  updated    INT;
  total      INT := 0;
BEGIN
  RAISE NOTICE 'Starting competition search_vector backfill (batch size: %)', batch_size;

  LOOP
    UPDATE competitions
       SET title = title
     WHERE id IN (
       SELECT id
         FROM competitions
        LIMIT batch_size
       OFFSET total
     );

    GET DIAGNOSTICS updated = ROW_COUNT;
    total := total + updated;

    RAISE NOTICE '  ... refreshed % rows (% total)', updated, total;

    EXIT WHEN updated < batch_size;
  END LOOP;

  RAISE NOTICE 'Done. Refreshed % competition search vectors.', total;
END
$$;
