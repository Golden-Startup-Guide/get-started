import { create } from 'zustand'
import { catalog, loaders } from 'virtual:core-content'
import type { CoreNote } from '../types'

/** The built-in handbooks' libraries, shelves, and notebooks: part of the app, always present. */
export const CORE_CATALOG = catalog

interface CoreState {
  /** Every handbook note, once loaded. */
  notes: CoreNote[]
  loaded: boolean
  /** Loading failed (in practice only offline before the app was fully installed). */
  failed: boolean
  load: () => Promise<void>
}

let loading: Promise<void> | undefined

/**
 * The handbooks' notes. Their text is not part of the start-up script: each library's notes are a
 * file of their own, precached with the app, loaded once in the background after start-up, or at
 * once when a handbook page or note is opened.
 */
export const useCoreStore = create<CoreState>()((set) => ({
  notes: [],
  loaded: false,
  failed: false,
  load: () => {
    loading ??= Promise.all(CORE_CATALOG.libraries.map((library) => loaders[library.id]()))
      .then((lists) => set({ notes: lists.flat(), loaded: true, failed: false }))
      .catch(() => {
        loading = undefined
        set({ failed: true })
      })
    return loading
  },
}))
