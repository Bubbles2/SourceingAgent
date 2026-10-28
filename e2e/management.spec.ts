// The agent manages the site from the administration area: the dashboard, a sale created from a day
// on the calendar, its catalogue and PDF link, request filters and cancelling the sale. Customers
// are kept out of every administration page and endpoint.
import { expectStatus, parisDate, sendChange } from './support/api'
import { expect, test } from './support/fixtures'
import { makeAdministrator, testEmail, testId, testPassword } from './support/testData'

const adminEmail = testEmail('manager')
const saleId = testId('managed-sale')
const catalogueId = testId('managed-catalogue')
const saleTitle = `Verrerie ${saleId}`
const catalogueTitle = 'Verres & cristaux'
const saleDate = parisDate(40)

/** "Monday, 7 December 2026", as the calendar's day links name their date */
const longSaleDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${saleDate}T00:00:00Z`))

test('an administrator creates a sale from the calendar, adds its catalogue, then cancels the sale', async ({
  page,
  request: adminApi,
  playwright,
}) => {
  const visitorApi = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })

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
    for (const card of ['Upcoming auctions', 'Published catalogues', 'Pending bid requests', 'Accepted requests', 'Completed auctions']) {
      await expect(page.getByRole('link', { name: new RegExp(card) })).toBeVisible()
    }
  })

  await test.step('a day on the calendar opens the new-auction form with its date filled in', async () => {
    await page.goto(`/calendar?month=${saleDate.slice(0, 7)}`)
    await page.getByRole('link', { name: `Add an auction on ${longSaleDate}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'New auction' })).toBeVisible()
    await expect(page.getByLabel('Sale date')).toHaveValue(saleDate)
  })

  await test.step('the form checks the details, then creates the published sale', async () => {
    await page.getByRole('button', { name: 'Create auction' }).click()
    await expect(page.getByRole('heading', { name: /problems creating the auction/ })).toBeVisible()

    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(saleTitle)
    await page.getByLabel('Category').fill('Glass')
    await page.getByLabel('Auction house').fill('Maison Test')
    await page.getByLabel('City or district').fill('Paris 7e')
    await page.getByLabel('Sale time').fill('15:00')
    await page.getByLabel('Number of lots').fill('120')
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Art Nouveau and Art Deco glass from a private collection.')
    await page.getByRole('combobox', { name: 'Status' }).selectOption('published')
    await page.getByLabel('Web address').fill(saleId)
    await page.getByRole('button', { name: 'Create auction' }).click()

    await expect(page).toHaveURL(`/admin/auctions/${saleId}`)
    await expect(page.getByText('Auction created.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: saleTitle })).toBeVisible()
    await expect(page.getByText('Published', { exact: true })).toBeVisible()
  })

  await test.step('a catalogue is added to the sale, and its PDF link corrected', async () => {
    await page.getByRole('link', { name: 'Add catalogue' }).click()
    await expect(page.getByRole('combobox', { name: 'Sale' })).toHaveValue(saleId)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(catalogueTitle)
    await page.getByLabel('Last lot').fill('120')
    await page.getByLabel('PDF address').fill('https://example.com/catalogues/first-draft.pdf')
    await page.getByLabel('Catalogue id').fill(catalogueId)
    await page.getByRole('button', { name: 'Add catalogue' }).click()
    await expect(page.getByText(`Catalogue “${catalogueTitle}” added.`)).toBeVisible()

    await page.getByRole('link', { name: `Edit ${catalogueTitle}` }).click()
    await page.getByLabel('PDF address').fill('https://example.com/catalogues/final.pdf')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`Catalogue “${catalogueTitle}” saved.`)).toBeVisible()
    await expect(page.getByRole('link', { name: /Open PDF/ })).toHaveAttribute('href', 'https://example.com/catalogues/final.pdf')
  })

  await test.step('the sale and its catalogue are on the public site', async () => {
    const response = await visitorApi.get(`/api/auctions/${saleId}`)
    await expectStatus(response, 200)
    expect(await response.text()).toContain('https://example.com/catalogues/final.pdf')
  })

  await test.step('requests can be filtered by sale', async () => {
    await page.goto('/admin/requests?view=all')
    await page.getByLabel('Sale').selectOption(saleId)
    await page.getByRole('button', { name: 'Filter' }).click()
    await expect(page).toHaveURL(new RegExp(`auction=${saleId}`))
    await expect(page.getByText('No requests match these filters')).toBeVisible()
  })

  await test.step('the details are edited, then the sale is cancelled and leaves the website', async () => {
    await page.goto(`/admin/auctions/${saleId}`)
    await page.getByRole('link', { name: 'Edit details' }).click()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(`${saleTitle} (vente du soir)`)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: `${saleTitle} (vente du soir)` })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel sale' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel sale' }).click()
    await expect(page.getByText('The sale is cancelled and no longer on the website.')).toBeVisible()
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
    await expectStatus(await visitorApi.get(`/api/auctions/${saleId}`), 404)
  })

  await visitorApi.dispose()
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

  for (const path of ['/admin', '/admin/auctions', `/admin/auctions/new?date=${saleDate}`, '/admin/catalogues/new', '/admin/requests']) {
    await customerPage.goto(path)
    await expect(customerPage.getByRole('heading', { level: 1, name: 'Administrators only' })).toBeVisible()
  }
  await expect(customerPage.getByRole('banner').getByRole('link', { name: 'Administration' })).toHaveCount(0)

  await expectStatus(await customerPage.request.get('/api/admin/summary'), 403)
  await expectStatus(await sendChange(customerPage.request, 'POST', '/api/auctions', { id: testId('sneaky') }), 403)

  // No shortcuts to create sales on the calendar either
  await customerPage.goto(`/calendar?month=${saleDate.slice(0, 7)}`)
  await expect(customerPage.getByRole('table')).toBeVisible()
  await expect(customerPage.getByRole('link', { name: /Add an auction on/ })).toHaveCount(0)
  await context.close()
})
