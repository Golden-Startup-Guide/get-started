import { expect, openWorkspace, test } from './helpers'

test('saves a clipped page to Inbox, opens app shortcuts, and offers the clipper', async ({ page }) => {
  // What the bookmarklet opens: the app with the page's title, link, and selected text.
  await openWorkspace(page)
  await page.goto('/?clip-title=Garden%20tips&clip-url=https%3A%2F%2Fexample.com%2Fgarden&clip-text=Water%20early%0AMulch%20well')
  await expect(page.getByRole('status').filter({ hasText: 'Saved “Garden tips” to Inbox.' })).toBeVisible()
  // The request is cleared, so reloading does not save it again.
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: /^Inbox \d+$/ }).click()
  await page.getByRole('button', { name: 'Open note Garden tips' }).click()
  await expect(page.locator('.prose-notes a[href="https://example.com/garden"]')).toHaveText('Garden tips')
  await expect(page.locator('.prose-notes blockquote')).toContainText('Water early')
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  // An app shortcut: New note.
  await page.goto('/?action=new')
  await expect(page.getByRole('textbox', { name: 'Note title' })).toBeVisible()
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  // The manifest offers the shortcuts and the Android share target.
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url)).toEqual(['/?action=new', '/?action=quick', '/?action=today'])
  expect(manifest.share_target).toEqual({ action: '/', method: 'GET', params: { title: 'share-title', text: 'share-text', url: 'share-url' } })

  // Settings offers the clipper as a bookmarklet to drag to the bookmarks bar.
  await page.getByRole('button', { name: 'Open settings' }).first().click()
  const clipper = page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Clip to Knowledge Library' })
  await expect(clipper).toHaveAttribute('href', /^javascript:\(\(\)=>\{.*clip-title=/)
})
