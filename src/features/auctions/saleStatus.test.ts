import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatAuctionMeta,
  formatDayMonthYear,
  formatLinkHost,
  formatSaleDateLong,
  formatSaleDateShort,
  formatSaleLine,
  formatSaleMoment,
  formatSaleTime,
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
    expect(getSaleStatus(null, '2026-11-14')).toBe('completed')
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
  })

  it('writes September as "Sep", not "Sept"', () => {
    expect(formatSaleDateShort('2026-09-26')).toBe('Sat 26 Sep 2026')
  })

  it('shows sale times in Paris time, in winter and summer', () => {
    expect(formatSaleTime('2026-10-28T18:00:00.000Z')).toBe('19:00')
    expect(formatSaleTime('2026-07-14T12:30:00.000Z')).toBe('14:30')
  })

  it('leaves out what the auction house has not published', () => {
    expect(formatAuctionMeta({ lotCount: 212, startsAt: '2026-11-14T13:00:00Z' })).toBe('212 lots · Sale at 14:00')
    expect(formatAuctionMeta({ lotCount: 0, startsAt: null })).toBe('Lots not yet published')
    expect(formatSaleMoment({ auctionDate: '2026-11-14', startsAt: '2026-11-14T13:00:00Z' })).toBe('Saturday, 14 November 2026 at 14:00')
    expect(formatSaleMoment({ auctionDate: '2026-11-14', startsAt: null })).toBe('Saturday, 14 November 2026')
    expect(formatSaleMoment({ auctionDate: null, startsAt: null })).toBe('Date to be announced')
    expect(formatSaleLine({ auctionDate: '2026-11-14', location: 'Paris 9e' })).toBe('Sat 14 Nov 2026 · Paris 9e')
    expect(formatSaleLine({ auctionDate: '2026-11-14', location: null })).toBe('Sat 14 Nov 2026')
  })

  it('names the website a link leads to', () => {
    expect(formatLinkHost('https://www.drouot.com/en/l/35306475')).toBe('drouot.com')
  })
})
