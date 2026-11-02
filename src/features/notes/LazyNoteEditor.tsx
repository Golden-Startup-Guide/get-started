import { useEffect, useState, type ComponentProps } from 'react'
import type { NoteEditor } from './NoteEditor'
import { loadedNoteEditor, preloadNoteEditor } from './noteEditorChunk'

/**
 * Renders the note editor once its code has loaded (see noteEditorChunk.ts), and nothing before.
 *
 * This replaces React.lazy on purpose: lazy() suspends on the first render even when the chunk
 * has already loaded, and React then holds the editor back for its Suspense throttle (hundreds
 * of milliseconds). Here, once the code is loaded the editor renders in the same pass.
 */
export function LazyNoteEditor(props: ComponentProps<typeof NoteEditor>) {
  const [Editor, setEditor] = useState(loadedNoteEditor)
  const { onError } = props

  useEffect(() => {
    if (Editor) return
    let active = true
    preloadNoteEditor().then(
      (component) => { if (active) setEditor(() => component) },
      () => { if (active) onError('The editor could not be loaded. Check your connection and try again.') },
    )
    return () => { active = false }
  }, [Editor, onError])

  return Editor ? <Editor {...props} /> : null
}
