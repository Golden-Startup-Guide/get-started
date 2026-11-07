import type { Page } from '@playwright/test'
import { expect, test } from './helpers'

const STAYING_HYDRATED = '/#/notebook/core-everyday-nutrition?note=core-staying-hydrated'

/** How many characters fit on the first line of the reading column's first paragraph. */
function firstLineLength(page: Page) {
  return page.evaluate(() => {
    const text = document.querySelector('.reader-column .prose-notes p')?.firstChild
    if (!text?.textContent) return 0
    const range = document.createRange()
    let top: number | undefined
    for (let index = 0; index < text.textContent.length; index += 1) {
      range.setStart(text, index)
      range.setEnd(text, index + 1)
      const rect = range.getBoundingClientRect()
      if (top === undefined) top = rect.top
      else if (rect.top > top + 2) return index
    }
    return text.textContent.length
  })
}

test('reads at a comfortable line length, with the notes before and after by name', async ({ page }) => {
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(STAYING_HYDRATED)
    await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
    // The design specification asks for 62–72 characters a line; a line breaks at a word, so a
    // little under is expected.
    const length = await firstLineLength(page)
    expect(length, `characters on a line at ${width} px`).toBeGreaterThanOrEqual(56)
    expect(length, `characters on a line at ${width} px`).toBeLessThanOrEqual(74)
  }

  const reader = page.getByRole('dialog', { name: 'Staying hydrated' })
  await expect(reader.getByText('Note 1 of 4')).toBeVisible()
  await expect(reader.getByRole('complementary', { name: 'Note' })).toContainText('Needs differ from person to person.')
  const pages = reader.getByRole('navigation', { name: 'In this notebook' })
  await pages.getByRole('button', { name: /Next\s*Water through the day/ }).click()
  const next = page.getByRole('dialog', { name: 'Water through the day' })
  await expect(next.getByText('Note 2 of 4')).toBeVisible()
  await expect(next.getByRole('complementary', { name: 'Tip' })).toBeVisible()
  await next.getByRole('navigation', { name: 'In this notebook' }).getByRole('button', { name: /Previous\s*Staying hydrated/ }).click()
  await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
})

test('reading settings take effect at once, are remembered, and can be reset', async ({ page }) => {
  await page.goto(STAYING_HYDRATED)
  const reader = page.getByRole('dialog', { name: 'Staying hydrated' })
  const column = page.locator('.reader-column')
  const fontSize = () => column.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  const before = await fontSize()

  const open = reader.getByRole('button', { name: 'Reading settings', exact: true })
  await open.click()
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  const settings = reader.getByRole('region', { name: 'Reading settings' })
  await settings.getByRole('group', { name: 'Text size' }).getByRole('radio', { name: 'Larger' }).check()
  await settings.getByRole('group', { name: 'Text style' }).getByRole('radio', { name: 'Simple' }).check()
  expect(await fontSize()).toBeGreaterThan(before * 1.2)
  await expect(column).toHaveClass(/reader-font-simple/)
  // Escape closes the settings first, returning to their button, then the note.
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect(open).toBeFocused()

  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
  expect(await fontSize()).toBeGreaterThan(before * 1.2)
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click()
  await page.getByRole('button', { name: 'Reset reading settings' }).click()
  await expect.poll(fontSize).toBe(before)
  await expect(page.getByRole('radio', { name: 'Medium' }).first()).toBeChecked()
})

test('reopens a note where the reader left off', async ({ page }) => {
  // A short window, so the note scrolls.
  await page.setViewportSize({ width: 1000, height: 420 })
  await page.goto(STAYING_HYDRATED)
  const scroller = page.locator('.reader-scroll')
  await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
  expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const atEnd = await scroller.evaluate((element) => element.scrollTop)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Close note' }).first().click()

  await page.getByRole('region', { name: 'Contents' }).getByRole('button', { name: /Staying hydrated/ }).click()
  await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
  await expect.poll(() => page.locator('.reader-scroll').evaluate((element) => element.scrollTop)).toBeGreaterThan(atEnd - 20)
})

test('nothing scrolls sideways at 200 % zoom, and the settings open as a sheet on a phone', async ({ page }) => {
  // 200 % zoom on a 1280 px window lays the page out at 640 px.
  await page.setViewportSize({ width: 640, height: 800 })
  await page.goto(STAYING_HYDRATED)
  await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
  const sideways = () => page.evaluate(() => [document.documentElement, document.querySelector('.reader-scroll')!]
    .some((element) => element.scrollWidth > element.clientWidth + 1))
  expect(await sideways()).toBe(false)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await sideways()).toBe(false)
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click()
  const sheet = page.getByRole('region', { name: 'Reading settings' })
  const box = (await sheet.boundingBox())!
  expect(box.y + box.height).toBeGreaterThan(844 - 2)
})
