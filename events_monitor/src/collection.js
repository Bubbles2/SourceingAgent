import { setTimeout as sleep } from 'node:timers/promises';
import { listingUrl, parseAuctionListing, parseAuctionPage, parseCataloguePage, parseLotPage } from './drouot.js';
import { exportCsvFiles } from './csv.js';

function log(event, runId, values = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, runId, ...values }));
}

function catalogueUrl(base, page) {
  const url = new URL(base);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

function assertRunning(signal) {
  if (signal?.aborted) throw new Error('Collection interrupted');
}

async function discover(run, existingAuctions, repository, http, config, signal) {
  const seen = new Set();
  const inRun = new Set(existingAuctions.map((auction) => auction.auction_id));
  let selected = inRun.size;
  const queue = [1];
  const visited = new Set();
  let pagesBeyondLimit = false;
  while (queue.length && selected < run.options.maxAuctions && visited.size < config.maxPages) {
    assertRunning(signal);
    const page = queue.shift();
    if (visited.has(page)) continue;
    visited.add(page);
    const url = catalogueUrl(listingUrl, page);
    const html = await http.get(url, 'fr');
    const found = parseAuctionListing(html, url);
    if (found.invalidLinks) log('invalid_auction_links', run.id, { page, count: found.invalidLinks });
    for (const auction of found.auctions) {
      if (seen.has(auction.auction_id)) continue;
      seen.add(auction.auction_id);
      if (inRun.has(auction.auction_id)) continue;
      if (await repository.auctionAlreadyDownloaded(auction.auction_id)) {
        log('auction_skipped_existing', run.id, { auctionId: auction.auction_id });
        continue;
      }
      await repository.discoverAuction(run.id, auction);
      inRun.add(auction.auction_id);
      selected += 1;
      log('auction_discovered', run.id, { auctionId: auction.auction_id });
      if (selected === run.options.maxAuctions) break;
    }
    if ([...found.pages].some((number) => number > config.maxPages)) pagesBeyondLimit = true;
    const lastPage = Math.min(config.maxPages, Math.max(1, ...found.pages));
    for (let number = 2; number <= lastPage; number += 1) {
      if (!visited.has(number) && !queue.includes(number)) queue.push(number);
    }
  }
  await repository.refreshCounts(run.id);
  return { pageLimit: selected < run.options.maxAuctions &&
    (pagesBeyondLimit || (queue.length > 0 && visited.size >= config.maxPages)) };
}

async function collectLot(run, lot, repository, http) {
  try {
    const french = parseLotPage(await http.get(lot.lot_url_fr, 'fr'), 'fr', lot.auction_id);
    const english = run.options.languages.includes('en') ?
      parseLotPage(await http.get(lot.lot_url_en, 'en'), 'en', lot.auction_id) : {};
    const details = { ...french, ...english };
    const incomplete = !details.title_fr || !details.description_fr ||
      (run.options.languages.includes('en') && (!details.title_en || !details.description_en));
    await repository.saveLot(run.id, lot.lot_id, details, incomplete ? 'partial' : 'completed',
      incomplete ? 'Missing source title or description' : null);
    return !incomplete;
  } catch (error) {
    await repository.saveLot(run.id, lot.lot_id, {}, 'failed', error.message);
    log('lot_failed', run.id, { lotId: lot.lot_id, error: error.message });
    return false;
  }
}

async function collectAuction(run, auction, repository, http, config, signal) {
  const id = auction.auction_id;
  let partial = false;
  let firstPage;
  try {
    firstPage = await http.get(auction.auction_url_fr, 'fr');
    const french = parseAuctionPage(firstPage, 'fr', id, auction.auction_url_fr);
    const english = run.options.languages.includes('en') ?
      parseAuctionPage(await http.get(auction.auction_url_en, 'en'), 'en', id, auction.auction_url_en) : { details: {} };
    const details = { ...french.details, ...english.details };
    if (!details.title_fr || (run.options.languages.includes('en') && !details.title_en)) partial = true;
    await repository.saveAuctionDetails(id, details);

    if (run.options.includeLots) {
      const selectedLimit = run.options.maxLotsPerAuction ?? config.maxLotsPerAuction ?? 999;
      const maxLots = selectedLimit === 999 ? null : selectedLimit;
      const pages = new Set([1]);
      let paginationIncomplete = false;
      if ([...french.cataloguePages].some((page) => page > config.maxPages) ||
          (auction.catalogue_page_count || 0) > config.maxPages) paginationIncomplete = true;
      for (let page = 2; page <= Math.min(config.maxPages, Math.max(1, ...french.cataloguePages)); page += 1) pages.add(page);
      for (let page = 2; page <= (auction.catalogue_page_count || 1); page += 1) pages.add(page);
      let processed = 0;
      let totalDiscovered = await repository.countLots(id);
      while (pages.size && processed < config.maxPages && (maxLots === null || totalDiscovered < maxLots)) {
        assertRunning(signal);
        const page = Math.min(...pages);
        pages.delete(page);
        if (page > config.maxPages) { paginationIncomplete = true; continue; }
        if (await repository.pageDone(run.id, id, page)) { processed += 1; continue; }
        const url = catalogueUrl(auction.auction_url_fr, page);
        try {
          const html = page === 1 ? firstPage : await http.get(url, 'fr');
          const parsed = page === 1 ?
            { lots: french.lotLinks, pages: french.cataloguePages } : parseCataloguePage(html, id, url);
          for (let number = page + 1; number <= Math.min(config.maxPages, Math.max(page, ...parsed.pages)); number += 1) {
            pages.add(number);
          }
          if ([...parsed.pages].some((number) => number > config.maxPages)) paginationIncomplete = true;
          await repository.setPageCount(id, Math.max(page, ...parsed.pages));
          await repository.savePage(run.id, id, page, parsed.lots, maxLots);
          const previousCount = totalDiscovered;
          totalDiscovered = await repository.countLots(id);
          log('catalogue_page_discovered', run.id, { auctionId: id, page, lots: totalDiscovered - previousCount });
        } catch (error) {
          await repository.savePageFailure(run.id, id, page, error.message);
          paginationIncomplete = true;
          log('catalogue_page_failed', run.id, { auctionId: id, page, error: error.message });
        }
        processed += 1;
      }
      if ((pages.size || totalDiscovered === 0 || paginationIncomplete) &&
          (maxLots === null || totalDiscovered < maxLots)) partial = true;
      let afterId = 0;
      while (true) {
        assertRunning(signal);
        const batch = await repository.lotBatch(id, run.id, afterId, 20, maxLots);
        if (!batch.length) break;
        for (let offset = 0; offset < batch.length; offset += 2) {
          assertRunning(signal);
          const results = await Promise.all(batch.slice(offset, offset + 2).map((lot) => collectLot(run, lot, repository, http)));
          if (results.some((success) => !success)) partial = true;
        }
        afterId = batch.at(-1).id;
        await repository.refreshCounts(run.id);
        log('lots_saved', run.id, { auctionId: id, throughId: afterId });
      }
    }
    await repository.setAuctionStatus(run.id, id, partial ? 'partial' : 'completed',
      partial ? 'One or more pages or lot fields were incomplete' : null);
    log('auction_processed', run.id, { auctionId: id, status: partial ? 'partial' : 'completed' });
    return !partial;
  } catch (error) {
    if (signal?.aborted) throw error;
    await repository.setAuctionStatus(run.id, id, 'failed', error.message);
    log('auction_failed', run.id, { auctionId: id, error: error.message });
    return false;
  }
}

export async function processRun(run, repository, http, config, signal) {
  log('collection_started', run.id);
  let heartbeat = setInterval(() => repository.heartbeat(run.id).catch((error) =>
    log('heartbeat_failed', run.id, { error: error.message })), 30000);
  heartbeat.unref();
  try {
    const existing = await repository.runAuctions(run.id);
    const discovery = existing.length >= run.options.maxAuctions ? { pageLimit: false } :
      await discover(run, existing, repository, http, config, signal);
    let partial = discovery.pageLimit;
    const auctions = await repository.runAuctions(run.id);
    for (const auction of auctions) {
      assertRunning(signal);
      if (auction.run_status === 'completed') continue;
      if (!await collectAuction(run, auction, repository, http, config, signal)) partial = true;
      await repository.refreshCounts(run.id);
    }
    assertRunning(signal);
    const status = partial ? 'partial' : 'completed';
    await exportCsvFiles(repository, config.exportDirectory);
    log('csv_exported', run.id, { files: ['collected-auctions.csv', 'collected-lots.csv'] });
    await repository.finishRun(run.id, status, partial ? 'Some auctions or lots were incomplete; inspect run and auction statuses' : null);
    log('collection_completed', run.id, { status, ...http.metrics });
  } catch (error) {
    await repository.refreshCounts(run.id);
    await repository.finishRun(run.id, 'failed', error.message);
    log('collection_failed', run.id, { error: error.message, ...http.metrics });
  } finally { clearInterval(heartbeat); }
}

export async function workerLoop(repository, makeHttp, config, signal) {
  while (!signal.aborted) {
    try {
      const run = await repository.claimRun();
      if (run) await processRun(run, repository, makeHttp(), config, signal);
      else await sleep(5000, undefined, { signal }).catch(() => {});
    } catch (error) {
      console.error(JSON.stringify({ time: new Date().toISOString(), event: 'worker_error', message: error.message }));
      if (!signal.aborted) await sleep(5000, undefined, { signal }).catch(() => {});
    }
  }
}
