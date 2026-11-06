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

// Inside another site's frame, show only a link to open the app on its own: a frame could trick
// people into clicking or typing into the app (GitHub Pages cannot send the header that forbids
// framing, and a policy in a <meta> tag cannot either).
const framed = (() => {
  try {
    return window.top !== window.self
  } catch {
    return true
  }
})()

// The language's text is loaded before the first draw, so the app never flashes in English.
const choice = savedLanguageChoice()
if (framed) {
  const root = document.getElementById('root')!
  const message = document.createElement('p')
  message.style.cssText = 'font: 16px system-ui, sans-serif; padding: 1rem'
  const link = document.createElement('a')
  link.href = window.location.href
  link.target = '_blank'
  link.rel = 'noopener'
  link.textContent = 'Open The Personal Knowledge Library in its own tab'
  message.append('The Personal Knowledge Library does not run inside other pages. ', link, '.')
  root.replaceChildren(message)
} else void applyLanguageChoice(choice)
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
if ('serviceWorker' in navigator && import.meta.env.PROD && !framed) {
  const update = registerSW({
    onNeedRefresh: () => updateReady(() => update(true)),
    onRegisteredSW: (_url, registration) => {
      if (registration) window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000)
    },
  })
}
