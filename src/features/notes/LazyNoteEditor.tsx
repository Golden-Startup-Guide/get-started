import { useEffect, useState, type ComponentProps } from 'react'
import type { NoteEditor } from './NoteEditor'
import { loadedNoteEditor, preloadNoteEditor } from './noteEditorChunk'
import { t } from '../../i18n/i18n'

/**
 * Renders the note editor once its code has loaded (see noteEditorChunk.ts), with a short
 * "Opening note…" message until then. If the code cannot be loaded, it reports the error and
 * closes, so opening the note again retries.
 *
 * This replaces React.lazy on purpose: lazy() suspends on the first render even when the chunk
 * has already loaded, and React then holds the editor back for its Suspense throttle (hundreds
 * of milliseconds). Here, once the code is loaded the editor renders in the same pass.
 */
export function LazyNoteEditor(props: ComponentProps<typeof NoteEditor>) {
  const [Editor, setEditor] = useState(loadedNoteEditor)
  const { onError, onClose } = props

  useEffect(() => {
    if (Editor) return
    let active = true
    preloadNoteEditor().then(
      (component) => { if (active) setEditor(() => component) },
      () => {
        if (!active) return
        onError(t('The editor could not be loaded. Check your connection and try again.'))
        onClose()
      },
    )
    return () => { active = false }
  }, [Editor, onError, onClose])

  if (Editor) return <Editor {...props} />
  // Usually never seen: the code is fetched straight after start-up. On a slow connection, or
  // when a note is opened at once after loading, say what is happening instead of showing nothing.
  return (
    <div className="modal-backdrop" role="presentation">
      <p className="editor-loading" role="status">{t("Opening note…")}</p>
    </div>
  )
}
