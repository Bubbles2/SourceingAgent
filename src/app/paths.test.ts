import { describe, expect, it } from 'vitest'
import { auctionPath, requestBidPath, safeRedirectPath, signInPath } from './paths'

describe('safeRedirectPath', () => {
  it.each(['/account', '/request-bid?auction=a&catalogue=b', '/my-requests'])('keeps paths on this site: %s', (path) => {
    expect(safeRedirectPath(path)).toBe(path)
  })

  it.each([null, '', 'account', 'https://evil.example', '//evil.example/phish', '/\\evil.example'])(
    'refuses anything that could leave the site: %j',
    (value) => {
      expect(safeRedirectPath(value)).toBeNull()
    },
  )
})

describe('signInPath', () => {
  it('carries the return address, query included, as one encoded parameter', () => {
    const path = signInPath('/request-bid?auction=a&catalogue=b')
    expect(path).toBe('/sign-in?redirectTo=%2Frequest-bid%3Fauction%3Da%26catalogue%3Db')
    expect(new URLSearchParams(path.split('?')[1]).get('redirectTo')).toBe('/request-bid?auction=a&catalogue=b')
  })
})

describe('links', () => {
  it('pre-selects the sale and catalogue on Request a bid', () => {
    expect(requestBidPath('vauclair-2026-11', 'vauclair-cat')).toEqual({
      pathname: '/request-bid',
      search: '?auction=vauclair-2026-11&catalogue=vauclair-cat',
    })
    expect(requestBidPath('vauclair-2026-11')).toEqual({ pathname: '/request-bid', search: '?auction=vauclair-2026-11' })
  })

  it('encodes auction ids in paths', () => {
    expect(auctionPath('a b/c')).toBe('/auctions/a%20b%2Fc')
  })
})
