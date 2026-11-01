import { create } from 'zustand'
import {
  getStoragePersistence,
  requestStoragePersistence,
  type StoragePersistence,
} from '../features/notes/storagePersistence'

interface PersistenceState {
  status: StoragePersistence
  /** Whether this session already asked the browser. */
  requested: boolean
  load: () => Promise<void>
  /** Asks once per session, after the first save, so there is real data worth protecting. */
  requestAfterSave: () => void
  /** Asks now (from Settings) and returns the browser's answer. */
  requestNow: () => Promise<StoragePersistence>
}

export const usePersistenceStore = create<PersistenceState>()((set, get) => ({
  status: 'unsupported',
  requested: false,
  load: async () => set({ status: await getStoragePersistence() }),
  requestAfterSave: () => {
    if (get().status !== 'best-effort' || get().requested) return
    set({ requested: true })
    // Never await this: Firefox answers only when the user responds to its permission
    // prompt, and waiting would hold the save (and every queued autosave) until then.
    void requestStoragePersistence().then((status) => set({ status }))
  },
  requestNow: async () => {
    set({ requested: true })
    const status = await requestStoragePersistence()
    set({ status })
    return status
  },
}))
