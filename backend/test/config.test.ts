import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadConfig } from '../src/config/env.ts'

const valid = {
  NODE_ENV: 'production',
  DB_HOST: 'db.internal',
  DB_NAME: 'sourcing',
  DB_USER: 'api',
  DB_PASSWORD: 'secret',
  AUTH_SECRET: 'test-only-secret-long-enough-for-validation',
}

describe('configuration', () => {
  it('turns secure cookies on by default in production', () => {
    assert.equal(loadConfig(valid).auth.cookieSecure, true)
  })

  it('refuses the placeholder secret from .env.example', () => {
    assert.throws(
      () => loadConfig({ ...valid, AUTH_SECRET: 'replace-with-at-least-32-random-characters' }),
      /AUTH_SECRET: is still the placeholder/,
    )
  })

  it('refuses cookies over plain HTTP in production, but allows them in development', () => {
    assert.throws(() => loadConfig({ ...valid, COOKIE_SECURE: 'false' }), /COOKIE_SECURE: must not be false in production/)
    assert.equal(loadConfig({ ...valid, NODE_ENV: 'development', COOKIE_SECURE: 'false' }).auth.cookieSecure, false)
  })
})
