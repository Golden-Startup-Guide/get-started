import type { Locator, Page } from '@playwright/test'
import { expect, test } from './helpers'

/**
 * The spec's handoff acceptance checks that a browser can verify (docs/ACCEPTANCE.md lists every
 * item, with these and the other tests that cover it, and the checks that need people).
 */

/** Presses Tab until the control has focus, as a keyboard user would. */
async function tabTo(page: Page, control: Locator, limit = 150) {
  for (let presses = 0; presses < limit; presses++) {
    if (await control.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${control}`)
}

test('a reader can go from Home to a note, follow a link, and come back, with the keyboard alone', async ({ page, browserName }) => {
  // Safari and WebKit skip buttons when tabbing unless the system setting says otherwise.
  test.skip(browserName === 'webkit', 'WebKit moves Tab only between links and fields by default')
  test.setTimeout(90_000)
  await page.goto('/')
  await tabTo(page, page.getByRole('region', { name: 'Explore libraries' }).getByRole('button', { name: /^Agriculture/ }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Agriculture', level: 1 })).toBeVisible()

  await tabTo(page, page.getByRole('button', { name: 'Open shelf Keeping animals' }))
  await page.keyboard.press('Enter')
  await tabTo(page, page.getByRole('button', { name: 'Open notebook Backyard Chickens' }))
  await page.keyboard.press('Enter')
  const opener = page.getByRole('region', { name: 'Contents' }).getByRole('button', { name: /Feeding chickens/ })
  await tabTo(page, opener)
  await page.keyboard.press('Enter')
  const reader = page.getByRole('dialog', { name: 'Feeding chickens' })
  await expect(reader).toBeVisible()

  // A link in the text leads to another note; Back returns.
  await tabTo(page, reader.getByRole('link', { name: 'Keeping chickens healthy' }).first())
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Keeping chickens healthy' })).toBeVisible()
  // The browser's Back (Alt+Left is the browser's own shortcut, which tests cannot press).
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Feeding chickens' })).toBeVisible()

  // Escape closes the reader and puts focus back on the item that opened it.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('on a tablet, reading needs no sideways scrolling and the sidebar opens over the page', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 })
  await page.goto('/#/notebook/core-everyday-nutrition?note=core-a-balanced-plate')
  const reader = page.getByRole('dialog', { name: 'A balanced plate' })
  await expect(reader.getByRole('img', { name: /plate divided/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await reader.getByRole('button', { name: 'Close note' }).first().click()

  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Primary navigation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Primary navigation' })).toHaveCount(0)
})

test('in a high-contrast mode, the current page and focus stay marked', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium emulates forced colours')
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/#/notes')
  // Marked by a background in the normal themes, which high-contrast modes remove.
  // Once the page has settled on All Notes (it can start on Home while the address is read).
  await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
  const current = page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('button', { name: /^All Notes/ })
  await expect(current).toHaveClass(/nav-button-active/)
  await expect.poll(() => current.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
})

test('when the system asks for less motion, nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/notes')
  const button = page.locator('.nav-button').first()
  await expect(button).toBeVisible()
  const seconds = await button.evaluate((element) => Math.max(...getComputedStyle(element).transitionDuration.split(',').map((value) => parseFloat(value))))
  expect(seconds).toBeLessThan(0.01)
})
