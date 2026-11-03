import { expect, expectSaved, openWorkspace, test } from './helpers'

test('highlights fenced code in the preview, loading the highlighter only when needed', async ({ page }) => {
  const highlighterRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/highlighter-[\w-]+\.js$/.test(request.url())) highlighterRequests.push(request.url())
  })
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Script')
  const preview = page.locator('.prose-notes')

  await page.getByRole('textbox', { name: 'Markdown' }).fill('Just text and `inline code`.')
  await expectSaved(page)
  await expect(preview).toContainText('Just text')
  expect(highlighterRequests).toEqual([])

  await page.getByRole('textbox', { name: 'Markdown' }).fill('```js\nconst total = 1 // sum\n```')
  await expect(preview.locator('.hljs-keyword')).toHaveText('const')
  await expect(preview.locator('.hljs-comment')).toHaveText('// sum')
  await expect(preview.locator('pre code')).toHaveText('const total = 1 // sum')
  expect(highlighterRequests).toHaveLength(1)
})

test('lists a note’s headings and jumps to them, also from links in the note', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Season plan')
  const filler = 'A paragraph of notes to make the note tall enough to scroll. '.repeat(30)
  await page.getByRole('textbox', { name: 'Markdown' }).fill(
    `# Spring\n\nJump to [the harvest](#heading-harvest).\n\n${filler}\n\n## Seeds\n\n${filler}\n\n## Planting\n\n${filler}\n\n## Harvest\n\nPick everything.`,
  )
  await expectSaved(page)

  const preview = page.locator('.prose-notes')
  const harvest = preview.getByRole('heading', { name: 'Harvest' })
  await preview.getByRole('button', { name: /Contents/ }).click()
  const contents = preview.getByRole('navigation', { name: 'Contents' })
  await expect(contents.getByRole('link')).toHaveText(['Spring', 'Seeds', 'Planting', 'Harvest'])

  await contents.getByRole('link', { name: 'Harvest' }).click()
  await expect(harvest).toBeFocused()
  await expect(harvest).toBeInViewport()

  await contents.getByRole('link', { name: 'Spring' }).click()
  await expect(harvest).not.toBeInViewport()
  await preview.getByRole('link', { name: 'the harvest' }).click()
  await expect(harvest).toBeInViewport()
})
