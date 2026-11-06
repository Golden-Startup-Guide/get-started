import AxeBuilder from '@axe-core/playwright'
import { createNote, expect, openWorkspace, test } from './helpers'

test('opens in a saved language, switches to Arabic right to left, and keeps notes in their own direction', async ({ page }) => {
  // A language chosen earlier is used from the first draw.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('language-set')) {
      localStorage.setItem('my-notes-language', 'es')
      sessionStorage.setItem('language-set', 'yes')
    }
  })
  await page.goto('/#/notes')
  await expect(page.getByRole('heading', { name: 'Todas las notas', level: 1 })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.getByRole('button', { name: 'Crear una nota nueva', exact: true })).toBeVisible()
  await expect(page.locator('#note-count')).toHaveText(/^[\d.,]+ notas?$/)

  // Switching to Arabic from Settings: the page turns right to left, and Settings stays open.
  await page.getByRole('button', { name: 'Abrir ajustes' }).first().click()
  await page.getByRole('dialog', { name: 'Ajustes' }).getByLabel('Idioma').selectOption('ar')
  const settings = page.getByRole('dialog', { name: 'الإعدادات' })
  await expect(settings).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  await settings.getByRole('button', { name: 'إغلاق الإعدادات' }).click()
  await expect(page.getByRole('heading', { name: 'كل الملاحظات', level: 1 })).toBeVisible()

  // The sidebar is on the right.
  const sidebar = await page.locator('#workspace-navigation').boundingBox()
  const main = await page.locator('#main-content').boundingBox()
  expect(sidebar!.x).toBeGreaterThan(main!.x)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((violation) => violation.id)).toEqual([])

  // The choice is remembered.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'كل الملاحظات', level: 1 })).toBeVisible()

  // Back to English: a note in Arabic still reads right to left, paragraph by paragraph.
  await page.getByRole('button', { name: 'فتح الإعدادات' }).first().click()
  await page.getByRole('dialog', { name: 'الإعدادات' }).getByLabel('اللغة').selectOption('en')
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await openWorkspace(page)
  await createNote(page, 'Mixed', 'مرحبا بالعالم\n\nHello world')
  await page.getByRole('button', { name: 'Open note Mixed' }).click()
  const paragraphs = page.locator('.prose-notes p')
  await expect(paragraphs.first()).toHaveText('مرحبا بالعالم')
  expect(await paragraphs.first().evaluate((element) => getComputedStyle(element).unicodeBidi)).toBe('plaintext')
  const [arabic, english] = await paragraphs.evaluateAll((elements) => elements.map((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return { right: range.getBoundingClientRect().right, left: range.getBoundingClientRect().left, boxRight: element.getBoundingClientRect().right, boxLeft: element.getBoundingClientRect().left }
  }))
  // The Arabic line sits against the right edge, the English one against the left.
  expect(Math.abs(arabic.boxRight - arabic.right)).toBeLessThan(2)
  expect(Math.abs(english.left - english.boxLeft)).toBeLessThan(2)
})
