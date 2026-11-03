import { expect, openWorkspace, test } from './helpers'

test('jots a quick note from any page into the Inbox without leaving it', async ({ page }) => {
  await openWorkspace(page)
  // Start on another page, to check the quick note does not navigate away.
  await page.getByRole('button', { name: /^Favorites/ }).click()
  await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeVisible()

  await page.keyboard.press('Alt+n')
  const box = page.getByRole('dialog', { name: 'Quick note' })
  const input = box.getByRole('textbox', { name: 'Quick note' })
  await expect(input).toBeFocused()
  await input.fill('Call the plumber\nAbout the leak under the sink.')

  // Escape keeps the text for next time.
  await page.keyboard.press('Escape')
  await expect(box).toHaveCount(0)
  await page.getByRole('button', { name: 'Quick note' }).click()
  await expect(input).toHaveValue('Call the plumber\nAbout the leak under the sink.')

  await input.press('ControlOrMeta+Enter')
  await expect(box).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Saved “Call the plumber” to Inbox.')
  await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeVisible()

  // It is in the new Inbox notebook, and the box starts empty again.
  const inbox = page.getByRole('navigation', { name: 'Libraries' }).getByRole('button', { name: /^Inbox 1/ })
  await expect(inbox).toBeVisible()
  await inbox.click()
  await expect(page.getByRole('heading', { name: 'Call the plumber' })).toBeVisible()
  await page.keyboard.press('Alt+n')
  await expect(input).toHaveValue('')
  await expect(box.getByRole('button', { name: 'Save' })).toBeDisabled()
})
