import { describe, expect, it } from 'vitest'
import { formatAmountForInput, formatEur, parseWholeEuros } from './money'

describe('formatEur', () => {
  it('shows whole euros with thousands separators', () => {
    expect(formatEur(12_500)).toBe('€12,500')
    expect(formatEur(20)).toBe('€20')
    expect(formatEur(5_000_000)).toBe('€5,000,000')
  })
})

describe('formatAmountForInput', () => {
  it('groups digits for a field that shows its own € prefix', () => {
    expect(formatAmountForInput(12_500)).toBe('12,500')
  })
})

describe('parseWholeEuros', () => {
  it.each([
    ['12500', 12_500],
    ['12,500', 12_500],
    ['12 500', 12_500],
    ['12 500', 12_500],
    [' 2500 ', 2_500],
    ['0', 0],
  ])('reads %j as %d', (text, amount) => {
    expect(parseWholeEuros(text)).toBe(amount)
  })

  it.each(['', '   ', '12.50', '€100', '-5', 'abc', '1e5', '99999999999999999999'])('rejects %j', (text) => {
    expect(parseWholeEuros(text)).toBeNull()
  })
})
