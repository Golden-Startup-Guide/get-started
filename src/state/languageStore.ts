import { create } from 'zustand'
import { applyLanguageChoice, saveLanguageChoice, type Language, type LanguageChoice } from '../i18n/i18n'

interface LanguageState {
  /** What Settings shows: a language, or the device's. */
  choice: LanguageChoice
  /** The language in use. */
  language: Language
  /** Settings was open when the language changed, so it opens again in the new language. */
  reopenSettings: boolean
}

export const useLanguageStore = create<LanguageState>()(() => ({ choice: 'system', language: 'en', reopenSettings: false }))

/** Switches language (from Settings): the app is drawn again in it, and the choice kept on this device. */
export async function changeLanguage(choice: LanguageChoice) {
  const language = await applyLanguageChoice(choice)
  saveLanguageChoice(choice)
  useLanguageStore.setState({ choice, language, reopenSettings: true })
}
