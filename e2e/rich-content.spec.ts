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
