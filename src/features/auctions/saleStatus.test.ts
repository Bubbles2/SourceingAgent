import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDayMonthYear,
  formatSaleDateFrench,
  formatSaleDateLong,
  formatSaleDateShort,
  formatViewingRange,
} from './formatAuction'
import { getSaleStatus, parseSaleStatus, toParisDate, todayInParis } from './saleStatus'

afterEach(() => {
  vi.useRealTimers()
})

describe('Paris dates', () => {
  it.each([
    // Winter time (UTC+1): late evening UTC is already the next day in Paris
    ['2026-10-31T23:30:00Z', '2026-11-01'],
    // Summer time (UTC+2)
    ['2026-07-14T22:30:00Z', '2026-07-15'],
    ['2026-07-14T21:30:00Z', '2026-07-14'],
  ])('%s is %s in Paris', (instant, date) => {
    expect(toParisDate(instant)).toBe(date)
  })

  it("uses Paris time for today's date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'))
    expect(todayInParis()).toBe('2027-01-01')
  })
})

describe('getSaleStatus', () => {
  it('keeps a sale upcoming until the end of its sale day', () => {
    expect(getSaleStatus('2026-11-14', '2026-11-13')).toBe('upcoming')
    expect(getSaleStatus('2026-11-14', '2026-11-14')).toBe('upcoming')
    expect(getSaleStatus('2026-11-14', '2026-11-15')).toBe('completed')
  })

  it('reads the status filter, defaulting to upcoming', () => {
    expect(parseSaleStatus('completed')).toBe('completed')
    expect(parseSaleStatus('upcoming')).toBe('upcoming')
    expect(parseSaleStatus(null)).toBe('upcoming')
    expect(parseSaleStatus('anything')).toBe('upcoming')
  })
})

describe('sale date formats', () => {
  it('formats one date the ways the site shows it', () => {
    expect(formatSaleDateShort('2026-11-14')).toBe('Sat 14 Nov 2026')
    expect(formatDayMonthYear('2026-11-14')).toBe('14 Nov 2026')
    expect(formatSaleDateLong('2026-11-14')).toBe('Saturday, 14 November 2026')
    expect(formatSaleDateFrench('2026-11-14')).toBe('14 novembre 2026')
  })

  it('writes September as "Sep", not "Sept"', () => {
    expect(formatSaleDateShort('2026-09-26')).toBe('Sat 26 Sep 2026')
  })

  it('shortens viewing ranges', () => {
    expect(formatViewingRange({ start: '2026-11-12', end: '2026-11-13' })).toBe('12–13 Nov')
    expect(formatViewingRange({ start: '2026-09-30', end: '2026-10-01' })).toBe('30 Sep – 1 Oct')
    expect(formatViewingRange({ start: '2026-11-12', end: '2026-11-12' })).toBe('12 Nov')
  })
})
