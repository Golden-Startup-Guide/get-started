import { expect, openWorkspace, test } from './helpers'

test('refuses to run inside another page’s frame', async ({ page, baseURL }) => {
  await openWorkspace(page)
  await page.setContent(`<iframe src="${baseURL}/" width="600" height="300"></iframe>`)
  const frame = page.frameLocator('iframe')
  await expect(frame.getByText('My Notes does not run inside other pages.')).toBeVisible()
  await expect(frame.getByRole('link', { name: 'Open My Notes in its own tab' })).toHaveAttribute('target', '_blank')
  await expect(frame.getByRole('heading', { name: 'All Notes' })).toHaveCount(0)
})
