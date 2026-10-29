import { describe, expect, it } from 'vitest'
import { auctionLotsPath, auctionPath, requestBidPath, safeRedirectPath, signInPath } from './paths'

describe('safeRedirectPath', () => {
  it.each(['/account', '/request-bid?auction=1&lot=2', '/my-requests'])('keeps paths on this site: %s', (path) => {
    expect(safeRedirectPath(path)).toBe(path)
  })

  it.each([null, '', 'account', 'https://evil.example', '//evil.example/phish', '/\\evil.example', '/\t/evil.example', '/\n/evil.example'])(
    'refuses anything that could leave the site: %j',
    (value) => {
      expect(safeRedirectPath(value)).toBeNull()
    },
  )
})

describe('signInPath', () => {
  it('carries the return address, query included, as one encoded parameter', () => {
    const path = signInPath('/request-bid?auction=1&lot=2')
    expect(path).toBe('/sign-in?redirectTo=%2Frequest-bid%3Fauction%3D1%26lot%3D2')
    expect(new URLSearchParams(path.split('?')[1]).get('redirectTo')).toBe('/request-bid?auction=1&lot=2')
  })
})

describe('links', () => {
  it('pre-selects the sale and lot on Request a bid', () => {
    expect(requestBidPath('1', '302')).toEqual({ pathname: '/request-bid', search: '?auction=1&lot=302' })
    expect(requestBidPath('1')).toEqual({ pathname: '/request-bid', search: '?auction=1' })
  })

  it("links to one sale's lots", () => {
    expect(auctionLotsPath('1')).toBe('/lots?auction=1')
  })

  it('encodes auction ids in paths', () => {
    expect(auctionPath('a b/c')).toBe('/auctions/a%20b%2Fc')
  })
})
