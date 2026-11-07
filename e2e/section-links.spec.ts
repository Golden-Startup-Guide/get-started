import { createNote, expect, expectSaved, openWorkspace, test } from './helpers'

const filler = 'A paragraph of notes to make the note tall enough to scroll. '.repeat(25)

test('follows [[Note#Section]] links to the heading, suggests headings, and jumps within a note', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Garden plan', `# Spring\n\n${filler}\n\n## Seeds\n\n${filler}\n\n## Harvest\n\nPick everything.`)

  // Typing [[Garden plan# suggests its headings.
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Calendar')
  const markdown = page.getByRole('textbox', { name: 'Note text' })
  await markdown.fill(`See [[#Notes]].\n\n${filler}\n\n## Notes\n\nPick on time: `)
  await markdown.press('ControlOrMeta+End')
  await page.keyboard.type('[[Garden plan#har')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Harvest'])
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await expectSaved(page)
  // The suggestion completed the link; scroll back up to the start of the preview.
  await page.locator('.prose-notes').getByRole('link', { name: 'Garden plan › Harvest' }).waitFor()

  // Within this note: [[#Notes]] jumps to its own heading.
  const preview = page.locator('.prose-notes')
  await preview.getByRole('link', { name: 'Notes', exact: true }).click()
  await expect(preview.getByRole('heading', { name: 'Notes' })).toBeFocused()
  await expect(preview.getByRole('heading', { name: 'Notes' })).toBeInViewport()

  // To another note: it opens there, at the heading, in the preview and the editor.
  await preview.getByRole('link', { name: 'Garden plan › Harvest' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Garden plan')
  const harvest = page.locator('.prose-notes').getByRole('heading', { name: 'Harvest' })
  await expect(harvest).toBeFocused()
  await expect(harvest).toBeInViewport()
  // The editor scrolled within itself to the heading's line, with the cursor there.
  await expect.poll(() => page.locator('.cm-scroller').evaluate((scroller) => {
    const line = Array.from(scroller.querySelectorAll('.cm-line')).find((element) => element.textContent?.includes('Harvest'))
    if (!line) return false
    const box = line.getBoundingClientRect()
    const area = scroller.getBoundingClientRect()
    return box.top >= area.top && box.bottom <= area.bottom
  })).toBe(true)

  // The section link counts as a link: Calendar is a backlink of Garden plan.
  await expect(page.getByRole('list', { name: 'Mentioned in' })).toContainText('Calendar')
})
