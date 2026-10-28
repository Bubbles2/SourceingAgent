// A customer's whole journey, in order: register, confirm the email, request bids, follow them,
// sign out and in, and reset a forgotten password. The tests share one account, so they run serially.
import type { Page } from '@playwright/test'
import { expect, test } from './support/fixtures'
import { latestEmailLink, testEmail, testPassword } from './support/testData'

test.describe.configure({ mode: 'serial' })

const email = testEmail('customer')
const newPassword = 'a brand new passphrase'
// Chrome computes "Inès , your account": the hidden ", your account" is positioned on its own
const accountLinkName = /^Inès\s*, your account$/
const requestBidUrl ='/request-bid?auction=vauclair-tableaux-anciens-2026-11&catalogue=vauclair-tableaux-anciens'

async function requestBid(page: Page, lot: string, maxBid: string): Promise<void> {
  await page.getByLabel('Lot number').fill(lot)
  await page.getByLabel('Maximum bid (EUR)').fill(maxBid)
  await page.getByRole('checkbox', { name: /I understand that my maximum bid is the hammer price only/ }).check()
  await page.getByRole('button', { name: 'Submit request' }).click()
}

// Labels end in a decorative "*", so exact matches use the accessible name, as screen readers hear it.
async function signIn(page: Page, password: string): Promise<void> {
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a new customer registers, confirms their email and requests a bid', async ({ page }) => {
  await test.step('an empty form lists every problem and takes focus', async () => {
    await page.goto('/register')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'There are 6 problems creating your account' })).toBeVisible()
    await expect(page.locator('.error-summary')).toBeFocused()
  })

  await test.step('registering signs the customer in', async () => {
    await page.getByLabel('First name').fill('Inès')
    await page.getByLabel('Last name').fill('Laurent')
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(testPassword)
    await page.getByLabel('Confirm password').fill(testPassword)
    await page.getByLabel('Country').selectOption('FR')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL('/account')
    await expect(page.getByText('Account created.')).toBeVisible()
    await expect(page.getByRole('banner').getByRole('link', { name: accountLinkName })).toBeVisible()
  })

  await test.step('bids need a confirmed email address', async () => {
    await page.goto(requestBidUrl)
    await expect(page.getByText('Confirm your email address to request bids.')).toBeVisible()
    await expect(page.getByLabel('Lot number')).toHaveCount(0)
  })

  await test.step('the emailed link confirms the address and leaves no token in the address bar', async () => {
    await page.goto(latestEmailLink(email, 'verify-email'))
    await expect(page.getByRole('heading', { name: 'Email address confirmed' })).toBeVisible()
    await expect(page).toHaveURL('/verify-email')
  })

  await test.step("a lot another customer's accepted request reserves is refused", async () => {
    await page.goto(requestBidUrl)
    await expect(page.getByRole('combobox', { name: 'Auction', exact: true })).toHaveValue('vauclair-tableaux-anciens-2026-11')
    await expect(page.getByRole('combobox', { name: 'Catalogue', exact: true })).toHaveValue('vauclair-tableaux-anciens')
    await requestBid(page, '45', '4000')
    await expect(page.getByText(/^Lot 45 already has an accepted request from another customer/).first()).toBeVisible()
  })

  await test.step('a free lot is accepted for review', async () => {
    await requestBid(page, '50', '4000')
    await expect(page.getByRole('heading', { name: 'Request submitted' })).toBeVisible()
    await expect(page.getByText('€4,000')).toBeVisible()
    await expect(page.getByText('Pending review')).toBeVisible()
  })

  await test.step('My requests lists the request, and only theirs', async () => {
    await page.getByRole('link', { name: 'View my requests' }).click()
    await expect(page.getByRole('heading', { name: '1 request, newest first' })).toBeVisible()
    const row = page.getByRole('row').filter({ hasText: 'Tableaux anciens & dessins' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('€4,000')
    await expect(row).toContainText('Pending review')
  })

  await test.step('the same lot cannot be requested twice', async () => {
    await page.goto(requestBidUrl)
    await requestBid(page, '50', '5000')
    await expect(page.getByText(/^You already have a request for lot 50 in this catalogue/).first()).toBeVisible()
  })
})

test('the same email address cannot register twice', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('First name').fill('Someone')
  await page.getByLabel('Last name').fill('Else')
  await page.getByLabel('Email address').fill(email.toUpperCase())
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(testPassword)
  await page.getByLabel('Confirm password').fill(testPassword)
  await page.getByLabel('Country').selectOption('GB')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/register')
  await expect(page.getByText(/^An account already exists for this email address/).first()).toBeVisible()
})

test('a wrong password is refused, and signing in returns to the page they wanted', async ({ page }) => {
  await page.goto('/my-requests')
  await signIn(page, 'not the right password')
  await expect(page.getByText('The email address or password is incorrect.')).toBeVisible()

  await signIn(page, testPassword)
  await expect(page).toHaveURL('/my-requests')
  await expect(page.getByRole('heading', { name: '1 request, newest first' })).toBeVisible()

  await page.getByRole('banner').getByRole('link', { name: accountLinkName }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('a forgotten password is reset from the emailed link', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  await page.goto(latestEmailLink(email, 'reset-password'))
  await expect(page).toHaveURL('/reset-password')
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible()

  await page.getByRole('link', { name: 'Sign in', exact: true }).last().click()
  await signIn(page, testPassword)
  await expect(page.getByText('The email address or password is incorrect.')).toBeVisible()
  await signIn(page, newPassword)
  await expect(page).toHaveURL('/account')
})
