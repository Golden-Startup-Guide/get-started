import { create } from 'zustand'
import { getNote } from '../lib/notes'
import type { Note } from '../types'
import { useWorkspaceStore } from './workspaceStore'
import { t } from '../i18n/i18n'

interface EditorState {
  /** The note open in the editor, or null when the editor is closed. */
  activeNote: Note | null
  /** The open note has not been saved yet. */
  isCreating: boolean
  /** Bumped to remount the editor with the latest stored copy of the same note. */
  revision: number
  /** Another tab changed the open note. */
  changedElsewhere: boolean
  open: (note: Note, options?: { creating?: boolean }) => void
  close: () => void
  markChangedElsewhere: () => void
  keepMine: () => void
  /** Saves the open editor's pending edits; resolves to false if saving failed. Set by the editor. */
  flush: (() => Promise<boolean>) | null
  /** A heading to show when the next note opens, from a [[Note#Section]] link. */
  pendingSection: string | null
  setPendingSection: (section: string | null) => void
  setFlush: (flush: (() => Promise<boolean>) | null) => void
  /** Replaces the open note with its latest stored version, discarding this tab's draft. */
  loadLatest: () => Promise<void>
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  activeNote: null,
  isCreating: false,
  revision: 0,
  changedElsewhere: false,
  open: (note, { creating = false } = {}) => set({ activeNote: note, isCreating: creating, changedElsewhere: false }),
  close: () => set({ activeNote: null, isCreating: false, changedElsewhere: false }),
  markChangedElsewhere: () => set({ changedElsewhere: true }),
  keepMine: () => set({ changedElsewhere: false }),
  flush: null,
  setFlush: (flush) => set({ flush }),
  pendingSection: null,
  setPendingSection: (pendingSection) => set({ pendingSection }),
  loadLatest: async () => {
    const id = get().activeNote?.id
    if (!id) return
    set({ changedElsewhere: false })
    try {
      const latest = await getNote(id)
      if (!latest) {
        set({ activeNote: null, isCreating: false })
        useWorkspaceStore.getState().showNotice(t("The note you were editing was permanently deleted in another tab."))
        return
      }
      set((state) => ({ activeNote: latest, isCreating: false, revision: state.revision + 1 }))
    } catch {
      useWorkspaceStore.getState().showError(t("The latest version of this note could not be loaded. Please refresh."))
    }
  },
}))
