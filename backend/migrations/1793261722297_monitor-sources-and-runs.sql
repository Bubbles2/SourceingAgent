-- Up Migration

-- The rest of the auction monitor's database: the websites it collects sales from, a log of each
-- collection run, and its 30-day purge. Same columns, constraints and names as the monitor, so its
-- data can be copied across as it is.
--
-- Every sale now needs its source. On a database that already holds sales copied from the monitor,
-- empty lots and auctions first, run this, then copy all four tables across from the monitor.

CREATE TABLE auction_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  base_url text NOT NULL,
  -- The page listing upcoming sales
  discovery_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- How much one collection run reads
  listing_pages_per_run integer NOT NULL DEFAULT 2,
  auctions_per_run integer NOT NULL DEFAULT 4,
  catalogue_pages_per_auction integer NOT NULL DEFAULT 3,
  lots_per_auction integer NOT NULL DEFAULT 300,
  -- Where the next run carries on
  listing_page_cursor integer NOT NULL DEFAULT 1,
  auction_offset integer NOT NULL DEFAULT 0,
  CONSTRAINT auction_sources_name_key UNIQUE (name),
  CONSTRAINT auction_sources_auctions_per_run_max4 CHECK (auctions_per_run >= 1 AND auctions_per_run <= 4)
);

CREATE TABLE collection_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint REFERENCES auction_sources (id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  auctions_seen integer NOT NULL DEFAULT 0,
  lots_seen integer NOT NULL DEFAULT 0,
  error_summary text
);

ALTER TABLE auctions
  ADD CONSTRAINT auctions_source_id_fkey FOREIGN KEY (source_id) REFERENCES auction_sources (id);

-- The monitor's clean-up, unchanged: deletes sales more than 30 days old and their lots. Requested
-- lots can't be deleted, so here it fails, deleting nothing, while an old sale has bid requests.
CREATE FUNCTION purge_old_auctions_30d() RETURNS TABLE (auctions_deleted integer, lots_deleted integer)
  LANGUAGE plpgsql
  AS $$
BEGIN
  DELETE FROM lots WHERE auction_id IN (
    SELECT id FROM auctions WHERE auction_date < current_date - 30
  );
  GET DIAGNOSTICS lots_deleted = ROW_COUNT;
  DELETE FROM auctions WHERE auction_date < current_date - 30;
  GET DIAGNOSTICS auctions_deleted = ROW_COUNT;
  RETURN NEXT;
END;
$$;

-- Down Migration

DROP FUNCTION purge_old_auctions_30d();
ALTER TABLE auctions DROP CONSTRAINT auctions_source_id_fkey;
DROP TABLE collection_runs;
DROP TABLE auction_sources;
