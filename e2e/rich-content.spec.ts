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

  await page.getByRole('textbox', { name: 'Note text' }).fill('Just text and `inline code`.')
  await expectSaved(page)
  await expect(preview).toContainText('Just text')
  expect(highlighterRequests).toEqual([])

  await page.getByRole('textbox', { name: 'Note text' }).fill('```js\nconst total = 1 // sum\n```')
  // On-demand downloads can be slow on a busy test machine.
  await expect(preview.locator('.hljs-keyword')).toHaveText('const', { timeout: 30_000 })
  await expect(preview.locator('.hljs-comment')).toHaveText('// sum')
  await expect(preview.locator('pre code')).toHaveText('const total = 1 // sum')
  expect(highlighterRequests).toHaveLength(1)
})

test('typesets maths, downloading KaTeX only for notes that use it, and leaves prices alone', async ({ page }) => {
  const mathRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/(mathRenderer-|KaTeX_)/.test(request.url())) mathRequests.push(request.url())
  })
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Budget')
  const preview = page.locator('.prose-notes')

  await page.getByRole('textbox', { name: 'Note text' }).fill('Seeds cost $5 and compost $10.')
  await expectSaved(page)
  await expect(preview).toHaveText('Seeds cost $5 and compost $10.')
  expect(mathRequests).toEqual([])

  await page.getByRole('textbox', { name: 'Note text' }).fill('Area: $$\\pi r^2$$\n\n$$\n\\frac{1}{3}\n$$')
  await expect(preview.locator('.math-inline .katex')).toBeVisible({ timeout: 30_000 })
  await expect(preview.locator('.math-display .katex-display')).toBeVisible()
  // The fonts load too (under the app's Content Security Policy, checked by the test fixture).
  await expect.poll(() => mathRequests.some((url) => url.includes('KaTeX_'))).toBe(true)
})

test('draws Mermaid diagrams, downloading Mermaid only for notes that have one', async ({ page }) => {
  const diagramRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/diagramRenderer-/.test(request.url())) diagramRequests.push(request.url())
  })
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Garden flow')
  const preview = page.locator('.prose-notes')

  await page.getByRole('textbox', { name: 'Note text' }).fill('```text\nflowchart LR\n```')
  await expectSaved(page)
  await expect(preview.locator('pre code')).toHaveText('flowchart LR')
  expect(diagramRequests).toEqual([])

  await page.getByRole('textbox', { name: 'Note text' }).fill('```mermaid\nflowchart LR\n  Seeds --> Sow --> Harvest\n```\n\n```mermaid\nflowchart LR\n  A -->\n```')
  const drawing = preview.locator('.diagram-drawing svg')
  await expect(drawing).toHaveCount(1, { timeout: 30_000 })
  await expect(drawing).toContainText('Harvest')
  await expect(preview.getByRole('note')).toHaveText(/^Diagram error: Parse error on line \d+$/)
  expect(diagramRequests).toHaveLength(1)
})

test('lists a note’s headings and jumps to them, also from links in the note', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Season plan')
  const filler = 'A paragraph of notes to make the note tall enough to scroll. '.repeat(30)
  await page.getByRole('textbox', { name: 'Note text' }).fill(
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
