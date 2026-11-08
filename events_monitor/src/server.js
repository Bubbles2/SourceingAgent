import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createPool, createRepository, migrate } from './database.js';
import { createHttpClient } from './drouot.js';
import { workerLoop } from './collection.js';
import { exportCsvFiles, streamCsv } from './csv.js';

// Settings and request validation
function integer(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function settings() {
  return {
    databaseUrl: process.env.DATABASE_URL,
    apiKey: process.env.COLLECTION_API_KEY,
    port: integer('PORT', 3000, 1, 65535),
    workerEnabled: process.env.WORKER_ENABLED !== 'false',
    timeoutMs: integer('HTTP_TIMEOUT_MS', 15000, 1000, 120000),
    delayMs: integer('HTTP_DELAY_MS', 1000, 0, 60000),
    maxBytes: integer('HTTP_MAX_BYTES', 5000000, 10000, 50000000),
    retries: integer('HTTP_RETRIES', 3, 1, 6),
    maxAuctions: integer('MAX_AUCTIONS', 30, 1, 1000),
    maxPages: integer('MAX_CATALOGUE_PAGES', 100, 1, 1000),
  };
}

export function requireConfiguration(config) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  if (!config.apiKey || config.apiKey.length < 24) {
    throw new Error('COLLECTION_API_KEY must contain at least 24 characters');
  }
}

export function validApiKey(provided, expected) {
  if (typeof provided !== 'string' || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function positiveId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
}

export function validateCollection(body, config) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object');
  const source = body.source ?? 'drouot';
  const maxAuctions = body.maxAuctions ?? 2;
  const includeLots = body.includeLots ?? true;
  const languages = body.languages ?? ['fr', 'en'];
  if (source !== 'drouot') throw new Error('Unsupported source');
  if (!Number.isSafeInteger(maxAuctions) || maxAuctions < 1 || maxAuctions > config.maxAuctions)
    throw new Error(`maxAuctions must be from 1 to ${config.maxAuctions}`);
  if (typeof includeLots !== 'boolean') throw new Error('includeLots must be boolean');
  if (!Array.isArray(languages) || !languages.includes('fr') || languages.length > 2 ||
      new Set(languages).size !== languages.length || languages.some((lang) => !['fr','en'].includes(lang)))
    throw new Error('languages must be ["fr"] or ["fr","en"]');
  return { source, maxAuctions, includeLots, languages };
}

// HTTP API
export function createApp(repository, config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  function auth(request, response, next) {
    const header = request.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!validApiKey(token, config.apiKey)) return response.status(401).json({ error: 'Unauthorized' });
    next();
  }

  app.get('/api/health', async (_, response) => {
    await repository.health();
    response.json({ status: 'ok' });
  });
  app.post('/api/collections', auth, async (request, response) => {
    let options;
    try { options = validateCollection(request.body, config); }
    catch (error) { return response.status(400).json({ error: error.message }); }
    const run = await repository.createRun({ ...options, maxLotsPerAuction: config.maxLotsPerAuction ?? 999 });
    return response.status(202).json({ id: run.id, status: run.status, url: `/api/collections/${run.id}` });
  });
  app.get('/api/collections/running', auth, async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json(await repository.activeRun());
  });
  app.get('/api/collections/:id', async (request, response) => {
    const id = positiveId(request.params.id);
    if (!id) return response.status(400).json({ error: 'Invalid ID' });
    const run = await repository.getRun(id);
    return run ? response.json(run) : response.status(404).json({ error: 'Run not found' });
  });
  app.post('/api/collections/:id/resume', auth, async (request, response) => {
    const id = positiveId(request.params.id);
    if (!id) return response.status(400).json({ error: 'Invalid ID' });
    const run = await repository.resumeRun(id);
    return run ? response.status(202).json({ id: run.id, status: run.status }) :
      response.status(409).json({ error: 'Run is not resumable' });
  });
  app.get('/api/auctions', async (request, response) => {
    const after = request.query.after === undefined ? 0 : Number(request.query.after);
    const limit = request.query.limit === undefined ? 50 : Number(request.query.limit);
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      return response.status(400).json({ error: 'Invalid pagination' });
    return response.json({ items: await repository.auctions(after, limit) });
  });
  app.get('/api/auctions/:id', async (request, response) => {
    const id = positiveId(request.params.id);
    if (!id) return response.status(400).json({ error: 'Invalid ID' });
    const auction = await repository.auction(id);
    return auction ? response.json(auction) : response.status(404).json({ error: 'Auction not found' });
  });
  app.get('/api/auctions/:id/lots', async (request, response) => {
    const id = positiveId(request.params.id);
    const after = request.query.after === undefined ? 0 : Number(request.query.after);
    const limit = request.query.limit === undefined ? 50 : Number(request.query.limit);
    if (!id || !Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      return response.status(400).json({ error: 'Invalid pagination' });
    const auction = await repository.auction(id);
    if (!auction) return response.status(404).json({ error: 'Auction not found' });
    return response.json({ items: await repository.lots(auction.auction_id, after, limit) });
  });
  app.get('/api/exports/:kind.csv', async (request, response) => {
    if (!['auctions','lots'].includes(request.params.kind)) return response.status(404).json({ error: 'Not found' });
    await streamCsv(response, repository, request.params.kind);
  });
  app.use((error, _request, response, _next) => {
    console.error(JSON.stringify({ time: new Date().toISOString(), event: 'api_error', message: error.message }));
    if (response.headersSent) return response.destroy(error);
    response.status(error.status === 400 ? 400 : 500).json({ error: 'Request failed' });
  });
  return app;
}

/** One entry point: API by default, or worker/migrate when requested. */
async function main() {
  const mode = process.argv[2] || 'api';
  if (!['api', 'worker', 'migrate'].includes(mode)) throw new Error('Use api, worker, or migrate');
  let maxLotsPerAuction = 999;
  if (mode === 'api') {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await prompt.question('Are you using VPN? (yes/no): ');
      if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
        console.log('Server stopped.');
        return;
      }
      const limit = await prompt.question('Maximum lots per auction for testing? (1-998; 999 = no limit): ');
      maxLotsPerAuction = Number.parseInt(limit.trim(), 10);
      if (!Number.isSafeInteger(maxLotsPerAuction) || maxLotsPerAuction < 1 || maxLotsPerAuction > 999) {
        console.log('Enter 1-998, or 999 for no limit. Server stopped.');
        return;
      }
    } finally {
      prompt.close();
    }
  }
  const config = { ...settings(), maxLotsPerAuction };
  if (mode === 'api') requireConfiguration(config);
  const pool = createPool(config.databaseUrl);
  try {
    if (mode === 'migrate') {
      await migrate(pool);
      console.log('Collector schema ready');
      return;
    }
    await pool.query('SELECT 1 FROM drouot_collector.collection_runs LIMIT 1');
    const repository = createRepository(pool);
    const stop = new AbortController();
    if (mode === 'worker') {
      process.once('SIGINT', () => stop.abort());
      process.once('SIGTERM', () => stop.abort());
      await workerLoop(repository, () => createHttpClient(config), config, stop.signal);
      return;
    }
    await exportCsvFiles(repository);
    const server = createApp(repository, config).listen(config.port, () =>
      console.log(`Collector API listening on ${config.port}`));
    const worker = config.workerEnabled ?
      workerLoop(repository, () => createHttpClient(config), config, stop.signal).catch((error) => {
        console.error('Worker stopped:', error.message);
        process.exitCode = 1;
      }) : Promise.resolve();
    await new Promise((finish) => {
      process.once('SIGINT', finish);
      process.once('SIGTERM', finish);
    });
    stop.abort();
    await new Promise((finish) => server.close(finish));
    await worker;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
