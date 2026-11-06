import { useMemo } from 'react'
import { Bookmark, Download } from 'lucide-react'
import { installApp, useInstallStore } from '../../state/installStore'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { clipperBookmarklet } from './launchRequest'
import { t } from '../../i18n/i18n'

const IS_APPLE_MOBILE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

/** "Install and clip" in Settings: install the app, and the web clipper bookmarklet. */
export function InstallSettings() {
  const prompt = useInstallStore((state) => state.prompt)
  const installed = useInstallStore((state) => state.installed)
  const bookmarklet = useMemo(() => clipperBookmarklet(new URL(import.meta.env.BASE_URL, window.location.origin).href), [])

  return (
    <section className="mt-7" aria-labelledby="install-heading">
      <h3 id="install-heading" className="mb-3 text-sm font-semibold">{t("Install and clip")}</h3>
      {installed ? (
        <p className="text-sm">{t("The app is installed on this device. It opens in its own window and works offline.")}</p>
      ) : prompt ? (
        <>
          <button type="button" className="secondary-button" onClick={() => void installApp()}>
            <Download size={15} aria-hidden="true" /> {t("Install The Personal Knowledge Library")}
          </button>
          <p className="mt-2 text-xs text-[var(--muted)]">{t("Installed, it opens in its own window, from the Start menu, Dock, or home screen, and works offline.")}</p>
        </>
      ) : (
        <p className="text-sm">
          {IS_APPLE_MOBILE
            ? t("To install on this iPhone or iPad, tap Share, then Add to Home Screen.")
            : t("To install, use your browser’s Install app or Add to Home Screen option (in Chrome and Edge, it is in the address bar or the menu). Installed, the app opens in its own window and works offline.")}
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">{t("Once installed, right-click (or long-press) its icon for New note, Quick note, and Today’s note. On Android, choose Knowledge Library in another app’s Share menu to save a page or text to Inbox.")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          className="secondary-button"
          ref={(element) => element?.setAttribute('href', bookmarklet)}
          // Running it here would do nothing useful; it is meant for the bookmarks bar.
          onClick={(event) => {
            event.preventDefault()
            useWorkspaceStore.getState().showNotice(t("Drag “Clip to Knowledge Library” to your bookmarks bar, then click it on any page."))
          }}
          draggable
        >
          <Bookmark size={15} aria-hidden="true" /> {t("Clip to Knowledge Library")}
        </a>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {t("Web clipper: drag this button to your browser’s bookmarks bar. On any page, click the bookmark to save the page’s title and link, and any text you selected, as a note in Inbox.")}
      </p>
    </section>
  )
}
