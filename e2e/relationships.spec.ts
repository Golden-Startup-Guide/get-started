import { createNote, expect, openWorkspace, test } from './helpers'

test('a handbook note lists what mentions it, and shows its neighbourhood on the note map', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'My hydration log', 'Following [[Staying hydrated]] this week.')

  await page.goto('/#/notebook/core-everyday-nutrition?note=core-staying-hydrated')
  const reader = page.getByRole('dialog', { name: 'Staying hydrated' })
  // After the text, never inside it: what mentions it, with where each sits. A handbook page
  // that links here is a mention, not repeated as related (related notes are unit-tested).
  const mentions = reader.getByRole('region', { name: 'Mentioned in' })
  await expect(mentions.getByRole('button', { name: /^My hydration log\s*My notes \/ General \/ Personal$/ })).toBeVisible()
  await expect(mentions.getByRole('button', { name: /^Signs of dehydration\s*Health & Wellbeing \/ Nutrition \/ Everyday Nutrition$/ })).toBeVisible()
  await expect(reader.getByRole('region', { name: 'Related notes' }).getByRole('button', { name: /Signs of dehydration|Water through the day/ })).toHaveCount(0)

  await reader.getByRole('button', { name: 'Show on the note map' }).click()
  await expect(page.getByRole('heading', { name: 'Note map', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Around a note' }).or(page.getByRole('heading', { name: 'Around a note' })).first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Explore note' }).locator('option:checked')).toHaveText(/^Staying hydrated/)

  // Every note on the map is also in the list below it, reachable from the keyboard.
  const map = page.getByRole('group', { name: 'Connected note graph' })
  const onMap = (await map.getByRole('button').allTextContents()).filter((name) => !/^Staying hydrated/.test(name))
  expect(onMap.length).toBeGreaterThanOrEqual(3)
  const lists = page.getByRole('region', { name: 'Links from this note' }).or(page.getByRole('region', { name: 'Mentioned in' }))
  for (const name of onMap) await expect(lists.getByRole('button', { name: `Explore ${name}` }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Links from this note' })).toContainText('Water through the day')
  await expect(page.getByRole('region', { name: 'Mentioned in' })).toContainText('My hydration log')

  await page.getByRole('button', { name: 'Skip to the list' }).click()
  await expect(page.getByRole('heading', { name: 'The same notes, as a list' })).toBeFocused()
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  await zoomIn.click()
  await zoomIn.click()
  await zoomIn.click()
  await expect(zoomIn).toBeDisabled()
  await page.getByRole('button', { name: 'Reset zoom' }).click()
  await expect(zoomIn).toBeEnabled()
})
