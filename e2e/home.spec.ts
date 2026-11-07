import { expect, test } from './helpers'

test('opens on Home, invites a first read, and then offers to continue where the reader left off', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to your library', level: 1 })).toBeVisible()
  await expect(page).toHaveTitle('The Personal Knowledge Library')
  await expect(page.getByRole('heading', { name: 'Start reading' })).toBeVisible()

  const libraries = page.getByRole('region', { name: 'Explore libraries' })
  await libraries.getByRole('button', { name: /^Health & Wellbeing/ }).click()
  await expect(page.getByRole('heading', { name: 'Health & Wellbeing', level: 1 })).toBeVisible()
  await page.getByRole('navigation', { name: 'Handbooks' }).getByRole('button', { name: /^Everyday Nutrition/ }).click()
  await page.getByRole('region', { name: 'Contents' }).getByRole('button', { name: /Water through the day/ }).click()
  await page.getByRole('dialog', { name: 'Water through the day' }).getByRole('button', { name: 'Close note' }).first().click()

  // Home names the note and its place in the notebook, and opens it again.
  await page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('button', { name: 'Home', exact: true }).click()
  const resume = page.getByRole('region', { name: 'Continue reading' })
  await expect(resume.getByRole('paragraph').first()).toHaveText('Water through the day')
  await expect(resume.getByText('Health & Wellbeing / Nutrition / Everyday Nutrition · Note 2 of 4')).toBeVisible()
  await resume.getByRole('button', { name: /^Continue reading/ }).click()
  await expect(page.getByRole('dialog', { name: 'Water through the day' })).toBeVisible()
  await page.goBack()

  // Recently added: the handbooks and the Welcome note, each opening the note.
  const recent = page.getByRole('region', { name: 'Recently added' })
  await recent.getByRole('button', { name: /^Welcome to your Knowledge Library/ }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Welcome to your Knowledge Library')
})
