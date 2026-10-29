// Phone-sized screens (390 × 844).
import { expect, test } from './support/fixtures'

test('the header collapses into a menu', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Menu' })
  const calendarLink = page.getByRole('banner').getByRole('link', { name: 'Calendar', exact: true })

  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(calendarLink).toBeHidden()

  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await calendarLink.click()
  await expect(page).toHaveURL(/\/calendar/)
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
})

test('pages fit the screen without sideways scrolling', async ({ page }) => {
  for (const path of ['/', '/auctions', '/lots', '/calendar', '/requested-lots', '/sign-in', '/register', '/forgot-password']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0)
  }
})
