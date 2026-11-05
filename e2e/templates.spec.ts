import { expect, expectSaved, markdownText, openWorkspace, test } from './helpers'

const pad = (value: number) => String(value).padStart(2, '0')
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

test('opens today’s note, creating it on the first visit and reopening it after', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Today’s note' }).click()
  const title = page.getByRole('textbox', { name: 'Note title' })
  await expect(title).toHaveValue(today())
  expect(await markdownText(page)).toContain('- [ ] Plan the day')

  // Nothing is saved until it is edited.
  await page.getByRole('textbox', { name: 'Note text' }).press('ControlOrMeta+End')
  await page.keyboard.type('\nWatered the seedlings.')
  await expectSaved(page)
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  // The Daily notes notebook was created, and the same note opens again.
  await expect(page.getByRole('navigation', { name: 'Libraries' }).getByRole('button', { name: /^Daily notes 1/ })).toBeVisible()
  await page.getByRole('button', { name: 'Today’s note' }).click()
  await expect(title).toHaveValue(today())
  expect(await markdownText(page)).toContain('Watered the seedlings.')
})

test('creates a template and makes notes from it with the placeholders filled in', async ({ page }) => {
  await openWorkspace(page)
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await palette.getByRole('combobox').fill('template')
  await palette.getByRole('option', { name: /Create a template/ }).click()

  // The example template is saved in the Templates notebook and opened for editing.
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Meeting {{date}}')
  expect(await markdownText(page)).toContain('Created {{longdate}} at {{time}}.')
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await expect(page.getByRole('navigation', { name: 'Libraries' }).getByRole('button', { name: /^Templates 1/ })).toBeVisible()

  await page.keyboard.press('ControlOrMeta+k')
  await palette.getByRole('combobox').fill('from template')
  await palette.getByRole('option', { name: /New note from template: Meeting \{\{date\}\}/ }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue(`Meeting ${today()}`)
  const text = await markdownText(page)
  expect(text).toMatch(new RegExp(`^# Meeting ${today()}\\n`))
  expect(text).not.toContain('{{')
})
