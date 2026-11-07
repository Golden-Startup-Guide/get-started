import { expect, test } from './helpers'

test('a handbook notebook lists its contents in order and marks where the reader left off', async ({ page }) => {
  await page.goto('/#/notebook/core-everyday-nutrition')
  await expect(page.getByRole('heading', { name: 'Everyday Nutrition', level: 1 })).toBeVisible()
  await expect(page.getByText('Simple habits for eating and drinking well through the day.')).toBeVisible()
  const contents = page.getByRole('region', { name: 'Contents' })
  await expect(contents.getByRole('listitem')).toHaveText([/Staying hydrated/, /Water through the day/, /Signs of dehydration/, /A balanced plate/])
  await expect(page.getByText('Last read')).toHaveCount(0)

  await contents.getByRole('button', { name: /Water through the day/ }).click()
  await page.getByRole('dialog', { name: 'Water through the day' }).getByRole('button', { name: 'Close note' }).first().click()
  // Marked in words and by a bar, not colour alone; Continue reading names the note's place.
  await expect(contents.getByRole('listitem').nth(1)).toContainText('Last read')
  const resume = page.getByRole('region', { name: 'Continue reading' })
  await expect(resume).toContainText('Note 2 of 4')

  // The shelf shows the same progress in words, on the notebook's card.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Nutrition' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()
  await expect(page.getByText('Last read: note 2 of 4')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Continue reading' })).toContainText('Water through the day')
})

test('a personal library keeps its management at the end: add a shelf, then a notebook on it', async ({ page }) => {
  await page.goto('/#/library/starter-library')
  await expect(page.getByRole('heading', { name: 'My notes', level: 1 })).toBeVisible()
  const shelves = page.getByRole('region', { name: 'Shelves' })
  await expect(shelves.getByRole('heading', { name: 'General' })).toBeVisible()
  await expect(page.getByText('1 shelf · 1 notebook · 1 note')).toBeVisible()

  const manage = page.getByRole('region', { name: 'Manage this library' })
  await manage.getByRole('textbox', { name: 'New shelf in My notes' }).fill('Garden')
  await manage.getByRole('button', { name: 'Add shelf' }).click()
  await expect(page.getByRole('heading', { name: 'Garden', level: 1 })).toBeVisible()
  await expect(page.getByText('Notebooks hold notes on one subject.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Other shelves in this library' }).getByRole('button', { name: /General/ })).toBeVisible()

  const manageShelf = page.getByRole('region', { name: 'Manage this shelf' })
  await manageShelf.getByRole('textbox', { name: 'New notebook in Garden' }).fill('Seed journal')
  await manageShelf.getByRole('button', { name: 'Add notebook' }).click()
  await expect(page.getByRole('heading', { name: 'Seed journal', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Garden' }).first()).toBeVisible()
})
