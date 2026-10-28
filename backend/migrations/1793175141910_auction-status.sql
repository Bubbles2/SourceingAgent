-- Up Migration

-- Auctions are drafted, published or cancelled. Visitors only see published sales and their
-- catalogues. A cancelled sale keeps its rows, because bid requests may still refer to it.
-- Every sale already in the table was public, so existing rows start out published; new ones are drafts.
ALTER TABLE auctions ADD COLUMN status text NOT NULL DEFAULT 'published';
ALTER TABLE auctions ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE auctions ADD CONSTRAINT auctions_status_valid CHECK (status IN ('draft', 'published', 'cancelled'));

-- Public listings, the calendar and featured sales read published sales by date.
CREATE INDEX auctions_published_starts_at_idx ON auctions (starts_at) WHERE status = 'published';

-- Links are stored as given, so keep them to a sensible length.
ALTER TABLE auctions ADD CONSTRAINT auctions_image_url_length CHECK (char_length(image_url) <= 2048);
ALTER TABLE catalogues ADD CONSTRAINT catalogues_pdf_url_length CHECK (char_length(pdf_url) <= 2048);
ALTER TABLE catalogues ADD CONSTRAINT catalogues_cover_image_url_length CHECK (char_length(cover_image_url) <= 2048);

-- Down Migration

ALTER TABLE catalogues DROP CONSTRAINT catalogues_cover_image_url_length;
ALTER TABLE catalogues DROP CONSTRAINT catalogues_pdf_url_length;
ALTER TABLE auctions DROP CONSTRAINT auctions_image_url_length;
DROP INDEX auctions_published_starts_at_idx;
ALTER TABLE auctions DROP COLUMN status;
