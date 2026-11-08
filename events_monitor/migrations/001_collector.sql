-- Isolated schema: this migration does not alter existing public.auctions or public.lots.
CREATE SCHEMA IF NOT EXISTS drouot_collector;

CREATE TABLE IF NOT EXISTS drouot_collector.collection_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source TEXT NOT NULL CHECK (source = 'drouot'),
  options JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','partial','failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  auctions_discovered INTEGER NOT NULL DEFAULT 0,
  auctions_processed INTEGER NOT NULL DEFAULT 0,
  lots_discovered INTEGER NOT NULL DEFAULT 0,
  lots_saved INTEGER NOT NULL DEFAULT 0,
  lots_failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drouot_collector.auctions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'drouot',
  auction_id TEXT NOT NULL,
  title_fr TEXT,
  description_fr TEXT,
  title_en TEXT,
  description_en TEXT,
  starts_at TIMESTAMPTZ,
  auction_date DATE,
  auction_house TEXT,
  catalogue_page_count INTEGER,
  auction_url_fr TEXT NOT NULL,
  auction_url_en TEXT NOT NULL,
  details_status TEXT NOT NULL DEFAULT 'pending',
  catalogue_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, auction_id)
);

CREATE TABLE IF NOT EXISTS drouot_collector.lots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'drouot',
  auction_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  lot_number TEXT,
  title_fr TEXT,
  description_fr TEXT,
  title_en TEXT,
  description_en TEXT,
  category_fr TEXT,
  category_en TEXT,
  currency TEXT,
  image_url TEXT,
  lot_url_fr TEXT NOT NULL,
  lot_url_en TEXT NOT NULL,
  details_status TEXT NOT NULL DEFAULT 'pending',
  last_collected_run_id BIGINT REFERENCES drouot_collector.collection_runs(id),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, lot_id),
  FOREIGN KEY (source, auction_id) REFERENCES drouot_collector.auctions(source, auction_id)
);

CREATE TABLE IF NOT EXISTS drouot_collector.run_auctions (
  run_id BIGINT NOT NULL REFERENCES drouot_collector.collection_runs(id),
  source TEXT NOT NULL DEFAULT 'drouot' CHECK (source = 'drouot'),
  auction_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  PRIMARY KEY (run_id, auction_id),
  FOREIGN KEY (source, auction_id) REFERENCES drouot_collector.auctions(source, auction_id)
);

CREATE TABLE IF NOT EXISTS drouot_collector.catalogue_pages (
  run_id BIGINT NOT NULL REFERENCES drouot_collector.collection_runs(id),
  auction_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  lot_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  PRIMARY KEY (run_id, auction_id, page_number)
);

CREATE INDEX IF NOT EXISTS collector_lots_auction_idx ON drouot_collector.lots (source, auction_id, id);
CREATE INDEX IF NOT EXISTS collector_runs_claim_idx ON drouot_collector.collection_runs (status, lease_until, id);
