// The agent reviews a customer's bid request on the website: accepts it, records the bid and the
// result. The lot shows as reserved to the public meanwhile, and the customer sees each status but
// never the agent's notes.
import { expectStatus, parisDate, sendChange } from './support/api'
import { expect, test } from './support/fixtures'
import { latestEmailLink, makeAdministrator, testEmail, testId, testPassword } from './support/testData'

const adminEmail = testEmail('reviewer')
const customerEmail = testEmail('bidder')
const saleId = testId('review-sale')
const catalogueId = testId('review-catalogue')
const saleTitle = `Faïences ${saleId}`
const note = 'Condition report checked with the house.'

test('the agent accepts a request, records the bid and the result, and the customer follows along', async ({
  page,
  request: adminApi,
  playwright,
}) => {
  const customerApi = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })

  await test.step('an administrator publishes a sale taking place today', async () => {
    await expectStatus(
      await sendChange(adminApi, 'POST', '/api/auth/register', {
        firstName: 'Agnès',
        lastName: 'Reviewer',
        email: adminEmail,
        password: testPassword,
        countryCode: 'FR',
      }),
      201,
    )
    makeAdministrator(adminEmail)
    // Earlier today, so the sale is still open for requests and a result can already be recorded.
    await expectStatus(
      await sendChange(adminApi, 'POST', '/api/auctions', {
        id: saleId,
        title: saleTitle,
        category: 'Ceramics',
        house: 'Maison Test',
        city: 'Paris 6e',
        saleDate: parisDate(0),
        saleTime: '00:01',
        description: 'Faience and porcelain.',
        status: 'published',
      }),
      201,
    )
    await expectStatus(
      await sendChange(adminApi, 'POST', '/api/catalogues', {
        id: catalogueId,
        auctionId: saleId,
        title: 'Faïences & porcelaines',
        lots: { first: 1, last: 50 },
        pdfUrl: 'https://example.com/catalogues/review.pdf',
      }),
      201,
    )
  })

  await test.step('a customer with a confirmed email requests a bid on lot 7', async () => {
    await expectStatus(
      await sendChange(customerApi, 'POST', '/api/auth/register', {
        firstName: 'Hugo',
        lastName: 'Lefèvre',
        email: customerEmail,
        password: testPassword,
        countryCode: 'BE',
      }),
      201,
    )
    const token = latestEmailLink(customerEmail, 'verify-email').split('#token=')[1]
    await expectStatus(await sendChange(customerApi, 'POST', '/api/auth/email-verification', { token }), 200)
    await expectStatus(
      await sendChange(customerApi, 'POST', '/api/bid-requests', {
        auctionId: saleId,
        catalogueId,
        lotNumber: 7,
        maxBidEur: 1200,
        instructions: '',
        acknowledgedCharges: true,
      }),
      201,
    )
  })

  const reviewButton = page.getByRole('button', { name: 'Review lot 7 for Hugo Lefèvre' })
  const dialog = page.getByRole('dialog')

  await test.step('the administrator accepts it from the review page, with a note', async () => {
    await page.goto('/sign-in')
    await page.getByLabel('Email address').fill(adminEmail)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(testPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('banner').getByRole('link', { name: 'Review requests' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Bid requests' })).toBeVisible()

    await reviewButton.click()
    await expect(dialog.getByRole('heading', { name: saleTitle })).toBeVisible()
    await expect(dialog.getByText(customerEmail)).toBeVisible()
    await expect(dialog.getByText('€1,200')).toBeVisible()
    await expect(dialog.getByText('Submitted', { exact: true })).toBeVisible()
    await dialog.getByLabel('Note').fill(note)
    await dialog.getByRole('button', { name: 'Accept' }).click()

    await expect(dialog).toBeHidden()
    // Focus moves to the confirmation, so screen readers announce it.
    await expect(page.locator(':focus')).toContainText(`Lot 7 in ${saleTitle} is now marked “Accepted”.`)
  })

  await test.step('the lot shows as reserved on the public list', async () => {
    await page.goto('/requested-lots')
    const row = page
      .getByRole('row')
      .filter({ hasText: saleTitle })
      .filter({ has: page.getByRole('cell', { name: '7', exact: true }) })
    await expect(row).toContainText('Reserved')
    await expect(page.getByRole('main')).not.toContainText('Lefèvre')
  })

  await test.step('the administrator records the bid, then the result', async () => {
    await page.goto('/admin/requests?view=accepted')
    await reviewButton.click()
    await expect(dialog.getByText(note)).toBeVisible()
    await dialog.getByRole('button', { name: 'Record bid placed' }).click()
    await expect(page.getByText(`Lot 7 in ${saleTitle} is now marked “Bid placed”.`)).toBeVisible()

    await page.getByRole('link', { name: 'Bid placed' }).click()
    await reviewButton.click()
    await dialog.getByRole('button', { name: 'Record won' }).click()
    await expect(page.getByText(`Lot 7 in ${saleTitle} is now marked “Won”.`)).toBeVisible()

    await page.getByRole('link', { name: 'Closed' }).click()
    await reviewButton.click()
    await expect(dialog.getByText('“Won” is final, so this request won\'t change again.')).toBeVisible()
    await expect(dialog.getByRole('listitem')).toHaveCount(4)
  })

  await test.step('the customer sees the result, but not the notes', async () => {
    const response = await customerApi.get('/api/bid-requests')
    const text = await response.text()
    expect(text).toContain('"status":"won"')
    expect(text).not.toContain(note)
    // Customers can't reach the review API.
    await expectStatus(await customerApi.get('/api/admin/bid-requests'), 403)
  })

  await customerApi.dispose()
})
