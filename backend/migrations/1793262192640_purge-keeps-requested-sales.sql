-- Up Migration

-- The monitor's 30-day purge, changed for this database: sales with bid requests, whatever their
-- status, are kept with all their lots, so customers' requests and results stay on record. The
-- monitor's version tried to delete them too and failed, deleting nothing. AUCTION_MONITOR.md, at the
-- project root, lists this and every other difference from the monitor's database.
CREATE OR REPLACE FUNCTION purge_old_auctions_30d() RETURNS TABLE (auctions_deleted integer, lots_deleted integer)
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

-- Down Migration

-- Back to the monitor's version
CREATE OR REPLACE FUNCTION purge_old_auctions_30d() RETURNS TABLE (auctions_deleted integer, lots_deleted integer)
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
