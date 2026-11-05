/**
 * Translations. Text is written in English in the code, wrapped in t() (or tp() when it depends
 * on a count); the English text is the key, so English needs no catalog. Other languages load
 * their catalog (src/i18n/<language>.ts) on demand, before the app first draws in that language.
 *
 *   t('Create a new note')
 *   t('Saved “{title}” to {notebook}.', { title, notebook })
 *   tp(count, '{count} note', '{count} notes')
 *
 * Every text wrapped in t() or tp() must be in every catalog; i18n.test.ts checks.
 */
export type Language = 'en' | 'es' | 'ar'
/** The language chosen in Settings, or the device's. */
export type LanguageChoice = Language | 'system'

export const LANGUAGES: Record<Language, { name: string; dir: 'ltr' | 'rtl' }> = {
  en: { name: 'English', dir: 'ltr' },
  es: { name: 'Español', dir: 'ltr' },
  ar: { name: 'العربية', dir: 'rtl' },
}

/** A translation: a text, or for a count, one text per plural category of the language. */
export type Translation = string | Partial<Record<Intl.LDMLPluralRule, string>>
export type Catalog = Record<string, Translation>

const loaders: Record<Exclude<Language, 'en'>, () => Promise<{ default: Catalog }>> = {
  es: () => import('./es'),
  ar: () => import('./ar'),
}

const STORAGE_KEY = 'my-notes-language'
let language: Language = 'en'
let catalog: Catalog = {}
let plurals = new Intl.PluralRules('en')

const fill = (text: string, values?: Record<string, string | number>) =>
  values ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match)) : text

/** The text in the current language. `{name}` placeholders are filled from `values`. */
export function t(text: string, values?: Record<string, string | number>): string {
  const translated = catalog[text]
  return fill(typeof translated === 'string' ? translated : text, values)
}

/**
 * A text that depends on a count, in the right plural form: `other` (the English plural) is the
 * key, and `{count}` is filled in.
 */
export function tp(count: number, one: string, other: string, values?: Record<string, string | number>): string {
  const all = { count: count.toLocaleString(language), ...values }
  const translated = catalog[other]
  if (translated && typeof translated === 'object') {
    const form = translated[plurals.select(count)] ?? translated.other
    if (form) return fill(form, all)
  }
  return fill(count === 1 ? one : other, all)
}

/**
 * Marks English text kept in a constant (a list of tips, commands, or sources) for translation.
 * It returns the text unchanged; show it with t(), which translates it then.
 */
export const msg = (text: string) => text

export const currentLanguage = () => language

export function savedLanguageChoice(): LanguageChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'system' || (saved && saved in LANGUAGES) ? (saved as LanguageChoice) : 'system'
  } catch {
    return 'system'
  }
}

/** The language to use for a choice: the device's first supported language for 'system'. */
export function resolveLanguage(choice: LanguageChoice, preferred: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Language {
  if (choice !== 'system') return choice
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0]
    if (base in LANGUAGES) return base as Language
  }
  return 'en'
}

/** Loads a language's catalog and switches to it; the page's lang and direction follow. */
export async function applyLanguageChoice(choice: LanguageChoice): Promise<Language> {
  const next = resolveLanguage(choice)
  catalog = next === 'en' ? {} : (await loaders[next]()).default
  language = next
  plurals = new Intl.PluralRules(next)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next
    document.documentElement.dir = LANGUAGES[next].dir
  }
  return next
}

/** Saves the choice on this device, for the next start. */
export function saveLanguageChoice(choice: LanguageChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Private browsing can refuse storage; the choice then lasts until the page closes.
  }
}
