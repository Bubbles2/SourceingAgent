import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const backendDir = fileURLToPath(new URL('../../backend', import.meta.url))

/** Unique per run, so accounts never collide with an earlier run's. */
const run = Date.now().toString(36)

export function testEmail(label: string): string {
  return `e2e-${run}-${label}@example.com`
}

/** A test sale's id; removed with the test accounts afterwards */
export function testId(label: string): string {
  return `e2e-${run}-${label}`
}

export const testPassword = 'correct horse battery staple'

/** Runs one of the backend's development scripts and returns what it printed. */
function backendScript(script: string, args: string[]): string {
  return execFileSync(process.execPath, ['--env-file-if-exists=.env', script, ...args], {
    cwd: backendDir,
    encoding: 'utf8',
  })
}

/**
 * The newest link of one kind sent to an address, read from the development email outbox
 * (nothing sends email yet). Returned as a path, e.g. /verify-email#token=…
 */
export function latestEmailLink(email: string, page: 'verify-email' | 'reset-password'): string {
  const output = backendScript('src/cli/showOutbox.ts', [email])
  const links = [...output.matchAll(new RegExp(`https?://[^/\\s]+(/${page}#token=[A-Za-z0-9_-]{43})`, 'g'))]
  const link = links.at(-1)?.[1]
  if (!link) {
    throw new Error(`No ${page} email found for ${email}`)
  }
  return link
}

export type TestSale = {
  auctionId: string
  lots: { id: string; lotNumber: string }[]
}

/**
 * Sales come from the auction monitor, not the API, so tests add theirs from the command line: a
 * sale `daysAhead` days from today at `time` in Paris, with lots numbered 1 to `lotCount`, titled
 * "Test sale <id>" with lots "Test object <n>".
 */
export function addTestSale(id: string, { daysAhead, lotCount = 3, time = '14:00' }: { daysAhead: number; lotCount?: number; time?: string }): TestSale {
  const output = backendScript('src/cli/addTestSale.ts', [id, String(daysAhead), String(lotCount), time])
  const sale: unknown = JSON.parse(output)
  if (typeof sale !== 'object' || sale === null || !('auctionId' in sale) || !('lots' in sale)) {
    throw new Error(`Unexpected test sale: ${output}`)
  }
  return sale as TestSale
}

/** Administrators are only made from the command line, never through the API. */
export function makeAdministrator(email: string): void {
  backendScript('src/cli/setUserRole.ts', [email, 'administrator'])
}

/** Deletes every e2e-… test account and sale, and what belongs to them. */
export function removeTestAccounts(): string {
  return backendScript('src/cli/removeTestAccounts.ts', ['e2e-'])
}
