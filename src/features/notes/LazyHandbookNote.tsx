import { useEffect, useState, type ComponentProps } from 'react'
import type { HandbookNote } from './HandbookNote'
import { loadedHandbookNote, preloadHandbookNote } from './noteEditorChunk'
import { t } from '../../i18n/i18n'

/** The handbook reader once its code has loaded; see LazyNoteEditor, which this mirrors. */
export function LazyHandbookNote({ onError, ...props }: ComponentProps<typeof HandbookNote> & { onError: (message: string) => void }) {
  const [Reader, setReader] = useState(loadedHandbookNote)
  const { onClose } = props

  useEffect(() => {
    if (Reader) return
    let active = true
    preloadHandbookNote().then(
      (component) => { if (active) setReader(() => component) },
      () => {
        if (!active) return
        onError(t('The note could not be opened. Check your connection and try again.'))
        onClose()
      },
    )
    return () => { active = false }
  }, [Reader, onError, onClose])

  if (Reader) return <Reader {...props} />
  return (
    <div className="modal-backdrop" role="presentation">
      <p className="editor-loading" role="status">{t("Opening note…")}</p>
    </div>
  )
}
