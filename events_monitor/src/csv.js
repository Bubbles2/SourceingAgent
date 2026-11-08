import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const auctionColumns = ['auction_id','title_fr','description_fr','title_en','description_en','starts_at',
  'auction_date','auction_house','catalogue_page_count','auction_url_fr','auction_url_en'];
export const lotColumns = ['auction_id','lot_id','lot_number','title_fr','description_fr','title_en',
  'description_en','category_fr','category_en','currency','image_url','lot_url_fr','lot_url_en'];

export function csvRow(columns, row) {
  return `${columns.map((column) => `"${String(row[column] ?? '').replaceAll('"', '""')}"`).join(',')}\r\n`;
}

async function* csvChunks(repository, kind) {
  const columns = kind === 'auctions' ? auctionColumns : lotColumns;
  yield `${columns.join(',')}\r\n`;
  let afterId = 0;
  while (true) {
    const rows = await repository.exportRows(kind, afterId, 500);
    if (!rows.length) break;
    for (const row of rows) yield csvRow(columns, row);
    afterId = rows.at(-1).id;
  }
}

export async function streamCsv(response, repository, kind) {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${kind}.csv"`);
  for await (const chunk of csvChunks(repository, kind)) {
    if (response.destroyed) return;
    if (!response.write(chunk)) await once(response, 'drain');
  }
  response.end();
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function writeCsvFile(repository, kind, target) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await pipeline(Readable.from(csvChunks(repository, kind)), createWriteStream(temporary, { flags: 'wx' }));
    return temporary;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Persist both CSVs from committed database rows; existing files stay intact if generation fails. */
export async function exportCsvFiles(repository, directory = projectRoot) {
  const auctionTarget = join(directory, 'collected-auctions.csv');
  const lotTarget = join(directory, 'collected-lots.csv');
  let auctionTemporary;
  let lotTemporary;
  try {
    auctionTemporary = await writeCsvFile(repository, 'auctions', auctionTarget);
    lotTemporary = await writeCsvFile(repository, 'lots', lotTarget);
    await rename(auctionTemporary, auctionTarget);
    auctionTemporary = null;
    await rename(lotTemporary, lotTarget);
    lotTemporary = null;
  } finally {
    if (auctionTemporary) await rm(auctionTemporary, { force: true });
    if (lotTemporary) await rm(lotTemporary, { force: true });
  }
}
