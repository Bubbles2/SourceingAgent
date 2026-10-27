-- Up Migration

-- Initial schema (SPEC.md §4): users, auctions, catalogues, bid_requests, request_status_history.
-- UUID keys use PostgreSQL's built-in gen_random_uuid(). Money is NUMERIC, never floating point.

-- Keeps updated_at current on every UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Pending Review, Accepted, Rejected, Cancelled, Bid Placed, Won, Lost (SPEC.md, My Requests)
CREATE DOMAIN bid_request_status AS text
  CHECK (VALUE IN ('pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'));

-- Users ---------------------------------------------------------------------------------------

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored trimmed and lower-case, so the unique constraint is case-insensitive
  email text NOT NULL,
  -- Set by the API's password hashing; plain passwords are never stored
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  -- ISO 3166-1 alpha-2
  country_code text NOT NULL,
  company_name text,
  telephone text,
  role text NOT NULL DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_format CHECK (
    email = lower(btrim(email)) AND char_length(email) <= 254 AND email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  ),
  CONSTRAINT users_password_hash_present CHECK (password_hash <> ''),
  CONSTRAINT users_first_name_length CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 100),
  CONSTRAINT users_last_name_length CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 100),
  CONSTRAINT users_country_code_format CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT users_company_name_length CHECK (company_name IS NULL OR char_length(btrim(company_name)) BETWEEN 1 AND 200),
  CONSTRAINT users_telephone_format CHECK (
    telephone IS NULL
    OR (telephone ~ '^\+?[0-9 ().-]+$' AND char_length(regexp_replace(telephone, '[^0-9]', '', 'g')) BETWEEN 6 AND 15)
  ),
  CONSTRAINT users_role_valid CHECK (role IN ('customer', 'administrator'))
);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auctions ------------------------------------------------------------------------------------

CREATE TABLE auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Readable identifier for URLs, e.g. vauclair-tableaux-anciens-2026-11
  slug text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  auction_house text NOT NULL,
  city text NOT NULL,
  -- The sale's start; shown in Paris time
  starts_at timestamptz NOT NULL,
  lot_count integer,
  viewing_starts_on date,
  viewing_ends_on date,
  description text NOT NULL,
  -- https:// URL or a path on this site
  image_url text,
  image_alt text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
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
  CONSTRAINT auctions_image_has_alt CHECK (image_url IS NULL OR char_length(btrim(image_alt)) > 0)
);

-- Upcoming and completed listings, and the calendar's date ranges
CREATE INDEX auctions_starts_at_idx ON auctions (starts_at);

CREATE TRIGGER auctions_set_updated_at BEFORE UPDATE ON auctions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Catalogues ----------------------------------------------------------------------------------

CREATE TABLE catalogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES auctions (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  first_lot integer NOT NULL,
  last_lot integer NOT NULL,
  page_count integer,
  -- External PDF published by the auction house
  pdf_url text NOT NULL,
  cover_image_url text,
  cover_image_alt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Lets bid_requests check that a catalogue belongs to the auction it names
  CONSTRAINT catalogues_id_auction_id_key UNIQUE (id, auction_id),
  CONSTRAINT catalogues_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT catalogues_description_length CHECK (char_length(description) <= 5000),
  CONSTRAINT catalogues_lot_range CHECK (first_lot >= 1 AND last_lot >= first_lot),
  CONSTRAINT catalogues_page_count_positive CHECK (page_count IS NULL OR page_count > 0),
  CONSTRAINT catalogues_pdf_url_https CHECK (pdf_url ~ '^https://'),
  CONSTRAINT catalogues_cover_image_url_format CHECK (cover_image_url IS NULL OR cover_image_url ~ '^(https://|/[^/])'),
  CONSTRAINT catalogues_cover_has_alt CHECK (cover_image_url IS NULL OR char_length(btrim(cover_image_alt)) > 0)
);

CREATE INDEX catalogues_auction_id_idx ON catalogues (auction_id);

CREATE TRIGGER catalogues_set_updated_at BEFORE UPDATE ON catalogues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Bid requests --------------------------------------------------------------------------------

CREATE TABLE bid_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  auction_id uuid NOT NULL,
  catalogue_id uuid NOT NULL,
  lot_number integer NOT NULL,
  -- Maximum hammer price in euros, excluding fees, premiums, taxes and other charges
  max_bid_eur numeric(12, 2) NOT NULL,
  instructions text NOT NULL DEFAULT '',
  status bid_request_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The catalogue must belong to the auction named on the request
  CONSTRAINT bid_requests_catalogue_auction_fkey FOREIGN KEY (catalogue_id, auction_id)
    REFERENCES catalogues (id, auction_id) ON DELETE RESTRICT,
  CONSTRAINT bid_requests_lot_number_positive CHECK (lot_number > 0),
  CONSTRAINT bid_requests_max_bid_positive CHECK (max_bid_eur > 0),
  CONSTRAINT bid_requests_instructions_length CHECK (char_length(instructions) <= 1000)
);

-- An accepted request reserves the lot against conflicting requests (SPEC.md §8, rule 5).
-- Placed, won and lost requests were accepted first, so they keep the reservation.
CREATE UNIQUE INDEX bid_requests_one_reserving_request_per_lot
  ON bid_requests (catalogue_id, lot_number)
  WHERE status IN ('accepted', 'placed', 'won', 'lost');

-- A customer can have only one open request for a lot.
CREATE UNIQUE INDEX bid_requests_one_open_request_per_customer_lot
  ON bid_requests (customer_id, catalogue_id, lot_number)
  WHERE status IN ('pending', 'accepted', 'placed');

-- My requests: a customer's requests, newest first
CREATE INDEX bid_requests_customer_submitted_idx ON bid_requests (customer_id, submitted_at DESC);
-- Requested lots by catalogue, and the catalogue foreign key
CREATE INDEX bid_requests_catalogue_lot_idx ON bid_requests (catalogue_id, lot_number);
CREATE INDEX bid_requests_auction_id_idx ON bid_requests (auction_id);
-- The administrator's review queue
CREATE INDEX bid_requests_pending_idx ON bid_requests (submitted_at) WHERE status = 'pending';

CREATE TRIGGER bid_requests_set_updated_at BEFORE UPDATE ON bid_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Request status history (audit trail) --------------------------------------------------------

CREATE TABLE request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_request_id uuid NOT NULL REFERENCES bid_requests (id) ON DELETE RESTRICT,
  -- NULL for the row recording the request's creation
  from_status bid_request_status,
  to_status bid_request_status NOT NULL,
  -- NULL for changes made by the system rather than a person
  changed_by uuid REFERENCES users (id) ON DELETE RESTRICT,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_status_history_status_changes CHECK (from_status IS DISTINCT FROM to_status),
  CONSTRAINT request_status_history_note_length CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX request_status_history_request_idx ON request_status_history (bid_request_id, changed_at);
CREATE INDEX request_status_history_changed_by_idx ON request_status_history (changed_by);

-- The audit trail is append-only.
CREATE FUNCTION prevent_audit_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER request_status_history_append_only BEFORE UPDATE OR DELETE ON request_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();

-- Down Migration

DROP TABLE request_status_history;
DROP FUNCTION prevent_audit_changes();
DROP TABLE bid_requests;
DROP TABLE catalogues;
DROP TABLE auctions;
DROP TABLE users;
DROP DOMAIN bid_request_status;
DROP FUNCTION set_updated_at();
