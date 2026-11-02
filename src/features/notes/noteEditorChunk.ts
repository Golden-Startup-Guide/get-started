import type { NoteEditor } from './NoteEditor'

/**
 * The note editor brings CodeMirror and the Markdown preview, about half the app's code, so it
 * is split into its own chunk and fetched after start-up rather than with the note list.
 */
type Editor = typeof NoteEditor

let loaded: Editor | undefined
let loading: Promise<Editor> | undefined

export function preloadNoteEditor(): Promise<Editor> {
  loading ??= import('./NoteEditor').then(
    (module) => (loaded = module.NoteEditor),
    (error: unknown) => {
      // Allow another attempt, for example once the network is back.
      loading = undefined
      throw error
    },
  )
  return loading
}

/** The editor component if its code has already loaded. */
export function loadedNoteEditor(): Editor | undefined {
  return loaded
}
