import { describe, expect, it } from 'vitest'
import { csvRecords, splitCsv } from './csvChunks'

describe('review file pieces', () => {
  it('keeps quoted line breaks inside one record and drops the BOM', () => {
    const csv = '﻿decision,concept_key,example\r\napprove,a.b,"line one\nline two"\r\n,c.d,"say ""hi"""\n'
    expect(csvRecords(csv)).toEqual(['decision,concept_key,example', 'approve,a.b,"line one\nline two"', ',c.d,"say ""hi"""'])
  })

  it('splits into pieces that each start with the header and fit the limit', () => {
    const rows = Array.from({ length: 300 }, (_, i) => `approve,concept.${i},"${'x'.repeat(200)}"`)
    const csv = ['decision,concept_key,example', ...rows].join('\n')
    const pieces = splitCsv(csv, 10_000)
    expect(pieces.length).toBeGreaterThan(5)
    for (const piece of pieces) {
      expect(piece.startsWith('decision,concept_key,example\n')).toBe(true)
      expect(JSON.stringify(piece).length).toBeLessThanOrEqual(10_000)
    }
    expect(pieces.flatMap((piece) => piece.split('\n').slice(1))).toEqual(rows)
  })

  it('handles an empty file and a header-only file', () => {
    expect(splitCsv('')).toEqual([])
    expect(splitCsv('decision,concept_key\n')).toEqual([])
  })
})
