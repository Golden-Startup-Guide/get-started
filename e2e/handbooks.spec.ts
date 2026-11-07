import { expect, openWorkspace, test } from './helpers'

test('reads a built-in handbook, follows its links, and cannot change it', async ({ page }) => {
  await openWorkspace(page)
  const handbooks = page.getByRole('navigation', { name: 'Handbooks' })
  await handbooks.getByRole('button', { name: /^Health & Wellbeing/ }).click()
  await expect(page.getByRole('heading', { name: 'Health & Wellbeing', level: 1 })).toBeVisible()
  await expect(page.getByText('Clear, practical knowledge for caring for yourself')).toBeVisible()
  // No editing on a handbook page.
  await expect(page.getByRole('button', { name: 'Rename library' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Open shelf Nutrition' }).click()
  await expect(page).toHaveURL(/#\/shelf\/core-nutrition$/)
  await page.getByRole('button', { name: 'Open notebook Everyday Nutrition' }).click()
  // The notebook lists its notes in order, each labelled while it is a draft.
  const contents = page.getByRole('region', { name: 'Contents' })
  await expect(contents.getByRole('listitem')).toHaveCount(4)
  const first = contents.getByRole('button', { name: /^1? ?Staying hydrated/ })
  await expect(first.getByText('Draft', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pin note' })).toHaveCount(0)

  await first.click()
  const reader = page.getByRole('dialog', { name: 'Staying hydrated' })
  await expect(reader.getByText('Draft: not yet reviewed')).toBeVisible()
  await expect(reader.locator('.reader-location')).toContainText('Health & Wellbeing / Nutrition / Everyday Nutrition')
  await expect(reader.getByRole('textbox')).toHaveCount(0)
  await expect(page).toHaveURL(/note=core-staying-hydrated$/)
  // Every page has a picture, served by the app itself (not offered as an outside image).
  const picture = reader.getByRole('img', { name: /drinking a glass of water/ })
  await expect(picture).toBeVisible()
  await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await expect(reader.getByRole('button', { name: /^Load image/ })).toHaveCount(0)

  await reader.getByRole('link', { name: 'Water through the day' }).click()
  await expect(page.getByRole('dialog', { name: 'Water through the day' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Staying hydrated' })).toBeVisible()
})

test('makes a personal copy of a handbook note, and writes a note that links to one', async ({ page }) => {
  await page.goto('/#/notebook/core-everyday-nutrition?note=core-staying-hydrated')
  await page.getByRole('dialog', { name: 'Staying hydrated' }).getByRole('button', { name: 'Make a personal copy' }).click()
  // The copy is an ordinary, editable personal note that ends with a link back.
  const title = page.getByRole('textbox', { name: 'Note title' })
  await expect(title).toHaveValue('Staying hydrated')
  await title.fill('Staying hydrated, my way')
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
  const preview = page.locator('.editor-card .prose-notes')
  await expect(preview.getByText('Copied from the handbook note')).toBeVisible()
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  await page.goto('/#/notebook/core-kitchen-garden?note=core-starting-a-kitchen-garden')
  await page.getByRole('dialog', { name: 'Starting a kitchen garden' }).getByRole('button', { name: 'Write a note about this' }).click()
  await expect(title).toHaveValue('Notes on Starting a kitchen garden')
  await page.getByRole('textbox', { name: 'Note text' }).press('End')
  await page.keyboard.type(' sunny corner by the tap.')
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
  // The link in the new note opens the handbook note.
  await preview.getByRole('link', { name: 'Starting a kitchen garden' }).click()
  await expect(page.getByRole('dialog', { name: 'Starting a kitchen garden' })).toBeVisible()

  // Both personal notes are in All Notes; the handbooks are not.
  await page.getByRole('dialog', { name: 'Starting a kitchen garden' }).getByRole('button', { name: 'Close note' }).first().click()
  await page.getByRole('navigation', { name: 'Note views' }).getByRole('button', { name: /^All Notes/ }).click()
  await expect(page.getByRole('button', { name: 'Open note Staying hydrated, my way' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open note Notes on Starting a kitchen garden' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open note Water through the day' })).toHaveCount(0)
})
