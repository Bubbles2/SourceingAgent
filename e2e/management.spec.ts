// The agent's administration area: the dashboard and filtering bid requests by sale. Sales come from
// the auction monitor, so nothing here creates or edits them. Customers are kept out of every
// administration page and endpoint.
import { expectStatus, parisDate, sendChange } from './support/api'
import { expect, test } from './support/fixtures'
import { addTestSale, makeAdministrator, testEmail, testId, testPassword } from './support/testData'

const adminEmail = testEmail('manager')
const saleId = testId('managed-sale')

test('an administrator opens the dashboard and filters requests by sale', async ({ page, request: adminApi }) => {
  const sale = addTestSale(saleId, { daysAhead: 40 })

  await test.step('the administrator signs in and opens the dashboard', async () => {
    await expectStatus(
      await sendChange(adminApi, 'POST', '/api/auth/register', {
        firstName: 'Margaux',
        lastName: 'Manager',
        email: adminEmail,
        password: testPassword,
        countryCode: 'FR',
      }),
      201,
    )
    makeAdministrator(adminEmail)
    await page.goto('/sign-in')
    await page.getByLabel('Email address').fill(adminEmail)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(testPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('banner').getByRole('link', { name: 'Administration' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    for (const card of ['Upcoming auctions', 'Lots in upcoming sales', 'Pending bid requests', 'Accepted requests', 'Completed auctions']) {
      await expect(page.getByRole('link', { name: new RegExp(card) })).toBeVisible()
    }
    const navigation = page.getByRole('navigation', { name: 'Administration' })
    await expect(navigation.getByRole('link')).toHaveText(['Dashboard', 'Bid requests'])
  })

  await test.step('requests can be filtered by sale', async () => {
    await page.goto('/admin/requests?view=all')
    await page.getByLabel('Sale').selectOption(sale.auctionId)
    await page.getByRole('button', { name: 'Filter' }).click()
    await expect(page).toHaveURL(new RegExp(`auction=${sale.auctionId}`))
    await expect(page.getByText('No requests match these filters')).toBeVisible()
  })
})

test('customers are kept out of every administration page and endpoint', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' })
  const customerPage = await context.newPage()
  // The page's request context shares the browser's cookies, so this signs the page in too.
  await expectStatus(
    await sendChange(customerPage.request, 'POST', '/api/auth/register', {
      firstName: 'Clara',
      lastName: 'Customer',
      email: testEmail('not-an-admin'),
      password: testPassword,
      countryCode: 'IE',
    }),
    201,
  )

  for (const path of ['/admin', '/admin/requests', '/admin/requests?view=all']) {
    await customerPage.goto(path)
    await expect(customerPage.getByRole('heading', { level: 1, name: 'Administrators only' })).toBeVisible()
  }
  await expect(customerPage.getByRole('banner').getByRole('link', { name: 'Administration' })).toHaveCount(0)

  await expectStatus(await customerPage.request.get('/api/admin/summary'), 403)
  await expectStatus(await customerPage.request.get('/api/admin/bid-requests'), 403)
  // Sales can't be created through the API at all any more.
  await expectStatus(await sendChange(customerPage.request, 'POST', '/api/auctions', { id: testId('sneaky') }), 404)

  // No shortcuts to create sales on the calendar either
  await customerPage.goto(`/calendar?month=${parisDate(40).slice(0, 7)}`)
  await expect(customerPage.getByRole('table')).toBeVisible()
  await expect(customerPage.getByRole('link', { name: /Add an auction on/ })).toHaveCount(0)
  await context.close()
})
