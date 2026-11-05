import App from './App'
import { useLanguageStore } from './state/languageStore'

/** The app, drawn again from the start when the language changes, so every text follows it. */
export default function Root() {
  const language = useLanguageStore((state) => state.language)
  return <App key={language} />
}
