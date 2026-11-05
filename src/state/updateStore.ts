import { create } from 'zustand'
import { useEditorStore } from './editorStore'

interface UpdateState {
  /** A new version has been downloaded and is waiting. */
  ready: boolean
  /** "Later" was chosen; asked again on the next visit. */
  dismissed: boolean
  /** Switches to the new version and reloads (set when the service worker is registered). */
  activate?: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>()(() => ({ ready: false, dismissed: false }))

/** A new version is waiting; `activate` switches to it and reloads. */
export function updateReady(activate: () => Promise<void>) {
  useUpdateStore.setState({ ready: true, dismissed: false, activate })
}

/**
 * Reloads into the new version, after saving the note being edited. If it cannot be saved, the
 * update waits, so nothing typed is lost; the editor shows why.
 */
export async function applyUpdate(): Promise<boolean> {
  const flush = useEditorStore.getState().flush
  if (flush && !(await flush())) return false
  await useUpdateStore.getState().activate?.()
  return true
}
