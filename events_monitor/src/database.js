import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function createPool(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString: databaseUrl, max: 5 });
}

/** Apply the collector's isolated schema; existing public tables are untouched. */
export async function migrate(pool) {
  const path = fileURLToPath(new URL('../migrations/001_collector.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Parameterized queries for jobs, auctions, lots, and CSV batches
const schema = 'drouot_collector';

export function createRepository(pool) {
  async function query(sql, params = []) { return (await pool.query(sql, params)).rows; }
  async function health() { await query('SELECT 1'); }

  async function createRun(options) {
    const rows = await query(`INSERT INTO ${schema}.collection_runs (source, options, status)
      VALUES ('drouot', $1, 'queued') RETURNING *`, [options]);
    return rows[0];
  }

  async function getRun(id) {
    return (await query(`SELECT * FROM ${schema}.collection_runs WHERE id=$1`, [id]))[0] || null;
  }

  async function activeRun() {
    return (await query(`SELECT * FROM ${schema}.collection_runs
      WHERE status='running' AND lease_until > now()
      ORDER BY id DESC LIMIT 1`))[0] || null;
  }

  async function resumeRun(id) {
    const rows = await query(`UPDATE ${schema}.collection_runs SET status='queued', completed_at=NULL,
      lease_until=NULL, last_error=NULL WHERE id=$1 AND status IN ('failed','partial') RETURNING *`, [id]);
    return rows[0] || null;
  }

  async function claimRun() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT id FROM ${schema}.collection_runs
        WHERE status='queued' OR (status='running' AND lease_until < now())
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
      if (!result.rows.length) { await client.query('COMMIT'); return null; }
      const id = result.rows[0].id;
      const claimed = await client.query(`UPDATE ${schema}.collection_runs
        SET status='running', started_at=COALESCE(started_at, now()), lease_until=now()+interval '90 seconds'
        WHERE id=$1 RETURNING *`, [id]);
      await client.query('COMMIT');
      return claimed.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async function heartbeat(id) {
    await query(`UPDATE ${schema}.collection_runs SET lease_until=now()+interval '90 seconds'
      WHERE id=$1 AND status='running'`, [id]);
  }

  async function finishRun(id, status, error = null) {
    await query(`UPDATE ${schema}.collection_runs SET status=$2, completed_at=now(), lease_until=NULL,
      last_error=$3 WHERE id=$1`, [id, status, error?.slice(0, 1000)]);
  }

  async function refreshCounts(id) {
    await query(`UPDATE ${schema}.collection_runs r SET
      auctions_discovered=(SELECT count(*) FROM ${schema}.run_auctions WHERE run_id=r.id),
      auctions_processed=(SELECT count(*) FROM ${schema}.run_auctions WHERE run_id=r.id AND status='completed'),
      lots_discovered=(SELECT count(DISTINCT l.lot_id) FROM ${schema}.lots l
        JOIN ${schema}.run_auctions a ON a.auction_id=l.auction_id WHERE a.run_id=r.id),
      lots_saved=(SELECT count(*) FROM ${schema}.lots l WHERE l.last_collected_run_id=r.id AND l.details_status='completed'),
      lots_failed=(SELECT count(*) FROM ${schema}.lots l WHERE l.last_collected_run_id=r.id AND l.details_status IN ('failed','partial'))
      WHERE r.id=$1`, [id]);
  }

  async function auctionAlreadyDownloaded(auctionId) {
    const rows = await query(`SELECT EXISTS (
      SELECT 1 FROM ${schema}.auctions WHERE source='drouot' AND auction_id=$1
    ) AS downloaded`, [auctionId]);
    return rows[0].downloaded;
  }

  async function discoverAuction(runId, auction) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO ${schema}.auctions (auction_id,auction_url_fr,auction_url_en)
        VALUES ($1,$2,$3) ON CONFLICT (source,auction_id) DO UPDATE SET
        auction_url_fr=EXCLUDED.auction_url_fr, auction_url_en=EXCLUDED.auction_url_en, updated_at=now()`,
      [auction.auction_id, auction.auction_url_fr, auction.auction_url_en]);
      await client.query(`INSERT INTO ${schema}.run_auctions (run_id,auction_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING`, [runId, auction.auction_id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async function runAuctions(runId) {
    return query(`SELECT a.*, ra.status AS run_status FROM ${schema}.run_auctions ra
      JOIN ${schema}.auctions a ON a.source=ra.source AND a.auction_id=ra.auction_id
      WHERE ra.run_id=$1 ORDER BY a.id`, [runId]);
  }

  async function saveAuctionDetails(auctionId, details) {
    const fields = ['title_fr','description_fr','title_en','description_en','starts_at','auction_date','auction_house'];
    const values = fields.map((field) => details[field] ?? null);
    await query(`UPDATE ${schema}.auctions SET
      title_fr=COALESCE($2,title_fr), description_fr=COALESCE($3,description_fr),
      title_en=COALESCE($4,title_en), description_en=COALESCE($5,description_en),
      starts_at=COALESCE($6,starts_at), auction_date=COALESCE($7,auction_date),
      auction_house=COALESCE($8,auction_house), details_status='completed', updated_at=now()
      WHERE source='drouot' AND auction_id=$1`, [auctionId, ...values]);
  }

  async function setAuctionStatus(runId, auctionId, status, error = null, pageCount = null) {
    await query(`UPDATE ${schema}.run_auctions SET status=$3, last_error=$4 WHERE run_id=$1 AND auction_id=$2`,
      [runId, auctionId, status, error?.slice(0, 1000)]);
    await query(`UPDATE ${schema}.auctions SET catalogue_status=$2, catalogue_page_count=COALESCE($3,catalogue_page_count),
      last_error=$4, updated_at=now() WHERE source='drouot' AND auction_id=$1`,
      [auctionId, status, pageCount, error?.slice(0, 1000)]);
  }

  async function setPageCount(auctionId, count) {
    await query(`UPDATE ${schema}.auctions SET catalogue_page_count=GREATEST(COALESCE(catalogue_page_count,0),$2)
      WHERE source='drouot' AND auction_id=$1`, [auctionId, count]);
  }

  async function pageDone(runId, auctionId, page) {
    const rows = await query(`SELECT status FROM ${schema}.catalogue_pages
      WHERE run_id=$1 AND auction_id=$2 AND page_number=$3`, [runId, auctionId, page]);
    return rows[0]?.status === 'completed';
  }

  async function savePage(runId, auctionId, page, lots, maxLots = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const knownLots = maxLots === null ? null : new Set((await client.query(
        `SELECT lot_id FROM ${schema}.lots WHERE source='drouot' AND auction_id=$1`, [auctionId],
      )).rows.map((row) => row.lot_id));
      let savedCount = 0;
      for (const lot of lots) {
        if (knownLots && knownLots.size >= maxLots) break;
        const saved = await client.query(`INSERT INTO ${schema}.lots (auction_id,lot_id,lot_url_fr,lot_url_en)
          VALUES ($1,$2,$3,$4) ON CONFLICT (source,lot_id) DO UPDATE SET
          lot_url_fr=EXCLUDED.lot_url_fr, lot_url_en=EXCLUDED.lot_url_en, updated_at=now()
          WHERE ${schema}.lots.auction_id=EXCLUDED.auction_id`,
        [auctionId, lot.lot_id, lot.lot_url_fr, lot.lot_url_en]);
        if (saved.rowCount !== 1) throw new Error(`Lot ${lot.lot_id} already belongs to another auction`);
        knownLots?.add(lot.lot_id);
        savedCount += 1;
      }
      await client.query(`INSERT INTO ${schema}.catalogue_pages (run_id,auction_id,page_number,status,lot_count)
        VALUES ($1,$2,$3,'completed',$4) ON CONFLICT (run_id,auction_id,page_number)
        DO UPDATE SET status='completed', lot_count=EXCLUDED.lot_count, last_error=NULL`,
      [runId, auctionId, page, savedCount]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async function savePageFailure(runId, auctionId, page, error) {
    await query(`INSERT INTO ${schema}.catalogue_pages (run_id,auction_id,page_number,status,last_error)
      VALUES ($1,$2,$3,'failed',$4) ON CONFLICT (run_id,auction_id,page_number)
      DO UPDATE SET status='failed',last_error=EXCLUDED.last_error`,
    [runId, auctionId, page, error.slice(0, 1000)]);
  }

  async function lotBatch(auctionId, runId, afterId, limit = 20, maxLots = null) {
    return query(`WITH selected AS (
      SELECT * FROM ${schema}.lots WHERE source='drouot' AND auction_id=$1 ORDER BY id LIMIT $5
    ) SELECT * FROM selected WHERE id>$3
      AND (last_collected_run_id IS DISTINCT FROM $2 OR details_status<>'completed')
      ORDER BY id LIMIT $4`, [auctionId, runId, afterId, limit, maxLots]);
  }

  async function countLots(auctionId) {
    const rows = await query(`SELECT count(*)::integer AS total FROM ${schema}.lots WHERE source='drouot' AND auction_id=$1`, [auctionId]);
    return rows[0].total;
  }

  async function saveLot(runId, lotId, details, status, error = null) {
    const fields = ['lot_number','title_fr','description_fr','title_en','description_en','category_fr','category_en','currency','image_url'];
    await query(`UPDATE ${schema}.lots SET
      lot_number=COALESCE($3,lot_number), title_fr=COALESCE($4,title_fr), description_fr=COALESCE($5,description_fr),
      title_en=COALESCE($6,title_en), description_en=COALESCE($7,description_en),
      category_fr=COALESCE($8,category_fr), category_en=COALESCE($9,category_en),
      currency=COALESCE($10,currency), image_url=COALESCE($11,image_url),
      details_status=$12, last_collected_run_id=$1, last_error=$13, updated_at=now()
      WHERE source='drouot' AND lot_id=$2`,
    [runId, lotId, ...fields.map((field) => details[field] ?? null), status, error?.slice(0, 1000)]);
  }

  async function auctions(afterId, limit) {
    return query(`SELECT * FROM ${schema}.auctions WHERE id>$1 ORDER BY id LIMIT $2`, [afterId, limit]);
  }
  async function auction(id) {
    return (await query(`SELECT * FROM ${schema}.auctions WHERE id=$1`, [id]))[0] || null;
  }
  async function lots(auctionId, afterId, limit) {
    return query(`SELECT * FROM ${schema}.lots WHERE source='drouot' AND auction_id=$1 AND id>$2 ORDER BY id LIMIT $3`,
      [auctionId, afterId, limit]);
  }
  async function exportRows(kind, afterId, limit) {
    const table = kind === 'auctions' ? 'auctions' : 'lots';
    return query(`SELECT * FROM ${schema}.${table} WHERE id>$1 ORDER BY id LIMIT $2`, [afterId, limit]);
  }
  return { health, createRun, getRun, activeRun, resumeRun, claimRun, heartbeat, finishRun, refreshCounts,
    auctionAlreadyDownloaded, discoverAuction,
    runAuctions, saveAuctionDetails, setAuctionStatus, setPageCount, pageDone, savePage, savePageFailure,
    lotBatch, countLots, saveLot, auctions, auction, lots, exportRows };
}
