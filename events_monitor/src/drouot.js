import * as cheerio from 'cheerio';
import { setTimeout as sleep } from 'node:timers/promises';

// Safe, rate-limited requests
const allowedHosts = new Set(['drouot.com', 'www.drouot.com']);

export function safeDrouotUrl(input, base = 'https://drouot.com') {
  const url = new URL(input, base);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error('URL is outside the approved Drouot host');
  }
  url.hash = '';
  return url;
}

export function createHttpClient(config, fetchImpl = fetch) {
  let nextAllowedAt = 0;
  let gate = Promise.resolve();
  const metrics = { requests: 0, retries: 0 };

  async function rateGate() {
    const task = gate.then(async () => {
      const wait = Math.max(0, nextAllowedAt - Date.now());
      if (wait) await sleep(wait);
      nextAllowedAt = Date.now() + config.delayMs;
    });
    gate = task.catch(() => {});
    await task;
  }

  async function oneRequest(input, language) {
    let url = safeDrouotUrl(input);
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      await rateGate();
      metrics.requests += 1;
      const response = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(config.timeoutMs),
        headers: {
          'Accept-Language': language === 'en' ? 'en-GB,en;q=0.9' : 'fr-FR,fr;q=0.9',
          'User-Agent': 'DrouotAuctionCollector/1.0 (+contact administrator)',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect missing Location');
        url = safeDrouotUrl(location, url);
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url.pathname}`);
        error.status = response.status;
        error.retryAfter = response.headers.get('retry-after');
        await response.body?.cancel();
        throw error;
      }
      const declared = Number(response.headers.get('content-length'));
      if (declared > config.maxBytes) throw new Error('Response exceeds maximum size');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing HTTP response body');
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > config.maxBytes) throw new Error('Response exceeds maximum size');
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    throw new Error('Too many redirects');
  }

  async function get(input, language = 'fr') {
    for (let attempt = 1; attempt <= config.retries; attempt += 1) {
      try {
        return await oneRequest(input, language);
      } catch (error) {
        const retryable = !error.status || error.status === 429 || error.status >= 500;
        if (!retryable || attempt === config.retries) throw error;
        metrics.retries += 1;
        console.warn(JSON.stringify({ time: new Date().toISOString(), event: 'retry_attempted',
          path: safeDrouotUrl(input).pathname, attempt, status: error.status || null }));
        let delay = Math.min(30000, 1000 * 2 ** (attempt - 1));
        if (error.retryAfter) {
          const seconds = Number(error.retryAfter);
          delay = Number.isFinite(seconds) ? Math.min(60000, seconds * 1000) : delay;
        }
        await sleep(delay + Math.random() * 250);
      }
    }
  }
  return { get, metrics };
}

// Drouot HTML and JSON-LD parsing
export const listingUrl = 'https://drouot.com/fr/auctions/future';

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || null : null;
}

function originalText(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function recordsFromJsonLd($) {
  const records = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value['@type']) records.push(value);
    if (value['@graph']) visit(value['@graph']);
  }
  $('script[type="application/ld+json"]').each((_, element) => {
    try { visit(JSON.parse($(element).html())); } catch { /* another script can still be valid */ }
  });
  return records;
}

function recordOfType($, type) {
  return recordsFromJsonLd($).find((record) => {
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
    return types.some((item) => item === type || item?.endsWith(`/${type}`));
  }) || {};
}

function sourceLink(href, type, language = 'fr') {
  try {
    const url = safeDrouotUrl(href);
    const match = url.pathname.match(new RegExp(`^/[a-z]{2}/${type}/(\\d+)(?:[-/][^/]*)?/?$`));
    if (!match) return null;
    const canonical = new URL(url);
    canonical.pathname = url.pathname.replace(/^\/[a-z]{2}\//, `/${language}/`);
    canonical.search = '';
    return { id: match[1], url: canonical.toString() };
  } catch { return null; }
}

function pageLinks($, currentUrl) {
  const pages = new Set();
  $('a[href*="page="]').each((_, element) => {
    try {
      const url = safeDrouotUrl($(element).attr('href'), currentUrl);
      if (url.pathname !== new URL(currentUrl).pathname) return;
      const page = Number(url.searchParams.get('page'));
      if (Number.isSafeInteger(page) && page >= 1) pages.add(page);
    } catch { /* malformed link */ }
  });
  return pages;
}

export function parseAuctionListing(html, url = listingUrl) {
  const $ = cheerio.load(html);
  const auctions = new Map();
  let invalidLinks = 0;
  $('a[href*="/v/"]').each((_, element) => {
    const link = sourceLink($(element).attr('href'), 'v');
    if (!link) { invalidLinks += 1; return; }
    if (auctions.has(link.id)) return;
    auctions.set(link.id, {
      auction_id: link.id,
      auction_url_fr: link.url,
      auction_url_en: link.url.replace('/fr/v/', '/en/v/'),
    });
  });
  return { auctions: [...auctions.values()], pages: pageLinks($, url), invalidLinks };
}

export function parseAuctionPage(html, language, auctionId, url) {
  const $ = cheerio.load(html);
  const event = recordOfType($, 'Event');
  const name = clean(event.name) || clean($('h1').first().text());
  const description = originalText(event.description) || originalText($('meta[name="description"]').attr('content'));
  const organizer = event.organizer || event.Organizer;
  const startsAt = typeof event.startDate === 'string' && !Number.isNaN(Date.parse(event.startDate)) ? event.startDate : null;
  let auctionDate = null;
  if (startsAt) {
    auctionDate = /^\d{4}-\d{2}-\d{2}$/.test(startsAt) ? startsAt :
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startsAt));
  }
  const cataloguePages = pageLinks($, url);
  const lotLinks = parseLotLinks($, auctionId);
  return {
    details: language === 'fr' ? {
      title_fr: name, description_fr: description, starts_at: startsAt && !/^\d{4}-\d{2}-\d{2}$/.test(startsAt) ? startsAt : null,
      auction_date: auctionDate, auction_house: clean(typeof organizer === 'string' ? organizer : organizer?.name),
    } : { title_en: name, description_en: description },
    cataloguePages, lotLinks,
  };
}

function parseLotLinks($, auctionId) {
  const lots = new Map();
  $('a[href*="/l/"]').each((_, element) => {
    const link = sourceLink($(element).attr('href'), 'l');
    if (!link || lots.has(link.id)) return;
    lots.set(link.id, {
      auction_id: auctionId, lot_id: link.id,
      lot_url_fr: link.url, lot_url_en: link.url.replace('/fr/l/', '/en/l/'),
    });
  });
  return [...lots.values()];
}

export function parseCataloguePage(html, auctionId, url) {
  const $ = cheerio.load(html);
  return { lots: parseLotLinks($, auctionId), pages: pageLinks($, url) };
}

export function parseLotPage(html, language, expectedAuctionId) {
  const $ = cheerio.load(html);
  const product = recordOfType($, 'Product');
  const heading = clean($('h1').first().text()) || clean(product.name);
  const number = heading?.match(/^(\d+)\s*[-–]\s*/)?.[1] || null;
  const title = heading?.replace(/^\d+\s*[-–]\s*/, '') || null;
  const description = originalText($('section p.whitespace-pre-line.text-paragraph-200').first().text()) || originalText(product.description);
  const partOf = product.isPartOf?.url || product.isPartOf?.['@id'];
  if (partOf) {
    const linked = sourceLink(partOf, 'v');
    if (linked && linked.id !== expectedAuctionId) throw new Error('Lot belongs to another auction');
  }
  const image = Array.isArray(product.image) ? product.image[0] : product.image;
  return language === 'fr' ? {
    lot_number: number, title_fr: title, description_fr: description,
    category_fr: clean(product.category), currency: clean(product.offers?.priceCurrency),
    image_url: clean(typeof image === 'string' ? image : image?.url),
  } : { title_en: title, description_en: description, category_en: clean(product.category) };
}
