import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Note } from '../../types'
import { NoteCard } from './NoteCard'

// The same breakpoints as the grid's Tailwind classes (sm:grid-cols-2 xl:grid-cols-3).
const COLUMN_QUERIES = [['(min-width: 1280px)', 3], ['(min-width: 640px)', 2]] as const
// A card is at least 220 px tall; rows are measured once rendered, so this is only a start.
const ESTIMATED_ROW_HEIGHT = 260

function currentColumns(): number {
  for (const [query, columns] of COLUMN_QUERIES) {
    if (window.matchMedia?.(query).matches) return columns
  }
  return 1
}

function useColumnCount(): number {
  const [columns, setColumns] = useState(currentColumns)
  useEffect(() => {
    const lists = COLUMN_QUERIES.map(([query]) => window.matchMedia?.(query)).filter((list) => list !== undefined)
    const update = () => setColumns(currentColumns())
    for (const list of lists) list.addEventListener?.('change', update)
    return () => {
      for (const list of lists) list.removeEventListener?.('change', update)
    }
  }, [])
  return columns
}

/** Distance from the top of the document to the grid, kept current as content above it changes. */
function useOffsetFromDocumentTop(element: HTMLElement | null): number {
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setOffset(element.getBoundingClientRect().top + window.scrollY))
    // Anything above the grid that changes size (notices, forms) changes the body's size too.
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [element])
  return offset
}

/**
 * The note grid. Only the rows near the viewport exist in the DOM: rendering every card made
 * a 10,000-note library about 189,000 elements, which slowed start-up, search, and even
 * opening a note (see docs/PERFORMANCE.md). The page keeps its normal window scrolling.
 */
export function NoteGrid({
  notes,
  label,
  notebookName,
  highlights,
  isTrash,
  onOpen,
  onFlag,
  onRestore,
  onPermanentDelete,
}: {
  notes: Note[]
  label: string
  notebookName: (note: Note) => string
  highlights: readonly string[]
  isTrash: boolean
  onOpen: (note: Note) => void
  onFlag: (note: Note, flag: 'pinned' | 'favorite') => void
  onRestore: (note: Note) => void
  onPermanentDelete: (note: Note) => void
}) {
  const columns = useColumnCount()
  const [grid, setGrid] = useState<HTMLElement | null>(null)
  const scrollMargin = useOffsetFromDocumentTop(grid)
  const rows = useMemo(() => {
    const result: Note[][] = []
    for (let start = 0; start < notes.length; start += columns) result.push(notes.slice(start, start + columns))
    return result
  }, [columns, notes])

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 3,
    scrollMargin,
    getItemKey: (index) => rows[index]?.[0]?.id ?? index,
  })

  return (
    <section
      // The state setter is stable, so React attaches this ref once.
      ref={setGrid}
      role="feed"
      aria-busy={false}
      aria-label={label}
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute start-0 top-0 grid w-full gap-4 pb-4 sm:grid-cols-2 xl:grid-cols-3"
          style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
        >
          {rows[row.index].map((note, column) => (
            <NoteCard
              key={note.id}
              note={note}
              notebook={notebookName(note)}
              highlights={highlights}
              isTrash={isTrash}
              position={row.index * columns + column + 1}
              setSize={notes.length}
              onOpen={onOpen}
              onFlag={onFlag}
              onRestore={onRestore}
              onPermanentDelete={onPermanentDelete}
            />
          ))}
        </div>
      ))}
    </section>
  )
}
