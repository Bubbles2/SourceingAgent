// What visitors can do without an account. Sales come from the auction monitor, so these tests add
// their own upcoming sale from the command line first.
import { parisDate } from './support/api'
import { expect, test } from './support/fixtures'
import { addTestSale, testId, type TestSale } from './support/testData'

const saleId = testId('public-sale')
const saleTitle = `Test sale ${saleId}`
const daysAhead = 20
let sale: TestSale

/** "November 2026" for a YYYY-MM month */
function monthName(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
}

/** The YYYY-MM month after this one */
function nextMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString().slice(0, 7)
}

test.beforeAll(() => {
  sale = addTestSale(saleId, { daysAhead })
})

test('the landing page introduces the service and the next sales', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Bid at Parisien auctions, without leaving home.' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Request a bid: / }).first()).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Create account' })).toBeVisible()
})

test('visitors browse auctions, a sale and its lots', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Auctions', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Auctions' })).toBeVisible()

  await page.getByRole('link', { name: 'Completed' }).click()
  await expect(page).toHaveURL(/\/auctions\?status=completed$/)

  await page.goto(`/auctions/${sale.auctionId}`)
  await expect(page.getByRole('heading', { level: 1, name: saleTitle })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Test object 1' })).toBeVisible()
  const catalogue = page.getByRole('link', { name: /Catalogue on example\.com/ }).first()
  await expect(catalogue).toHaveAttribute('href', `https://example.com/sales/${saleId}`)
  await expect(catalogue).toHaveAttribute('target', '_blank')
  // noreferrer also implies noopener
  await expect(catalogue).toHaveAttribute('rel', /noopener|noreferrer/)

  await page.getByRole('banner').getByRole('link', { name: 'Lots', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Auction lots' })).toBeVisible()
})

test("a lot's Request a bid link sends visitors to sign in, then to that lot", async ({ page }) => {
  await page.goto(`/lots?auction=${sale.auctionId}`)
  await expect(page.getByRole('heading', { name: /^Test object \d$/ })).toHaveCount(3)
  const lot2 = sale.lots.find((lot) => lot.lotNumber === '2')
  await page.getByRole('link', { name: 'Request a bid: Lot 2, Test object 2' }).click()

  const wanted = `/request-bid?auction=${sale.auctionId}&lot=${lot2?.id}`
  await expect(page).toHaveURL(`/sign-in?redirectTo=${encodeURIComponent(wanted)}`)
})

test('the calendar moves between months and opens a sale', async ({ page }) => {
  const month = parisDate(daysAhead).slice(0, 7)
  const following = nextMonth(month)
  await page.goto(`/calendar?month=${month}`)
  await expect(page.getByRole('heading', { name: monthName(month) })).toBeVisible()

  await page.getByRole('link', { name: `Next month, ${monthName(following)}` }).click()
  await expect(page.getByRole('heading', { name: monthName(following) })).toBeVisible()
  await page.getByRole('link', { name: `Previous month, ${monthName(month)}` }).click()
  await expect(page.getByRole('heading', { name: monthName(month) })).toBeVisible()

  await page.getByRole('button', { name: new RegExp(saleTitle) }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: saleTitle })).toBeVisible()
  await expect(dialog.getByText('3 lots')).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Request a bid' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('requested lots are public, without customers or amounts', async ({ page }) => {
  await page.goto('/requested-lots')
  await expect(page.getByRole('heading', { level: 1, name: 'Requested lots' })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('€')
})

test('private pages send visitors to sign in, then back', async ({ page }) => {
  for (const path of ['/account', '/my-requests', `/request-bid?auction=${sale.auctionId}`]) {
    await page.goto(path)
    await expect(page).toHaveURL(`/sign-in?redirectTo=${encodeURIComponent(path)}`)
    await expect(page.getByText('You need to sign in to see that page.')).toBeVisible()
  }
})

test('the API is reachable through the site and healthy', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'ok', checks: { database: { status: 'ok' } } })
})
