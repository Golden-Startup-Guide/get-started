import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { applyUpdate, useUpdateStore } from '../../state/updateStore'
import { t } from '../../i18n/i18n'

/** Offers the new version once it has downloaded, instead of reloading the page by itself. */
export function UpdateBanner() {
  const ready = useUpdateStore((state) => state.ready)
  const dismissed = useUpdateStore((state) => state.dismissed)
  const [updating, setUpdating] = useState(false)
  if (!ready || dismissed) return null

  async function update() {
    setUpdating(true)
    if (!(await applyUpdate())) setUpdating(false)
  }

  return (
    <div role="region" aria-label={t("Update available")} className="notice backup-reminder mb-5">
      <p className="min-w-0 flex-1">{t("A new version of the app is ready. Reload to use it; your open note is saved first.")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="secondary-button" disabled={updating} onClick={() => void update()}>
          <RefreshCw size={15} aria-hidden="true" /> {updating ? t("Updating…") : t("Reload to update")}
        </button>
        <button type="button" className="secondary-button" onClick={() => useUpdateStore.setState({ dismissed: true })}>{t("Later")}</button>
      </div>
    </div>
  )
}
