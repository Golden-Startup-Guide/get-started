import { readFileSync } from 'node:fs'
import { expect, test } from './helpers'

// Text left in English: in Spanish, the main screens' visible text and accessible names must not
// include any of the English texts the catalogs translate (notes themselves are left out: they
// are the user's own words). i18n.test.ts checks the catalogs are complete; this checks the
// screens use them.
test('shows no English text on the main screens in Spanish', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'What is shown does not depend on the browser; one is enough')
  const source = readFileSync('src/i18n/es.ts', 'utf8')
  const catalog = JSON.parse(source.slice(source.indexOf('= {') + 2, source.lastIndexOf('}') + 1))
  const english = Object.entries(catalog)
    .filter(([key, value]) => typeof value === 'string' && value !== key && key.trim().length > 3 && !key.includes('{'))
    .map(([key]) => key.trim())
  await page.addInitScript(() => localStorage.setItem('my-notes-language', 'es'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  const found = new Set<string>()
  const sweep = async (screen: string) => {
    const texts: string[] = await page.evaluate(() => {
      const values: string[] = []
      for (const element of Array.from(document.querySelectorAll('body *'))) {
        // Notes are the user's own text (the starter notes are in English).
        if (element.closest('.prose-notes, .cm-editor, article p, article h2, .note-contents, .graph-match, option')) continue
        for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
          const value = element.getAttribute(attribute)
          if (value) values.push(value)
        }
        for (const node of Array.from(element.childNodes)) if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) values.push(node.textContent.trim())
      }
      return values
    })
    for (const raw of texts) {
      // The app's name is a name, the same in every language.
      const text = raw.replace(/(The Personal )?Knowledge Library/g, '').trim()
      if (!text) continue
      for (const key of english) if (text === key || (key.length > 12 && text.includes(key))) found.add(`${screen}: ${key}`)
    }
  }
  await sweep('workspace')
  await page.getByRole('button', { name: 'Crear una nota nueva', exact: true }).click()
  await page.getByRole('textbox', { name: 'Título de la nota' }).fill('Prueba')
  await page.locator('.cm-content').fill('# Uno\n\n- [ ] tarea\n\n[[Welcome to your Knowledge Library]]')
  await page.waitForTimeout(1500)
  await sweep('editor')
  await page.getByRole('button', { name: 'Cerrar editor' }).first().click()
  await page.getByRole('button', { name: 'Abrir ajustes' }).first().click()
  await page.waitForTimeout(500)
  await sweep('settings')
  await page.getByRole('button', { name: 'Cerrar ajustes' }).click()
  await page.keyboard.press('Control+k')
  await sweep('palette')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Mapa de notas/ }).click()
  await page.waitForTimeout(1000)
  await sweep('graph')
  await page.getByRole('button', { name: /Alrededor de una nota/ }).click()
  await sweep('explorer')
  await page.getByRole('button', { name: /^Papelera/ }).click()
  await sweep('trash')
  await page.getByRole('button', { name: 'Consejos de búsqueda' }).click()
  await sweep('tips')
  expect([...found]).toEqual([])
})
