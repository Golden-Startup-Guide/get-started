import type { HandbookNote } from './HandbookNote'
import type { NoteEditor } from './NoteEditor'

/**
 * The note editor brings CodeMirror and the Markdown preview, about half the app's code, so it
 * is split into its own chunk and fetched after start-up rather than with the note list. The
 * handbook reader shares that chunk (NoteEditor.tsx re-exports it), since it uses the same preview.
 */
type Editor = typeof NoteEditor
type Reader = typeof HandbookNote
type Chunk = typeof import('./NoteEditor')

let loaded: Chunk | undefined
let loading: Promise<Chunk> | undefined

function loadChunk(): Promise<Chunk> {
  loading ??= import('./NoteEditor').then(
    (module) => (loaded = module),
    (error: unknown) => {
      // Allow another attempt, for example once the network is back.
      loading = undefined
      throw error
    },
  )
  return loading
}

export function preloadNoteEditor(): Promise<Editor> {
  return loadChunk().then((module) => module.NoteEditor)
}

/** The editor component if its code has already loaded. */
export function loadedNoteEditor(): Editor | undefined {
  return loaded?.NoteEditor
}

export function preloadHandbookNote(): Promise<Reader> {
  return loadChunk().then((module) => module.HandbookNote)
}

/** The handbook reader if its code has already loaded. */
export function loadedHandbookNote(): Reader | undefined {
  return loaded?.HandbookNote
}
