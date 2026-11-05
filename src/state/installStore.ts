import { create } from 'zustand'

/** Chromium's install prompt, offered once the app can be installed. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  /** The browser's install prompt, kept until used (Chrome, Edge, and Android only). */
  prompt?: InstallPromptEvent
  /** Running as an installed app, in its own window. */
  installed: boolean
}

const standalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const useInstallStore = create<InstallState>()(() => ({ installed: standalone() }))

/** Keeps the browser's install prompt for the Install button (call once, at start-up). */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    useInstallStore.setState({ prompt: event as InstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => useInstallStore.setState({ prompt: undefined, installed: true }))
}

/** Shows the browser's install prompt. */
export async function installApp() {
  const prompt = useInstallStore.getState().prompt
  if (!prompt) return
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  useInstallStore.setState({ prompt: undefined, installed: outcome === 'accepted' || useInstallStore.getState().installed })
}
