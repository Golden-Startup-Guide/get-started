import { create } from 'zustand'
import { getReadingRecords, recordReading, saveReadingPosition } from '../lib/notes'
import type { ReadingRecord } from '../types'

interface ReadingState {
  /** Every note opened, the most recent first. */
  records: ReadingRecord[]
  loaded: boolean
  refresh: () => Promise<void>
  /** Records that a note was opened now. */
  opened: (noteId: string) => Promise<void>
  /** Remembers how far through a note the reader is, from 0 to 1. */
  savePosition: (noteId: string, position: number) => Promise<void>
}

/**
 * What the reader has opened: for Continue reading on Home, and the place marked in a notebook's
 * contents. Kept on this device only (the reading store), never in backups.
 */
export const useReadingStore = create<ReadingState>()((set) => ({
  records: [],
  loaded: false,
  refresh: async () => {
    try {
      set({ records: await getReadingRecords(), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  savePosition: async (noteId, position) => {
    try {
      await saveReadingPosition(noteId, position)
    } catch {
      return
    }
    set((state) => ({ records: state.records.map((record) => (record.noteId === noteId ? { ...record, position } : record)) }))
  },
  opened: async (noteId) => {
    try {
      await recordReading(noteId)
    } catch {
      return
    }
    await useReadingStore.getState().refresh()
  },
}))

/** The most recently opened of the given notes, if any were opened. */
export function lastOpenedAmong(records: ReadingRecord[], noteIds: ReadonlySet<string>): ReadingRecord | undefined {
  return records.find((record) => noteIds.has(record.noteId))
}
