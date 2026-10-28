// What visitors can do without an account.
import { expect, test } from './support/fixtures'

const vauclairSale = 'vauclair-tableaux-anciens-2026-11'

test('the landing page introduces the service and its featured sales', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Bid at Parisien auctions, without leaving home.' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Request a bid: / }).first()).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Create account' })).toBeVisible()
})

test('visitors browse auctions, a sale and its catalogue', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Auctions', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Auctions' })).toBeVisible()

  await page.getByRole('link', { name: 'Completed' }).click()
  await expect(page).toHaveURL(/\/auctions\?status=completed$/)

  await page.goto(`/auctions/${vauclairSale}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Tableaux anciens & dessins' })).toBeVisible()
  const pdf = page.getByRole('link', { name: /PDF/ }).first()
  await expect(pdf).toHaveAttribute('target', '_blank')
  // noreferrer also implies noopener
  await expect(pdf).toHaveAttribute('rel', /noopener|noreferrer/)

  await page.getByRole('banner').getByRole('link', { name: 'Catalogues', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Auction catalogues' })).toBeVisible()
})

test('the calendar moves between months and opens a sale', async ({ page }) => {
  await page.goto('/calendar?month=2026-11')
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible()

  await page.getByRole('link', { name: 'Next month, December 2026' }).click()
  await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible()
  await page.getByRole('link', { name: 'Previous month, November 2026' }).click()
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible()

  await page.getByRole('button', { name: /Tableaux anciens & dessins/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Tableaux anciens & dessins' })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Request a bid' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('requested lots are public, without customers or amounts', async ({ page }) => {
  await page.goto('/requested-lots')
  await expect(page.getByRole('heading', { level: 1, name: 'Requested lots' })).toBeVisible()
  const lot45 = page
    .getByRole('row')
    .filter({ hasText: 'Tableaux anciens & dessins' })
    .filter({ has: page.getByRole('cell', { name: '45', exact: true }) })
  await expect(lot45).toContainText('Reserved')
  await expect(page.getByRole('main')).not.toContainText('€')
})

test('private pages send visitors to sign in, then back', async ({ page }) => {
  for (const path of ['/account', '/my-requests', `/request-bid?auction=${vauclairSale}`]) {
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
