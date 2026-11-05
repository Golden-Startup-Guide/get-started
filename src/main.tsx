import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import Root from './Root'
import { applyLanguageChoice, savedLanguageChoice } from './i18n/i18n'
import { listenForInstall } from './state/installStore'
import { listenForProblems } from './state/problemStore'
import { useLanguageStore } from './state/languageStore'
import { updateReady } from './state/updateStore'
import './index.css'

listenForInstall()
listenForProblems()

// The language's text is loaded before the first draw, so the app never flashes in English.
const choice = savedLanguageChoice()
void applyLanguageChoice(choice)
  .catch(() => applyLanguageChoice('en'))
  .then((language) => {
    useLanguageStore.setState({ choice, language })
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <Root />
      </React.StrictMode>,
    )
  })

// The service worker keeps the app working offline. A new version waits until the user chooses
// to reload, from the banner the app shows; it is also looked for every hour while open.
// (Imported directly, not on demand: a separate chunk would be missing when opening offline.)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh: () => updateReady(() => update(true)),
    onRegisteredSW: (_url, registration) => {
      if (registration) window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000)
    },
  })
}
