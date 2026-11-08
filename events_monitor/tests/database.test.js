import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPool, createRepository } from '../src/database.js';
import { createApp } from '../src/server.js';

test('incremental writes, idempotency, resume, auth and CSV', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const repository = createRepository(pool);
  const apiKey = 'test-key-at-least-24-characters';
  const server = createApp(repository, { apiKey, maxAuctions: 30, maxLotsPerAuction: 2 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const suffix = String(Date.now());
  const auctionId = `9${suffix}`;
  const lotId = `8${suffix}`;
  try {
    const denied = await fetch(`${origin}/api/collections`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 401);
    const accepted = await fetch(`${origin}/api/collections`, { method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ maxAuctions: 2 }) });
    assert.equal(accepted.status, 202);
    const { id: runId } = await accepted.json();
    const claimed = await repository.claimRun();
    assert.equal(claimed.id, runId);
    assert.equal(claimed.options.maxLotsPerAuction, 2);
    const auction = { auction_id: auctionId,
      auction_url_fr: `https://drouot.com/fr/v/${auctionId}`, auction_url_en: `https://drouot.com/en/v/${auctionId}` };
    await repository.discoverAuction(runId, auction);
    await repository.discoverAuction(runId, auction);
    await repository.saveAuctionDetails(auctionId, { title_fr: 'Vente', title_en: 'Sale' });
    const lot = { auction_id: auctionId, lot_id: lotId,
      lot_url_fr: `https://drouot.com/fr/l/${lotId}`, lot_url_en: `https://drouot.com/en/l/${lotId}` };
    await repository.savePage(runId, auctionId, 1, [lot]);
    await repository.savePage(runId, auctionId, 1, [lot]);
    assert.equal(await repository.countLots(auctionId), 1);
    await repository.saveLot(runId, lotId, { title_fr: 'Titre', description_fr: 'Texte' }, 'partial', 'English missing');
    await repository.refreshCounts(runId);
    let status = await repository.getRun(runId);
    assert.equal(status.auctions_discovered, 1);
    assert.equal(status.lots_discovered, 1);
    assert.equal(status.lots_saved, 0);
    await repository.finishRun(runId, 'partial', 'Incomplete');
    const resumed = await repository.resumeRun(runId);
    assert.equal(resumed.status, 'queued');
    await repository.saveLot(runId, lotId, { title_en: 'Title', description_en: 'Text' }, 'completed');
    await repository.refreshCounts(runId);
    status = await repository.getRun(runId);
    assert.equal(status.lots_saved, 1);
    const lots = await repository.lots(auctionId, 0, 10);
    assert.equal(lots[0].title_fr, 'Titre');
    assert.equal(lots[0].title_en, 'Title');
    const secondLot = { ...lot, lot_id: `7${suffix}`, lot_url_fr: `https://drouot.com/fr/l/7${suffix}`,
      lot_url_en: `https://drouot.com/en/l/7${suffix}` };
    await repository.savePage(runId, auctionId, 2, [secondLot]);
    assert.equal((await repository.lotBatch(auctionId, runId, 0, 20, 1)).length, 0);
    assert.equal((await repository.lotBatch(auctionId, runId, 0, 20, null))[0].lot_id, secondLot.lot_id);
    const thirdLot = { ...lot, lot_id: `6${suffix}`, lot_url_fr: `https://drouot.com/fr/l/6${suffix}`,
      lot_url_en: `https://drouot.com/en/l/6${suffix}` };
    await repository.savePage(runId, auctionId, 3, [thirdLot], 2);
    assert.equal(await repository.countLots(auctionId), 2);
    const csv = await fetch(`${origin}/api/exports/lots.csv`);
    assert.equal(csv.status, 200);
    const body = await csv.text();
    assert.match(body, /^auction_id,lot_id,lot_number,/);
    assert.match(body, /"Title"/);
    await repository.finishRun(runId, 'completed');
    const interrupted = await repository.createRun({ source: 'drouot', maxAuctions: 1, includeLots: false, languages: ['fr'] });
    const firstClaim = await repository.claimRun();
    assert.equal(firstClaim.id, interrupted.id);
    await pool.query(`UPDATE drouot_collector.collection_runs SET lease_until=now()-interval '1 second' WHERE id=$1`, [interrupted.id]);
    const recovered = await repository.claimRun();
    assert.equal(recovered.id, interrupted.id);
    await repository.finishRun(interrupted.id, 'completed');
  } finally {
    server.close();
    await pool.end();
  }
});
