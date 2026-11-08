import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuctionListing, parseAuctionPage, parseCataloguePage, parseLotPage, safeDrouotUrl } from '../src/drouot.js';
import { csvRow, auctionColumns, lotColumns } from '../src/csv.js';
import { validateCollection } from '../src/server.js';

const auctionUrl = 'https://drouot.com/fr/v/123-sample';

test('listing accepts current multilingual links, deduplicates and finds pages', () => {
  const html = `<a href="/es/v/123-sample?from=/fr/auctions/future">a</a>
    <a href="/fr/v/123-sample">duplicate</a><a href="https://evil.example/fr/v/456">bad</a>
    <a href="/en/v/456-other">b</a><a href="?page=3">3</a>`;
  const result = parseAuctionListing(html);
  assert.deepEqual(result.auctions.map((row) => row.auction_id), ['123','456']);
  assert.equal(result.auctions[0].auction_url_fr, auctionUrl);
  assert.equal(result.auctions[0].auction_url_en, 'https://drouot.com/en/v/123-sample');
  assert.deepEqual([...result.pages], [3]);
});

test('auction parser finds Event inside a graph and preserves descriptions', () => {
  const html = `<script type="application/ld+json">not JSON</script>
    <script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Event","name":"Vente A","description":"Line 1\\nLine 2","startDate":"2026-11-01T09:00:00+01:00","organizer":{"name":"House"}}]}</script>
    <a href="?page=4">4</a><a href="/fr/l/99-test">lot</a>`;
  const result = parseAuctionPage(html, 'fr', '123', auctionUrl);
  assert.equal(result.details.title_fr, 'Vente A');
  assert.equal(result.details.description_fr, 'Line 1\nLine 2');
  assert.equal(result.details.auction_date, '2026-11-01');
  assert.equal(result.details.auction_house, 'House');
  assert.equal(result.lotLinks[0].lot_id, '99');
  assert.deepEqual([...result.cataloguePages], [4]);
});

test('catalogue deduplicates lot IDs', () => {
  const result = parseCataloguePage('<a href="/fr/l/99-x">a</a><a href="/en/l/99-x">b</a>', '123', auctionUrl);
  assert.equal(result.lots.length, 1);
});

test('lot parser preserves source text and checks auction association', () => {
  const html = `<h1>301 - Silver cup</h1><section><p class="whitespace-pre-line text-paragraph-200">Line 1\nLine 2</p></section>
    <script type="application/ld+json">{"@type":"Product","category":"Silver","offers":{"priceCurrency":"EUR"},"image":"https://cdn.drouot.com/x","isPartOf":{"url":"https://drouot.com/fr/v/123-sample"}}</script>`;
  const lot = parseLotPage(html, 'fr', '123');
  assert.equal(lot.lot_number, '301');
  assert.equal(lot.title_fr, 'Silver cup');
  assert.equal(lot.description_fr, 'Line 1\nLine 2');
  assert.equal(lot.currency, 'EUR');
  assert.throws(() => parseLotPage(html, 'fr', '456'), /another auction/);
});

test('source URL guard rejects alternate hosts and protocols', () => {
  assert.throws(() => safeDrouotUrl('http://drouot.com/fr/v/123'), /outside/);
  assert.throws(() => safeDrouotUrl('https://drouot.com.evil.test/fr/v/123'), /outside/);
  assert.throws(() => safeDrouotUrl('https://127.0.0.1/fr/v/123'), /outside/);
});

test('CSV headers and quoting match the n8n workflow', () => {
  assert.equal(auctionColumns.length, 11);
  assert.equal(lotColumns.length, 13);
  assert.equal(csvRow(['title_fr','description_fr'], { title_fr: 'A,"B"', description_fr: null }), '"A,""B""",""\r\n');
});

test('collection request rejects unsupported source and excessive limits', () => {
  const config = { maxAuctions: 30 };
  assert.deepEqual(validateCollection({}, config), { source: 'drouot', maxAuctions: 2, includeLots: true, languages: ['fr','en'] });
  assert.throws(() => validateCollection({ source: 'example' }, config), /Unsupported/);
  assert.throws(() => validateCollection({ maxAuctions: 31 }, config), /maxAuctions/);
});
