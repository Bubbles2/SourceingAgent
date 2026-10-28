// Sales an administrator manages through the API reach the public site and the calendar: drafts stay
// hidden, published sales appear with their catalogue, and cancelled ones disappear again.
import type { Page } from '@playwright/test'
import { expectStatus, parisDate, sendChange as change } from './support/api'
import { expect, test } from './support/fixtures'
import { makeAdministrator, testEmail, testId, testPassword } from './support/testData'

const email = testEmail('admin')
const saleId = testId('sale')
const catalogueId = testId('catalogue')
const title = `Céramiques ${saleId}`

const saleDate = parisDate(45)

async function openCalendar(page: Page): Promise<void> {
  await page.goto(`/calendar?month=${saleDate.slice(0, 7)}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Auction calendar' })).toBeVisible()
  // The month grid replaces its skeleton once the month's sales have loaded.
  await expect(page.getByRole('table')).toBeVisible()
}

test('an administrator publishes a sale, it appears on the site, and cancelling it removes it', async ({ page, request }) => {
  // `request` is the administrator, with its own cookies; `page` is a visitor.
  await test.step('an administrator signs in', async () => {
    await expectStatus(
      await change(request, 'POST', '/api/auth/register', {
        firstName: 'Agnès',
        lastName: 'Admin',
        email,
        password: testPassword,
        countryCode: 'FR',
      }),
      201,
    )
    makeAdministrator(email)
  })

  await test.step('a draft sale and its catalogue stay hidden from visitors', async () => {
    await expectStatus(
      await change(request, 'POST', '/api/auctions', {
        id: saleId,
        title,
        category: 'Ceramics',
        house: 'Maison Test',
        city: 'Paris 6e',
        saleDate,
        saleTime: '15:00',
        lotCount: 80,
        description: 'Faience and porcelain from a private collection.',
      }),
      201,
    )
    await expectStatus(
      await change(request, 'POST', '/api/catalogues', {
        id: catalogueId,
        auctionId: saleId,
        title: 'Faïences & porcelaines',
        lots: { first: 1, last: 80 },
        pdfUrl: 'https://example.com/catalogues/e2e.pdf',
      }),
      201,
    )

    await openCalendar(page)
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0)
    await page.goto(`/auctions/${saleId}`)
    await expect(page.getByRole('heading', { name: 'Auction not found' })).toBeVisible()
  })

  await test.step('once published, it shows in the calendar with its catalogue', async () => {
    await expectStatus(await change(request, 'PATCH', `/api/auctions/${saleId}`, { status: 'published' }), 200)

    await openCalendar(page)
    await page.getByRole('button', { name: new RegExp(title) }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /View catalogue/ })).toHaveAttribute('href', 'https://example.com/catalogues/e2e.pdf')
    await dialog.getByRole('link', { name: 'View details' }).click()

    await expect(page).toHaveURL(`/auctions/${saleId}`)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByText('80 lots')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Faïences & porcelaines' })).toBeVisible()
  })

  await test.step('cancelled, it disappears again', async () => {
    await expectStatus(await change(request, 'PATCH', `/api/auctions/${saleId}`, { status: 'cancelled' }), 200)
    await openCalendar(page)
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0)
  })

  await test.step('the catalogue and then the sale can be deleted', async () => {
    await expectStatus(await change(request, 'DELETE', `/api/auctions/${saleId}`), 409)
    await expectStatus(await change(request, 'DELETE', `/api/catalogues/${catalogueId}`), 204)
    await expectStatus(await change(request, 'DELETE', `/api/auctions/${saleId}`), 204)
  })
})
