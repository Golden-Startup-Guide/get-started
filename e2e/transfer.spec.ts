import { readFile } from 'node:fs/promises'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { expect, openWorkspace, test } from './helpers'

test('exports the library as Markdown files and imports an Obsidian vault and an Evernote notebook', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Open settings' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  const section = dialog.getByRole('region', { name: 'Markdown and other apps' })

  // Export: a .zip of Markdown files in library/shelf/notebook folders.
  const download = page.waitForEvent('download')
  await section.getByRole('button', { name: 'Export as Markdown (.zip)' }).click()
  const zip = await download
  expect(zip.suggestedFilename()).toMatch(/^my-notes-markdown-\d{4}-\d{2}-\d{2}\.zip$/)
  const files = unzipSync(new Uint8Array(await readFile((await zip.path())!)))
  const notes = Object.keys(files).filter((path) => path.endsWith('.md'))
  expect(notes).toHaveLength(1)
  expect(notes).toContain('My notes/General/Personal/Welcome to your Knowledge Library.md')
  expect(strFromU8(files['My notes/General/Personal/Welcome to your Knowledge Library.md'])).toMatch(/^---\nnotebook: Personal\n/)
  await expect(dialog.getByRole('status').filter({ hasText: 'Exported 1 note as Markdown' })).toBeVisible()

  // Import an Obsidian vault (.zip): folders become notebooks, embedded files attachments.
  const vault = zipSync({
    'Vault/Garden/Seed plan.md': strToU8('---\ntags: [garden]\n---\nSow #basil in March.\n\n![[tray.png]]\n'),
    'Vault/Garden/Harvest.md': strToU8('Links to [[Seed plan]].'),
    'Vault/attachments/tray.png': new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')),
    'Vault/.obsidian/app.json': strToU8('{}'),
  })
  await section.getByRole('combobox').selectOption({ label: 'Markdown files or an Obsidian vault' })
  await section.getByLabel(/Files to import from/).setInputFiles({ name: 'vault.zip', mimeType: 'application/zip', buffer: Buffer.from(vault) })
  await section.getByRole('button', { name: 'Import notes' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Imported' })).toHaveText('Imported 2 notes into 1 new notebook, with 1 attachment.')

  // Import an Evernote notebook (.enex).
  const enex = `<?xml version="1.0" encoding="UTF-8"?><en-export><note><title>Shopping</title><content><![CDATA[<en-note><div><en-todo checked="true"/>Milk</div><div><en-todo/>Bread</div></en-note>]]></content><created>20240131T094500Z</created><tag>errands</tag></note></en-export>`
  await section.getByRole('combobox').selectOption({ label: 'Evernote' })
  await section.getByLabel(/Files to import from/).setInputFiles({ name: 'Home.enex', mimeType: 'application/xml', buffer: Buffer.from(enex) })
  await section.getByRole('button', { name: 'Import notes' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Imported' })).toHaveText('Imported 1 note into 1 new notebook.')
  await page.getByRole('button', { name: 'Close settings' }).click()

  await page.getByRole('button', { name: /^Garden \d+$/ }).click()
  await page.getByRole('button', { name: 'Open note Seed plan' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Seed plan')
  await expect(page.getByText('tray.png').first()).toBeVisible()
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  await page.getByRole('button', { name: /^Home \d+$/ }).click()
  await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible()
})
