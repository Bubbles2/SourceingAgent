import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processRun } from '../src/collection.js';

test('a finished collection writes both CSVs without an export request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'drouot-export-'));
  const auction = {
    id: 1, auction_id: '123', auction_url_fr: 'https://drouot.com/fr/v/123-test',
    auction_url_en: 'https://drouot.com/en/v/123-test', title_fr: 'Vente', title_en: 'Sale',
  };
  const lot = {
    id: 1, auction_id: '123', lot_id: '456', title_fr: 'Objet', title_en: 'Object',
    lot_url_fr: 'https://drouot.com/fr/l/456-test', lot_url_en: 'https://drouot.com/en/l/456-test',
  };
  const listing = '<a href="/fr/v/123-test">Vente</a>';
  const event = (name) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', name })}</script>`;
  let runAuctionsCalls = 0;
  let finalStatus;
  const repository = {
    heartbeat: async () => {},
    runAuctions: async () => ++runAuctionsCalls === 1 ? [] : [{ ...auction, run_status: 'pending' }],
    auctionAlreadyDownloaded: async () => false,
    discoverAuction: async () => {},
    refreshCounts: async () => {},
    saveAuctionDetails: async () => {},
    setAuctionStatus: async () => {},
    finishRun: async (_id, status) => { finalStatus = status; },
    exportRows: async (kind, afterId) => afterId ? [] : [kind === 'auctions' ? auction : lot],
  };
  const http = {
    metrics: { requests: 0, retries: 0 },
    get: async (url) => url.includes('/auctions/future') ? listing : event(url.includes('/en/') ? 'Sale' : 'Vente'),
  };
  const run = { id: '1', options: { maxAuctions: 1, includeLots: false, languages: ['fr', 'en'] } };
  try {
    await processRun(run, repository, http, { maxPages: 10, exportDirectory: directory });
    assert.equal(finalStatus, 'completed');
    const auctions = await readFile(join(directory, 'collected-auctions.csv'), 'utf8');
    const lots = await readFile(join(directory, 'collected-lots.csv'), 'utf8');
    assert.match(auctions, /^auction_id,title_fr,/);
    assert.match(auctions, /"123","Vente"/);
    assert.match(lots, /^auction_id,lot_id,/);
    assert.match(lots, /"123","456"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a lot cap stops detail downloads and further catalogue pages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'drouot-limit-'));
  const auction = {
    id: 1, auction_id: '123', auction_url_fr: 'https://drouot.com/fr/v/123',
    auction_url_en: 'https://drouot.com/en/v/123',
  };
  const savedLots = [];
  const requested = [];
  let runAuctionsCalls = 0;
  let finalStatus;
  let expectedMax = 2;
  const repository = {
    heartbeat: async () => {},
    runAuctions: async () => ++runAuctionsCalls === 1 ? [] : [{ ...auction, run_status: 'pending' }],
    auctionAlreadyDownloaded: async () => false,
    discoverAuction: async () => {},
    refreshCounts: async () => {},
    saveAuctionDetails: async () => {},
    countLots: async () => savedLots.length,
    pageDone: async () => false,
    setPageCount: async () => {},
    savePage: async (_runId, _auctionId, _page, lots, maxLots) => {
      assert.equal(maxLots, expectedMax === 999 ? null : expectedMax);
      for (const lot of lots) {
        if (savedLots.some((saved) => saved.lot_id === lot.lot_id)) continue;
        if (maxLots !== null && savedLots.length >= maxLots) break;
        savedLots.push({ ...lot, id: savedLots.length + 1 });
      }
    },
    lotBatch: async (_auctionId, _runId, afterId, _batchSize, maxLots) => {
      assert.equal(maxLots, expectedMax === 999 ? null : expectedMax);
      return savedLots.filter((lot) => lot.id > afterId);
    },
    saveLot: async () => {},
    setAuctionStatus: async () => {},
    finishRun: async (_id, status) => { finalStatus = status; },
    exportRows: async () => [],
  };
  const auctionHtml = '<h1>Vente</h1><a href="/fr/v/123?page=2">2</a>' +
    [101, 102, 103].map((id) => `<a href="/fr/l/${id}">Lot</a>`).join('');
  const http = {
    metrics: {},
    get: async (url) => {
      requested.push(url);
      if (url.includes('/auctions/future')) return '<a href="/fr/v/123">Vente</a>';
      if (url.includes('/fr/v/123')) return auctionHtml;
      if (url.includes('/fr/l/')) return '<h1>1 - Objet</h1><script type="application/ld+json">' +
        '{"@type":"Product","description":"Description"}</script>';
      throw new Error(`Unexpected URL: ${url}`);
    },
  };
  const run = { id: '1', options: { maxAuctions: 1, includeLots: true, languages: ['fr'], maxLotsPerAuction: 2 } };
  try {
    await processRun(run, repository, http, { maxPages: 10, exportDirectory: directory });
    assert.equal(finalStatus, 'completed');
    assert.deepEqual(requested.filter((url) => url.includes('/fr/l/')),
      ['https://drouot.com/fr/l/101', 'https://drouot.com/fr/l/102']);
    assert.equal(requested.some((url) => url.includes('page=2')), false);

    expectedMax = 999;
    run.options.maxLotsPerAuction = 999;
    savedLots.length = 0;
    requested.length = 0;
    runAuctionsCalls = 0;
    await processRun(run, repository, http, { maxPages: 10, exportDirectory: directory });
    assert.equal(finalStatus, 'completed');
    assert.equal(requested.filter((url) => url.includes('/fr/l/')).length, 3);
    assert.equal(requested.some((url) => url.includes('page=2')), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('auction discovery pages past stored auctions to fill the requested count', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'drouot-discovery-'));
  const selected = [];
  const requested = [];
  let finalStatus;
  const repository = {
    heartbeat: async () => {},
    runAuctions: async () => selected.map((auction) => ({ ...auction, run_status: 'pending' })),
    auctionAlreadyDownloaded: async (id) => ['101', '102'].includes(id),
    discoverAuction: async (_runId, auction) => { selected.push(auction); },
    refreshCounts: async () => {},
    saveAuctionDetails: async () => {},
    setAuctionStatus: async () => {},
    finishRun: async (_id, status) => { finalStatus = status; },
    exportRows: async () => [],
  };
  const http = {
    metrics: {},
    get: async (url) => {
      requested.push(url);
      if (url.includes('/auctions/future?page=2')) {
        return '<a href="/fr/v/103">Sale</a><a href="/fr/v/104">Sale</a>';
      }
      if (url.includes('/auctions/future')) {
        return '<a href="/fr/v/101">Sale</a><a href="/fr/v/102">Sale</a>' +
          '<a href="/fr/auctions/future?page=2">Next</a>';
      }
      return '<h1>Vente</h1>';
    },
  };
  const run = { id: '3', options: { maxAuctions: 2, includeLots: false, languages: ['fr'] } };
  try {
    await processRun(run, repository, http, { maxPages: 10, exportDirectory: directory });
    assert.deepEqual(selected.map((auction) => auction.auction_id), ['103', '104']);
    assert.equal(requested.some((url) => url.includes('/auctions/future?page=2')), true);
    assert.equal(requested.some((url) => url.includes('/fr/v/101') || url.includes('/fr/v/102')), false);
    assert.equal(finalStatus, 'completed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
