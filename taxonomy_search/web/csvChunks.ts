// A review file can be larger than the API accepts in one request (100 KB of JSON), so it is sent in
// pieces. Each piece starts with the header row and holds whole records: a quoted field that contains
// a line break stays in one piece.

/** The file's records (header first), split at line breaks that are outside quotes. */
export function csvRecords(csv: string): string[] {
  const content = csv.replace(/^﻿/, '')
  const records: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]
    if (char === '"') inQuotes = !inQuotes // "" inside a quoted field toggles twice: no net change
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[i + 1] === '\n') i += 1
      if (current.trim() !== '') records.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') records.push(current)
  return records
}

/** Pieces of at most `maxJsonChars` once JSON-encoded, each with the header row. */
export function splitCsv(csv: string, maxJsonChars = 80_000): string[] {
  const [header, ...rows] = csvRecords(csv)
  if (header === undefined) return []
  const headerSize = JSON.stringify(header).length + 2
  const pieces: string[] = []
  let current: string[] = []
  let size = headerSize
  for (const row of rows) {
    const rowSize = JSON.stringify(row).length + 2
    if (current.length > 0 && size + rowSize > maxJsonChars) {
      pieces.push([header, ...current].join('\n'))
      current = []
      size = headerSize
    }
    current.push(row)
    size += rowSize
  }
  if (current.length > 0) pieces.push([header, ...current].join('\n'))
  return pieces
}
