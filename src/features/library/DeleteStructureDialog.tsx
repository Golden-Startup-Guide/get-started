import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { deleteStructure, type StructureItem } from '../../state/actions'
import { useLibraryStore } from '../../state/libraryStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

/** Focus target when the element that opened the dialog no longer exists after deleting. */
export const FALLBACK_FOCUS_ID = 'sidebar-new-note'

type LibraryLists = Pick<ReturnType<typeof useLibraryStore.getState>, 'notebooks' | 'shelves' | 'libraries'>

function destinationsFor(target: StructureItem, { notebooks, shelves, libraries }: LibraryLists) {
  if (target.kind === 'notebook') return notebooks.filter((item) => item.id !== target.item.id)
  if (target.kind === 'shelf') return shelves.filter((item) => item.libraryId === target.item.libraryId && item.id !== target.item.id)
  return libraries.filter((item) => item.id !== target.item.id)
}

export function DeleteStructureDialog({ target }: { target: StructureItem }) {
  const close = () => useWorkspaceStore.getState().askToDelete(null)
  // Subscribing keeps the destination list current if another tab changes the library.
  const notebooks = useLibraryStore((state) => state.notebooks)
  const shelves = useLibraryStore((state) => state.shelves)
  const libraries = useLibraryStore((state) => state.libraries)
  const destinations = destinationsFor(target, { notebooks, shelves, libraries })
  const [destination, setDestination] = useState(() => destinations[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const destinationRef = useRef<HTMLSelectElement>(null)

  // Return focus to whatever opened the dialog, or to "New note" if that was deleted.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => destinationRef.current?.focus())
    return () => {
      requestAnimationFrame(() => {
        ;(opener?.isConnected ? opener : document.getElementById(FALLBACK_FOCUS_ID))?.focus()
      })
    }
  }, [])

  async function confirm() {
    try {
      await deleteStructure(target, destination)
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `The ${target.kind} could not be deleted.`)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <section className="dialog-card max-w-md" role="dialog" aria-modal="true" aria-labelledby="delete-structure-title" onKeyDown={(event) => keepFocusInDialog(event, close)}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="delete-structure-title" className="text-xl font-semibold">
              Delete {target.kind}?
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {target.kind === 'notebook'
                ? `Notes in “${target.item.name}” will be moved, not deleted.`
                : target.kind === 'shelf'
                  ? `Notebooks in “${target.item.name}” will be moved, not deleted.`
                  : `Shelves and notebooks in “${target.item.name}” will be moved, not deleted. Conflicting shelf names are renamed automatically.`}
            </p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        <label htmlFor="delete-destination" className="mt-5 block text-sm font-medium">
          {target.kind === 'notebook' ? 'Move notes to notebook' : target.kind === 'shelf' ? 'Move notebooks to shelf' : 'Move shelves to library'}
        </label>
        <select ref={destinationRef} id="delete-destination" className="small-input mt-2 w-full" value={destination} onChange={(event) => setDestination(event.target.value)}>
          {destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button className="secondary-button" onClick={close}>Cancel</button>
          <button className="danger-button" disabled={!destination} onClick={() => void confirm()}>Move contents and delete</button>
        </div>
      </section>
    </div>
  )
}
