import { createNote, expect, expectSaved, openWorkspace, test } from './helpers'

test('shows another note inside this one with ![[Note]], kept up to date', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed list', '## Tomatoes\n\n- [ ] Gardener’s Delight\n\n## Herbs\n\nBasil and thyme')
  await createNote(page, 'Spring plan', 'This season:\n\n![[Seed list]]\n\nJust the herbs:\n\n![[Seed list#Herbs]]')

  await page.getByRole('button', { name: 'Open note Spring plan' }).click()
  const preview = page.locator('.prose-notes')
  const whole = preview.getByRole('region', { name: 'Embedded: Seed list', exact: true })
  await expect(whole).toContainText('Gardener’s Delight')
  await expect(whole.getByRole('checkbox')).toBeDisabled()
  const herbs = preview.getByRole('region', { name: 'Embedded: Seed list › Herbs' })
  await expect(herbs).toContainText('Basil and thyme')
  await expect(herbs).not.toContainText('Tomatoes')

  // The header opens the embedded note.
  await whole.getByRole('link', { name: 'Seed list' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Seed list')

  // Changing it changes what the embed shows.
  await page.getByRole('textbox', { name: 'Note text' }).fill('## Tomatoes\n\n- [ ] Sungold\n\n## Herbs\n\nBasil and mint')
  await expectSaved(page)
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await page.getByRole('button', { name: 'Open note Spring plan' }).click()
  await expect(preview.getByRole('region', { name: 'Embedded: Seed list › Herbs' })).toContainText('Basil and mint')

  // Embeds count as links: Spring plan is a backlink of Seed list.
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await page.getByRole('button', { name: 'Open note Seed list' }).click()
  await expect(page.getByRole('list', { name: 'Mentioned in' })).toContainText('Spring plan')
})
