import { create } from 'zustand'
import { checkAndRepairLibrary, describeRepairs } from '../lib/integrity'
import { useLibraryStore } from './libraryStore'
import { useWorkspaceStore } from './workspaceStore'

interface IntegrityState {
  /** When this session's check finished. */
  checkedAt?: number
  /** What it repaired, one phrase per kind. */
  repaired: string[]
  /** Why the check could not run. */
  failed?: string
}

export const useIntegrityStore = create<IntegrityState>()(() => ({ repaired: [] }))

/**
 * The start-up check: finds and repairs broken links, attachments and history left by deleted
 * notes, items whose notebook, shelf, or library is gone, and an outdated tag list. Repairs
 * other than the tag list are reported in a notice.
 */
export async function runIntegrityCheck() {
  try {
    const repairs = await checkAndRepairLibrary(useLibraryStore.getState())
    const repaired = repairs ? describeRepairs(repairs) : []
    useIntegrityStore.setState({ checkedAt: Date.now(), repaired, failed: undefined })
    if (!repairs) return
    await useLibraryStore.getState().refresh()
    const worthTelling = repaired.filter((phrase) => phrase !== 'rebuilt the tag list')
    if (worthTelling.length) {
      useWorkspaceStore.getState().showNotice(`My Notes checked your library and repaired it: ${worthTelling.join('; ')}.`)
    }
  } catch (reason) {
    useIntegrityStore.setState({ checkedAt: Date.now(), failed: reason instanceof Error ? reason.message : 'The check could not run.' })
  }
}
