import { expect, expectSaved, markdownText, openWorkspace, test } from './helpers'

test('formats Markdown as you write, ticks tasks in the editor, and remembers Source view', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Garden plan')
  const editor = page.getByRole('textbox', { name: 'Note text' })
  await editor.fill('# Spring\nBuy **compost** soon\n- [ ] Water the seedlings')
  await expectSaved(page)

  // Live is the default; leave the editor so no line is being edited.
  await expect(page.getByRole('button', { name: 'Formatted' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: 'Note title' }).click()
  const lines = page.locator('.cm-line')
  await expect(lines.nth(0)).toHaveText('Spring')
  await expect(lines.nth(0)).toHaveClass(/cm-lp-h1/)
  await expect(lines.nth(1)).toHaveText('Buy compost soon')

  // Marks show only where the cursor is: inside the bold word, not elsewhere on its line.
  await lines.nth(1).click()
  await page.keyboard.press('End')
  await expect(lines.nth(1)).toHaveText('Buy compost soon')
  await lines.nth(1).getByText('compost').click()
  await expect(lines.nth(1)).toHaveText('Buy **compost** soon')

  // Ticking the checkbox edits the text and saves.
  await page.locator('.cm-lp-checkbox').click()
  await expectSaved(page)
  await expect(page.getByRole('progressbar', { name: 'Checklist progress' })).toHaveText('1 of 1 complete')

  // markdownText switches to Source; the choice is remembered after a reload.
  expect(await markdownText(page)).toBe('# Spring\nBuy **compost** soon\n- [x] Water the seedlings')
  // The note is in the page's address, so the reload opens it again.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Garden plan')
  await expect(page.getByRole('button', { name: 'Plain text' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cm-line').nth(0)).toHaveText('# Spring')
})
