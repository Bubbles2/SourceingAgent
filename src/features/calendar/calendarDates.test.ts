import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  addMonths,
  formatDayAndMonth,
  formatMonthTitle,
  getMonthGridRange,
  getMonthWeeks,
  groupBySaleDate,
  parseMonthKey,
} from './calendarDates'

afterEach(() => {
  vi.useRealTimers()
})

describe('getMonthWeeks', () => {
  it('lays November 2026 out Monday to Sunday, padded from the neighbouring months', () => {
    const weeks = getMonthWeeks('2026-11')
    expect(weeks).toHaveLength(6)
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks[0]?.[0]).toEqual({ date: '2026-10-26', dayOfMonth: 26, inMonth: false, isWeekend: false })
    expect(weeks[0]?.[6]).toEqual({ date: '2026-11-01', dayOfMonth: 1, inMonth: true, isWeekend: true })
    expect(getMonthGridRange('2026-11')).toEqual({ from: '2026-10-26', to: '2026-12-06' })
  })

  it('fits February 2027 (Monday 1st to Sunday 28th) in exactly four weeks', () => {
    expect(getMonthWeeks('2027-02')).toHaveLength(4)
    expect(getMonthGridRange('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })

  it('never skips or repeats a day across daylight-saving changes', () => {
    for (const month of ['2026-03', '2026-10', '2027-03']) {
      const dates = getMonthWeeks(month).flat().map((day) => day.date)
      dates.slice(1).forEach((date, index) => {
        expect(date).toBe(addDays(dates[index] ?? '', 1))
      })
    }
  })
})

describe('month navigation', () => {
  it.each([
    ['2026-12', 1, '2027-01'],
    ['2027-01', -1, '2026-12'],
    ['2026-01', -13, '2024-12'],
    ['2026-08', 0, '2026-08'],
  ])('%s moved by %d is %s', (month, months, expected) => {
    expect(addMonths(month, months)).toBe(expected)
  })

  it('keeps valid month keys and falls back to the current Paris month otherwise', () => {
    vi.useFakeTimers()
    // 23:30 UTC on 31 October is already 1 November in Paris
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'))
    expect(parseMonthKey('2027-02')).toBe('2027-02')
    for (const value of [null, '', '2026-13', '2026-1', 'november']) {
      expect(parseMonthKey(value)).toBe('2026-11')
    }
  })
})

describe('labels and grouping', () => {
  it('formats month titles and neighbouring-month day labels', () => {
    expect(formatMonthTitle('2026-09')).toBe('September 2026')
    expect(formatDayAndMonth('2026-12-01')).toBe('1 Dec')
    expect(formatDayAndMonth('2026-09-01')).toBe('1 Sep')
  })

  it('groups sales by date, keeping their order', () => {
    const groups = groupBySaleDate([
      { id: 'a', saleDate: '2026-11-26' },
      { id: 'b', saleDate: '2026-11-14' },
      { id: 'c', saleDate: '2026-11-26' },
    ])
    expect([...groups.keys()]).toEqual(['2026-11-26', '2026-11-14'])
    expect(groups.get('2026-11-26')?.map((sale) => sale.id)).toEqual(['a', 'c'])
  })
})
