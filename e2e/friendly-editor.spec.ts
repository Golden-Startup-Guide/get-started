import { expect, openWorkspace, test } from './helpers'

test('formats notes without Markdown: buttons, shortcuts, links, paste, and a first-use tip', async ({ page, browserName }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Shopping')

  // Plain words throughout, and a tip that stays closed once closed.
  await expect(page.getByText('Note text', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Formatted' })).toHaveAttribute('aria-pressed', 'true')
  const tip = page.getByRole('note').filter({ hasText: 'Just start typing.' })
  await expect(tip).toBeVisible()

  const editor = page.getByRole('textbox', { name: 'Note text' })
  const preview = page.locator('.prose-notes')
  const bar = page.getByRole('group', { name: 'Formatting' })
  await editor.click()
  await page.keyboard.type('Buy fresh basil')
  // Select "basil" and make it bold with the button.
  for (let index = 0; index < 5; index += 1) await page.keyboard.press('Shift+ArrowLeft')
  await bar.getByRole('button', { name: /^Bold/ }).click()
  await expect(preview.locator('strong')).toHaveText('basil')
  await expect(editor).toBeFocused()

  // Ctrl+I (⌘I on a Mac) for italic.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ask about ')
  await page.keyboard.press('ControlOrMeta+i')
  await page.keyboard.type('prices')
  await expect(preview.locator('em')).toHaveText('prices')

  // A line becomes a checklist item, and several lines a numbered list.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Tomatoes')
  await bar.getByRole('button', { name: 'Checklist' }).click()
  await expect(preview.getByRole('checkbox')).toHaveCount(1)

  // A link to a web page: the browser asks for the address.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  page.once('dialog', (dialog) => void dialog.accept('example.com/market'))
  await bar.getByRole('button', { name: 'Link to a web page' }).click()
  await expect(preview.locator('a[href="https://example.com/market"]')).toHaveText('example.com/market')

  // A link to another note, chosen from the list.
  await page.keyboard.press('Enter')
  await bar.getByRole('button', { name: 'Link to a note' }).click()
  await page.getByRole('option', { name: /Welcome to your Knowledge Library/ }).click()
  await expect(preview.getByRole('link', { name: /Welcome to your Knowledge Library/ })).toBeVisible()

  // Pasting formatted text keeps its formatting. (Firefox drops the data of a synthetic paste
  // event, though real pastes carry it; formatting.test.ts covers the conversion.)
  if (browserName !== 'firefox') {
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.setData('text/html', '<h3>From the web</h3><ul><li><b>Seeds</b></li><li>Soil</li></ul>')
      data.setData('text/plain', 'From the web Seeds Soil')
      document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect(preview.locator('h3')).toHaveText('From the web')
    await expect(preview.locator('li strong')).toHaveText('Seeds')
  }

  await tip.getByRole('button', { name: 'Dismiss tip' }).click()
  await expect(tip).toHaveCount(0)
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await page.getByRole('button', { name: 'Open note Shopping' }).click()
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Just start typing.' })).toHaveCount(0)
})
