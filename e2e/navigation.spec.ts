import { expect, openWorkspace, test } from './helpers'

test('every page and note has an address: Back, Forward, and reload work, and missing pages are explained', async ({ page }) => {
  await openWorkspace(page)
  await expect(page).toHaveURL(/#\/notes$/)
  const navigation = page.getByRole('complementary', { name: 'Primary navigation' })

  await navigation.getByRole('button', { name: /^Personal \d/ }).click()
  await expect(page.getByRole('heading', { name: 'Personal', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/#\/notebook\/starter-personal$/)
  await expect(page).toHaveTitle('Personal — The Personal Knowledge Library')
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(breadcrumb.getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(breadcrumb.getByRole('link', { name: 'My notes' })).toBeVisible()
  await expect(breadcrumb.getByText('Personal', { exact: true })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Open note Welcome to your Knowledge Library' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Welcome to your Knowledge Library')
  await expect(page).toHaveURL(/#\/notebook\/starter-personal\?note=starter-note-welcome$/)
  await expect(page).toHaveTitle('Welcome to your Knowledge Library — The Personal Knowledge Library')

  // A reload opens the same note on the same page.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Welcome to your Knowledge Library')

  // Back closes the note, then returns to All Notes; Forward goes to the notebook again.
  await page.goBack()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Personal', level: 1 })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Personal', level: 1 })).toBeVisible()

  // A search is part of the address, without adding a step to history for each letter.
  await page.getByRole('searchbox').fill('backup')
  await expect(page).toHaveURL(/#\/notebook\/starter-personal\?q=backup$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()

  // An address for something no longer in the library says so and shows Home.
  await page.goto('/#/notebook/starter-personal?note=no-such-note')
  await expect(page.getByRole('status').filter({ hasText: 'That note could not be found.' })).toBeVisible()
  await page.goto('/#/shelf/no-such-shelf')
  await expect(page.getByRole('status').filter({ hasText: 'That page is no longer in your library.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome to your library', level: 1 })).toBeVisible()
})

test('a skip link, and a rail of named icons when the sidebar is collapsed', async ({ page, browserName }) => {
  await openWorkspace(page)
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  // It comes first in the Tab order. Safari's Tab skips links by default (Option+Tab reaches them),
  // and WebKit does the same here, so there it is focused directly.
  if (browserName === 'webkit') await skip.focus()
  else await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL(/#\/notes$/)

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  const rail = page.getByRole('navigation', { name: 'Primary navigation' })
  await expect(rail.getByRole('button', { name: 'Expand sidebar' })).toBeFocused()
  await rail.getByRole('button', { name: 'Favorites' }).click()
  await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeVisible()
  await expect(rail.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-current', 'page')
  await rail.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeFocused()
  await expect(rail).toBeHidden()
})

test('on a phone, the breadcrumb links up a level and shows the full path on request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/notebook/starter-personal')
  await expect(page.getByRole('heading', { name: 'Personal', level: 1 })).toBeVisible()
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  const location = breadcrumb.getByRole('button', { name: 'Page location' })
  await expect(location).toHaveAttribute('aria-expanded', 'false')
  await location.click()
  await expect(location).toHaveAttribute('aria-expanded', 'true')
  await expect(breadcrumb.getByRole('link', { name: 'Home' })).toBeVisible()
  await breadcrumb.getByRole('link', { name: 'General' }).first().click()
  await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/#\/shelf\/starter-shelf$/)
})
