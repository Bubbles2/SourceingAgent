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

  it("uses events_monitor_db and the app's own schema by default", () => {
    const database = loadConfig({ ...valid, DB_NAME: undefined }).database
    assert.equal(database.name, 'events_monitor_db')
    assert.equal(database.schema, 'sourcing_agent')
    assert.equal(loadConfig({ ...valid, DB_SCHEMA: 'other_app' }).database.schema, 'other_app')
  })

  it('refuses a schema name that would need quoting in search_path', () => {
    for (const schema of ['Sourcing', 'sourcing agent', 'a;b', 'public,x', '1schema', '']) {
      assert.throws(() => loadConfig({ ...valid, DB_SCHEMA: schema }), /DB_SCHEMA: must be a plain schema name/)
    }
  })

  it('reads the taxonomy service settings, with a local default and no token', () => {
    assert.deepEqual(loadConfig(valid).taxonomy, { serviceUrl: 'http://127.0.0.1:8000', serviceToken: '' })
    const taxonomy = loadConfig({ ...valid, TAXONOMY_SERVICE_URL: 'https://search.internal:9000', TAXONOMY_SERVICE_TOKEN: 't0ken' }).taxonomy
    assert.deepEqual(taxonomy, { serviceUrl: 'https://search.internal:9000', serviceToken: 't0ken' })
    assert.throws(() => loadConfig({ ...valid, TAXONOMY_SERVICE_URL: 'not a url' }), /TAXONOMY_SERVICE_URL/)
  })
})
