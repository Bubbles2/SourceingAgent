-- Up Migration

-- Catalogues get a readable public id, like auctions, so the website and API can refer to them
-- without exposing database keys. The table is still empty when this runs.
ALTER TABLE catalogues ADD COLUMN slug text NOT NULL;
ALTER TABLE catalogues ADD CONSTRAINT catalogues_slug_key UNIQUE (slug);
ALTER TABLE catalogues ADD CONSTRAINT catalogues_slug_format
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120);

-- Down Migration

ALTER TABLE catalogues DROP COLUMN slug;
