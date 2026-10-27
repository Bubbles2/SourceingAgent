import { once } from 'node:events'
import type { Express } from 'express'

export type TestServer = {
  baseUrl: string
  close: () => Promise<void>
}

/** Starts the app on a free port for the duration of a test file. */
export async function startTestServer(app: Express): Promise<TestServer> {
  const server = app.listen(0)
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Test server has no TCP address')
  }
  return {
    baseUrl: `http://localhost:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
