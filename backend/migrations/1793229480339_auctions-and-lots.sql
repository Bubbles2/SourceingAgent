-- Up Migration

-- Auctions and their lots now come from the auction monitor, which collects sales from auction
-- house websites such as Drouot. These tables take the monitor's columns, so its data can be copied
-- across as it is, and replace the hand-entered sales and their PDF catalogues. A bid request now
-- names a lot instead of a catalogue and a lot number.

-- Existing requests refer to the old sales, so they and their audit rows go first.
ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only;
DELETE FROM request_status_history;
ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only;
DELETE FROM bid_requests;

-- Dropping the columns also drops the indexes, checks and foreign key built on them.
ALTER TABLE bid_requests DROP COLUMN catalogue_id, DROP COLUMN lot_number, DROP COLUMN auction_id;
DROP TABLE catalogues;
DROP TABLE auctions;

-- Auctions ------------------------------------------------------------------------------------

CREATE TABLE auctions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The website the sale was collected from (the monitor's auction_sources)
  source_id bigint NOT NULL,
  -- The sale's id on that website
  external_id text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  -- The sale's catalogue page on the source website
  catalogue_url text,
  source_url text NOT NULL,
  status text,
  -- What the website published, as collected
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The sale day, in Paris
  auction_date date,
  CONSTRAINT auctions_source_id_external_id_key UNIQUE (source_id, external_id)
);

-- Upcoming and completed listings, and the calendar's date ranges
CREATE INDEX auctions_starts_at_idx ON auctions (starts_at);
CREATE INDEX auctions_auction_date_idx ON auctions (auction_date);

-- Lots ----------------------------------------------------------------------------------------

CREATE TABLE lots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auction_id bigint NOT NULL REFERENCES auctions (id),
  -- The lot's id on the source website
  external_id text NOT NULL,
  lot_number text,
  -- As published, in the auction house's language
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
  -- English translations and the monitor's AI analysis
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
  -- Lets bid_requests check that a lot belongs to the sale it names
  CONSTRAINT lots_id_auction_id_key UNIQUE (id, auction_id)
);

CREATE INDEX lots_category_idx ON lots (category);
CREATE INDEX lots_maker_idx ON lots (maker);
CREATE INDEX lots_search_document_idx ON lots USING gin (search_document);
CREATE INDEX lots_search_document_ai_idx ON lots USING gin (search_document_ai);

-- Bid requests --------------------------------------------------------------------------------

ALTER TABLE bid_requests
  ADD COLUMN auction_id bigint NOT NULL,
  ADD COLUMN lot_id bigint NOT NULL,
  -- The lot must belong to the sale named on the request
  ADD CONSTRAINT bid_requests_lot_auction_fkey FOREIGN KEY (lot_id, auction_id)
    REFERENCES lots (id, auction_id) ON DELETE RESTRICT;

-- An accepted request reserves the lot against conflicting requests (SPEC.md §8, rule 5).
-- Placed, won and lost requests were accepted first, so they keep the reservation.
CREATE UNIQUE INDEX bid_requests_one_reserving_request_per_lot
  ON bid_requests (lot_id)
  WHERE status IN ('accepted', 'placed', 'won', 'lost');

-- A customer can have only one open request for a lot.
CREATE UNIQUE INDEX bid_requests_one_open_request_per_customer_lot
  ON bid_requests (customer_id, lot_id)
  WHERE status IN ('pending', 'accepted', 'placed');

-- Requested lots, and the lot foreign key
CREATE INDEX bid_requests_lot_auction_idx ON bid_requests (lot_id, auction_id);
CREATE INDEX bid_requests_auction_id_idx ON bid_requests (auction_id);

-- Down Migration

-- Brings back the hand-entered sales and catalogues, empty. Requests refer to the copied sales and
-- lots, so they and their audit rows go first.
ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only;
DELETE FROM request_status_history;
ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only;
DELETE FROM bid_requests;

ALTER TABLE bid_requests DROP COLUMN lot_id, DROP COLUMN auction_id;
DROP TABLE lots;
DROP TABLE auctions;

CREATE TABLE auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  auction_house text NOT NULL,
  city text NOT NULL,
  starts_at timestamptz NOT NULL,
  lot_count integer,
  viewing_starts_on date,
  viewing_ends_on date,
  description text NOT NULL,
  image_url text,
  image_alt text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  CONSTRAINT auctions_slug_key UNIQUE (slug),
  CONSTRAINT auctions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  CONSTRAINT auctions_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT auctions_category_length CHECK (char_length(btrim(category)) BETWEEN 1 AND 100),
  CONSTRAINT auctions_auction_house_length CHECK (char_length(btrim(auction_house)) BETWEEN 1 AND 200),
  CONSTRAINT auctions_city_length CHECK (char_length(btrim(city)) BETWEEN 1 AND 100),
  CONSTRAINT auctions_lot_count_positive CHECK (lot_count IS NULL OR lot_count > 0),
  CONSTRAINT auctions_viewing_dates_paired CHECK ((viewing_starts_on IS NULL) = (viewing_ends_on IS NULL)),
  CONSTRAINT auctions_viewing_dates_order CHECK (viewing_ends_on >= viewing_starts_on),
  CONSTRAINT auctions_description_length CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000),
  CONSTRAINT auctions_image_url_format CHECK (image_url IS NULL OR image_url ~ '^(https://|/[^/])'),
  CONSTRAINT auctions_image_url_length CHECK (char_length(image_url) <= 2048),
  CONSTRAINT auctions_image_has_alt CHECK (image_url IS NULL OR char_length(btrim(image_alt)) > 0),
  CONSTRAINT auctions_status_valid CHECK (status IN ('draft', 'published', 'cancelled'))
);

CREATE INDEX auctions_starts_at_idx ON auctions (starts_at);
CREATE INDEX auctions_published_starts_at_idx ON auctions (starts_at) WHERE status = 'published';
CREATE TRIGGER auctions_set_updated_at BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE catalogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  first_lot integer NOT NULL,
  last_lot integer NOT NULL,
  page_count integer,
  pdf_url text NOT NULL,
  cover_image_url text,
  cover_image_alt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  slug text NOT NULL,
  CONSTRAINT catalogues_id_auction_id_key UNIQUE (id, auction_id),
  CONSTRAINT catalogues_slug_key UNIQUE (slug),
  CONSTRAINT catalogues_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  CONSTRAINT catalogues_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT catalogues_description_length CHECK (char_length(description) <= 5000),
  CONSTRAINT catalogues_lot_range CHECK (first_lot >= 1 AND last_lot >= first_lot),
  CONSTRAINT catalogues_page_count_positive CHECK (page_count IS NULL OR page_count > 0),
  CONSTRAINT catalogues_pdf_url_https CHECK (pdf_url ~ '^https://'),
  CONSTRAINT catalogues_pdf_url_length CHECK (char_length(pdf_url) <= 2048),
  CONSTRAINT catalogues_cover_image_url_format CHECK (cover_image_url IS NULL OR cover_image_url ~ '^(https://|/[^/])'),
  CONSTRAINT catalogues_cover_image_url_length CHECK (char_length(cover_image_url) <= 2048),
  CONSTRAINT catalogues_cover_has_alt CHECK (cover_image_url IS NULL OR char_length(btrim(cover_image_alt)) > 0)
);

CREATE INDEX catalogues_auction_id_idx ON catalogues (auction_id);
CREATE TRIGGER catalogues_set_updated_at BEFORE UPDATE ON catalogues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE bid_requests
  ADD COLUMN auction_id uuid NOT NULL,
  ADD COLUMN catalogue_id uuid NOT NULL,
  ADD COLUMN lot_number integer NOT NULL,
  ADD CONSTRAINT bid_requests_catalogue_auction_fkey FOREIGN KEY (catalogue_id, auction_id)
    REFERENCES catalogues (id, auction_id) ON DELETE RESTRICT,
  ADD CONSTRAINT bid_requests_lot_number_positive CHECK (lot_number > 0);

CREATE UNIQUE INDEX bid_requests_one_reserving_request_per_lot
  ON bid_requests (catalogue_id, lot_number)
  WHERE status IN ('accepted', 'placed', 'won', 'lost');
CREATE UNIQUE INDEX bid_requests_one_open_request_per_customer_lot
  ON bid_requests (customer_id, catalogue_id, lot_number)
  WHERE status IN ('pending', 'accepted', 'placed');
CREATE INDEX bid_requests_catalogue_lot_idx ON bid_requests (catalogue_id, lot_number);
CREATE INDEX bid_requests_auction_id_idx ON bid_requests (auction_id);
