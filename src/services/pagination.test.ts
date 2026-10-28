import { describe, expect, it } from 'vitest'
import { countPages, pageOffset, parsePageNumber } from './pagination'

describe('pagination', () => {
  it.each([
    [null, 1],
    ['2', 2],
    ['0', 1],
    ['-3', 1],
    ['1.5', 1],
    ['two', 1],
    ['1e400', 1],
  ])('reads ?page=%s as page %i', (value, page) => {
    expect(parsePageNumber(value)).toBe(page)
  })

  it('turns page numbers into offsets', () => {
    expect(pageOffset(1, 12)).toBe(0)
    expect(pageOffset(3, 12)).toBe(24)
  })

  it('counts pages, with at least one', () => {
    expect(countPages({ total: 0, limit: 12 })).toBe(1)
    expect(countPages({ total: 12, limit: 12 })).toBe(1)
    expect(countPages({ total: 13, limit: 12 })).toBe(2)
  })
})
