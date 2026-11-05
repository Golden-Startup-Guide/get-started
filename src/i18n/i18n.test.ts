import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import ar from './ar'
import es from './es'
import { applyLanguageChoice, resolveLanguage, t, tp, type Catalog } from './i18n'
import { findMessages } from './messages'

function sourceFiles(dir = 'src'): Array<{ path: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.|\.d\.ts$/.test(name) ? [{ path, text: readFileSync(path, 'utf8') }] : []
  })
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('translations', () => {
  afterEach(async () => {
    await applyLanguageChoice('en')
  })

  const messages = findMessages(sourceFiles())

  for (const [language, catalog] of [['es', es], ['ar', ar]] as const) {
    it(`has every text in ${language}, with the same placeholders, and nothing unused`, () => {
      const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories
      const missing: string[] = []
      const wrong: string[] = []
      for (const text of messages.texts) {
        const translation = catalog[text]
        if (typeof translation !== 'string') missing.push(text)
        else if (placeholders(translation).join() !== placeholders(text).join()) wrong.push(`${text} → ${translation}`)
      }
      for (const [other, one] of messages.plurals) {
        const translation = catalog[other]
        if (!translation || typeof translation !== 'object') {
          missing.push(other)
          continue
        }
        for (const category of categories) {
          const form = translation[category]
          if (!form) wrong.push(`${other}: no "${category}" form`)
        }
        // Each form may drop {count} (Arabic often spells out one and two), but no other placeholder.
        const allowed = new Set([...placeholders(one), ...placeholders(other)])
        for (const form of Object.values(translation)) {
          for (const name of placeholders(form ?? '')) if (!allowed.has(name)) wrong.push(`${other}: unknown {${name}} in "${form}"`)
        }
      }
      const used = new Set([...messages.texts, ...messages.plurals.keys()])
      const unused = Object.keys(catalog as Catalog).filter((key) => !used.has(key))
      expect({ missing, wrong, unused }).toEqual({ missing: [], wrong: [], unused: [] })
    })
  }

  it('finds texts in the source, including plurals and constants', () => {
    expect(messages.texts).toContain('Create a new note')
    expect(messages.texts).toContain('Notes containing every word, in any order')
    expect(messages.plurals.get('{count} notes')).toBe('{count} note')
    expect(messages.texts.size).toBeGreaterThan(400)
  })

  it('translates, fills in values, and chooses plural forms by language', async () => {
    expect(t('Saved “{title}” to {INBOX_NOTEBOOK}.', { title: 'Plan', INBOX_NOTEBOOK: 'Inbox' })).toBe('Saved “Plan” to Inbox.')
    expect(tp(1, '{count} note', '{count} notes')).toBe('1 note')
    expect(tp(3, '{count} note', '{count} notes')).toBe('3 notes')

    await applyLanguageChoice('es')
    expect(document.documentElement).toHaveAttribute('lang', 'es')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
    expect(t('Create a new note')).toBe('Crear una nota nueva')
    expect(tp(1, '{count} note', '{count} notes')).toBe('1 nota')
    expect(tp(4, '{count} note', '{count} notes')).toBe('4 notas')

    await applyLanguageChoice('ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(tp(2, '{count} note', '{count} notes')).toBe('ملاحظتان')
    expect(tp(5, '{count} note', '{count} notes')).toBe(`${(5).toLocaleString('ar')} ملاحظات`)
    expect(tp(11, '{count} note', '{count} notes')).toBe(`${(11).toLocaleString('ar')} ملاحظة`)
    // Text without a translation is shown in English rather than lost.
    expect(t('Something new')).toBe('Something new')
  })

  it('follows the device language for "system", falling back to English', () => {
    expect(resolveLanguage('system', ['es-MX', 'en'])).toBe('es')
    expect(resolveLanguage('system', ['ar-EG'])).toBe('ar')
    expect(resolveLanguage('system', ['fr-FR', 'de'])).toBe('en')
    expect(resolveLanguage('ar', ['es'])).toBe('ar')
  })
})
