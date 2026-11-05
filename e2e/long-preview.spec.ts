import { expect, expectSaved, openWorkspace, test } from './helpers'

// Notes over 50,000 characters are parsed for the preview in a Web Worker.
test('previews a long note from a worker and catches up after a pause in typing', async ({ page }) => {
  await openWorkspace(page)
  const paragraph = 'Seeds and soil notes for the garden season, with enough words to fill a line or two. '.repeat(8)
  const body = Array.from({ length: 90 }, (_, index) => `## Section ${index + 1}\n\n${paragraph}`).join('\n\n')
  expect(body.length).toBeGreaterThan(50_000)

  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Long garden log')
  await page.getByRole('textbox', { name: 'Note text' }).fill(`- [ ] Order seeds\n\n${body}`)
  await expectSaved(page)

  const preview = page.locator('.prose-notes')
  await expect(preview.getByRole('heading', { name: 'Section 90' })).toBeAttached()
  await expect(preview.getByRole('checkbox', { name: 'Mark task Order seeds complete' })).toBeEnabled()

  // Typing makes the preview stale until a pause, then it shows the new text.
  const editor = page.getByRole('textbox', { name: 'Note text' })
  await editor.press('ControlOrMeta+End')
  await page.keyboard.type('\n\n## Harvest day')
  await expect(page.getByText('Long note: the preview updates when you pause typing')).toBeVisible()
  await expect(preview.getByRole('heading', { name: 'Harvest day' })).toBeAttached()
  await expect(page.getByText('Long note: the preview updates when you pause typing')).toHaveCount(0)

  // Ticking the task in the preview edits the text.
  await preview.getByRole('checkbox', { name: 'Mark task Order seeds complete' }).click()
  await expect(page.getByRole('progressbar', { name: 'Checklist progress' })).toHaveText('1 of 1 complete')
})
