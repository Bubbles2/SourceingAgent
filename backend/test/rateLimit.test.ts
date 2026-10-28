import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Request } from 'express'
import { byClientIp, ipv6Network } from '../src/middleware/rateLimit.ts'

function requestFrom(ip: string): Request {
  return { ip, socket: {} } as Request
}

describe('rate limit keys', () => {
  it('counts IPv4 clients one address at a time', () => {
    assert.equal(byClientIp(requestFrom('203.0.113.7')), '203.0.113.7')
    assert.equal(byClientIp(requestFrom('::ffff:203.0.113.7')), '::ffff:203.0.113.7')
  })

  it('counts every address in an IPv6 /64 network together', () => {
    const first = byClientIp(requestFrom('2001:db8:0:1:aaaa:bbbb:cccc:dddd'))
    assert.equal(first, '2001:db8:0:1::/64')
    assert.equal(byClientIp(requestFrom('2001:db8::1:1234:5678:9abc:def0')), first)
    assert.equal(byClientIp(requestFrom('2001:0db8:0000:0001::42')), first)
    assert.notEqual(byClientIp(requestFrom('2001:db8:0:2::1')), first)
  })

  it('expands shortened addresses and drops zones', () => {
    assert.equal(ipv6Network('::1'), '0:0:0:0::/64')
    assert.equal(ipv6Network('fe80::1%eth0'), 'fe80:0:0:0::/64')
    assert.equal(ipv6Network('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64')
  })
})
