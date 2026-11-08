-- Up Migration

-- Sales and lots now come straight from the Drouot collector, which keeps them in its own schema,
-- drouot_collector, in this same database (events_monitor_db). The app only reads them, through the
-- views `auctions` and `lots` below. The views keep the column names the app has always used, so
-- the repositories' queries are unchanged; AUCTION_MONITOR.md, at the project root, documents the
-- mapping and the fields the collector doesn't provide (estimates, maker, location).
--
-- The collector owns drouot_collector: nothing here ever writes to it. Sales for automated tests go
-- into test_auctions and test_lots, which the views add to the collector's sales. Their ids start
-- at 900000000001, far above the collector's, so the two never meet.

-- Bid requests name lots by id. The ids below belong to the collector, so requests made against the
-- app's own copied sales would point at unrelated lots: stop rather than mix them up.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bid_requests) THEN
    RAISE EXCEPTION 'bid_requests is not empty: its lot ids refer to the old copied sales, not the collector''s';
  END IF;
END;
$$;

-- The copied sales, the monitor's sources and runs, and its purge, all unused (and empty) here.
-- Without a lots table there is nothing for a request's lot to reference: createBidRequest checks
-- that the lot exists and belongs to the sale, under an advisory lock per lot.
ALTER TABLE bid_requests DROP CONSTRAINT bid_requests_lot_auction_fkey;
DROP FUNCTION purge_old_auctions_30d();
DROP TABLE lots;
DROP TABLE auctions;
DROP TABLE collection_runs;
DROP TABLE auction_sources;

-- Test sales ----------------------------------------------------------------------------------

-- One sequence for test sales and test lots, so their ids never repeat either
CREATE SEQUENCE test_sales_id_seq AS bigint START WITH 900000000001 MINVALUE 900000000001;

CREATE TABLE test_auctions (
  id bigint PRIMARY KEY DEFAULT nextval('test_sales_id_seq'),
  external_id text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  -- The sale day, in Paris
  auction_date date,
  location text,
  catalogue_url text,
  source_url text NOT NULL,
  status text,
  CONSTRAINT test_auctions_external_id_key UNIQUE (external_id),
  -- Below this, ids belong to the collector
  CONSTRAINT test_auctions_id_range CHECK (id >= 900000000001)
);

CREATE TABLE test_lots (
  id bigint PRIMARY KEY DEFAULT nextval('test_sales_id_seq'),
  auction_id bigint NOT NULL REFERENCES test_auctions (id),
  external_id text NOT NULL,
  lot_number text,
  title text,
  description text,
  category text,
  maker text,
  materials text[],
  estimate_low numeric(14, 2),
  estimate_high numeric(14, 2),
  currency character(3),
  image_url text,
  source_url text NOT NULL,
  titleuk text,
  descriptionuk text,
  ai_category text,
  ai_summary text,
  CONSTRAINT test_lots_auction_id_external_id_key UNIQUE (auction_id, external_id),
  CONSTRAINT test_lots_id_range CHECK (id >= 900000000001)
);

-- The collector's sales and lots, with the test sales ------------------------------------------

-- The collector's English text comes first where the app shows one language. Sales whose details
-- the collector couldn't read have no title at all; they get "Drouot sale <id>" instead, because the
-- app (and its API) give every sale a title.
CREATE VIEW auctions AS
  SELECT
    a.id,
    a.auction_id AS external_id,
    coalesce(a.title_en, a.title_fr, initcap(a.source) || ' sale ' || a.auction_id) AS title,
    a.starts_at,
    NULL::timestamptz AS ends_at,
    a.auction_date,
    a.auction_house AS location,
    coalesce(a.auction_url_en, a.auction_url_fr) AS catalogue_url,
    coalesce(a.auction_url_fr, a.auction_url_en) AS source_url,
    a.catalogue_status AS status
  FROM drouot_collector.auctions a
  UNION ALL
  SELECT t.id, t.external_id, t.title, t.starts_at, t.ends_at, t.auction_date, t.location, t.catalogue_url,
    t.source_url, t.status
  FROM test_auctions t;

-- A collector lot names its sale by (source, auction_id); the view gives the sale's id instead, as
-- the app's lots always have. title and description are the original French, titleuk and
-- descriptionuk the English. The collector has no estimates, maker, materials or AI analysis.
CREATE VIEW lots AS
  SELECT
    l.id,
    a.id AS auction_id,
    l.lot_id AS external_id,
    l.lot_number,
    l.title_fr AS title,
    l.description_fr AS description,
    coalesce(l.category_en, l.category_fr) AS category,
    NULL::text AS maker,
    '{}'::text[] AS materials,
    NULL::numeric(14, 2) AS estimate_low,
    NULL::numeric(14, 2) AS estimate_high,
    l.currency::character(3) AS currency,
    l.image_url,
    coalesce(l.lot_url_en, l.lot_url_fr) AS source_url,
    l.title_en AS titleuk,
    l.description_en AS descriptionuk,
    NULL::text AS ai_category,
    NULL::text AS ai_summary
  FROM drouot_collector.lots l
  JOIN drouot_collector.auctions a ON a.source = l.source AND a.auction_id = l.auction_id
  UNION ALL
  SELECT t.id, t.auction_id, t.external_id, t.lot_number, t.title, t.description, t.category, t.maker, t.materials,
    t.estimate_low, t.estimate_high, t.currency, t.image_url, t.source_url, t.titleuk, t.descriptionuk,
    t.ai_category, t.ai_summary
  FROM test_lots t;

-- Down Migration

-- Brings back the app's own copied sales and lots, the monitor's sources and runs, and the purge,
-- empty. Requests refer to the collector's lots, which the restored tables don't hold, so they and
-- their audit rows go first.
DROP VIEW lots;
DROP VIEW auctions;
DROP TABLE test_lots;
DROP TABLE test_auctions;
DROP SEQUENCE test_sales_id_seq;

ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only;
DELETE FROM request_status_history;
ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only;
DELETE FROM bid_requests;

CREATE TABLE auction_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  base_url text NOT NULL,
  discovery_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  listing_pages_per_run integer NOT NULL DEFAULT 2,
  auctions_per_run integer NOT NULL DEFAULT 4,
  catalogue_pages_per_auction integer NOT NULL DEFAULT 3,
  lots_per_auction integer NOT NULL DEFAULT 300,
  listing_page_cursor integer NOT NULL DEFAULT 1,
  auction_offset integer NOT NULL DEFAULT 0,
  CONSTRAINT auction_sources_name_key UNIQUE (name),
  CONSTRAINT auction_sources_auctions_per_run_max4 CHECK (auctions_per_run >= 1 AND auctions_per_run <= 4)
);

CREATE TABLE auctions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  catalogue_url text,
  source_url text NOT NULL,
  status text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auction_date date,
  CONSTRAINT auctions_source_id_external_id_key UNIQUE (source_id, external_id),
  CONSTRAINT auctions_source_id_fkey FOREIGN KEY (source_id) REFERENCES auction_sources (id)
);

CREATE INDEX auctions_starts_at_idx ON auctions (starts_at);
CREATE INDEX auctions_auction_date_idx ON auctions (auction_date);

CREATE TABLE lots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auction_id bigint NOT NULL REFERENCES auctions (id),
  external_id text NOT NULL,
  lot_number text,
  title text,
  description text,
  category text,
  maker text,
  materials text[],
  estimate_low numeric(14, 2),
  estimate_high numeric(14, 2),
  currency character(3),
  image_url text,
  source_url text NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysed_at timestamptz,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '')
      || ' ' || coalesce(maker, ''))
  ) STORED,
  titleuk text,
  descriptionuk text,
  ai_category text,
  ai_summary text,
  analysis_model text,
  analysis_json jsonb,
  search_document_ai tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(titleuk, '') || ' ' || coalesce(descriptionuk, '') || ' ' || coalesce(ai_summary, '')
      || ' ' || coalesce(ai_category, '') || ' ' || coalesce(maker, ''))
  ) STORED,
  CONSTRAINT lots_auction_id_external_id_key UNIQUE (auction_id, external_id),
  CONSTRAINT lots_id_auction_id_key UNIQUE (id, auction_id)
);

CREATE INDEX lots_category_idx ON lots (category);
CREATE INDEX lots_maker_idx ON lots (maker);
CREATE INDEX lots_search_document_idx ON lots USING gin (search_document);
CREATE INDEX lots_search_document_ai_idx ON lots USING gin (search_document_ai);

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

ALTER TABLE bid_requests
  ADD CONSTRAINT bid_requests_lot_auction_fkey FOREIGN KEY (lot_id, auction_id)
    REFERENCES lots (id, auction_id) ON DELETE RESTRICT;

CREATE FUNCTION purge_old_auctions_30d() RETURNS TABLE (auctions_deleted integer, lots_deleted integer)
  LANGUAGE plpgsql
  AS $$
BEGIN
  DELETE FROM lots WHERE auction_id IN (
    SELECT a.id FROM auctions a
    WHERE a.auction_date < current_date - 30
      AND NOT EXISTS (SELECT 1 FROM bid_requests r WHERE r.auction_id = a.id)
  );
  GET DIAGNOSTICS lots_deleted = ROW_COUNT;
  DELETE FROM auctions a
  WHERE a.auction_date < current_date - 30
    AND NOT EXISTS (SELECT 1 FROM bid_requests r WHERE r.auction_id = a.id);
  GET DIAGNOSTICS auctions_deleted = ROW_COUNT;
  RETURN NEXT;
END;
$$;
