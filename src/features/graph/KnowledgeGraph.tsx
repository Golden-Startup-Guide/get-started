import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Network, ZoomIn, ZoomOut } from 'lucide-react'
import type { Note, NoteLink } from '../../types'
import { getGraphNeighbors, MAX_VISIBLE_GRAPH_NEIGHBORS } from './graphModel'
import { canDrawLibraryGraph } from './libraryGraphData'
import { t, tp } from '../../i18n/i18n'

// WebGL drawing and the layout are fetched only when the whole-library graph is first shown.
const LibraryGraph = lazy(() => import('./LibraryGraph'))

interface KnowledgeGraphProps {
  /** Every note the map can show: yours and the handbooks'. */
  notes: Note[]
  links: NoteLink[]
  /** Your own notes and their links, for the optional whole-library view. */
  libraryNotes: Note[]
  libraryLinks: NoteLink[]
  /** The note to start around: one sent from a note, or the one read last. */
  initialFocusId?: string
  /** Notes matching the search, or undefined when not searching. */
  matchingIds?: ReadonlySet<string>
  /** 'light' or 'dark'. */
  theme: string
  noteLabel: (note: Note) => string
  onOpenNote: (note: Note) => void
}

type GraphMode = 'library' | 'note'

interface GraphPosition {
  x: number
  y: number
}

const graphCenter: GraphPosition = { x: 300, y: 200 }

function getEdgePath(from: GraphPosition, to: GraphPosition, offset: number): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const start = { x: from.x + (dx / length) * 56, y: from.y + (dy / length) * 56 }
  const end = { x: to.x - (dx / length) * 60, y: to.y - (dy / length) * 60 }
  const controlX = (start.x + end.x) / 2 + (dy / length) * offset
  const controlY = (start.y + end.y) / 2 - (dx / length) * offset
  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`
}

/**
 * The note map (design specification, section 4): a note and the notes it links to or is
 * mentioned in, drawn around it, with the same connections listed below, so the map is never the
 * only way to reach a note. A view of your whole library is offered too, never first.
 */
export function KnowledgeGraph({ notes, links, libraryNotes, libraryLinks, initialFocusId, matchingIds, theme, noteLabel, onOpenNote }: KnowledgeGraphProps) {
  const activeNotes = useMemo(() => notes.filter((note) => note.deletedAt === undefined), [notes])
  const activeLibraryNotes = useMemo(() => libraryNotes.filter((note) => note.deletedAt === undefined), [libraryNotes])
  const [mode, setMode] = useState<GraphMode>('note')
  const [focusNoteId, setFocusNoteId] = useState(() => (activeNotes.some((note) => note.id === initialFocusId) ? initialFocusId! : activeNotes[0]?.id ?? ''))
  const [zoom, setZoom] = useState(1)
  const listRef = useRef<HTMLHeadingElement>(null)
  // While searching, the explorer offers only the matching notes (and the one shown).
  const choices = useMemo(
    () => (matchingIds ? activeNotes.filter((note) => matchingIds.has(note.id) || note.id === focusNoteId) : activeNotes),
    [activeNotes, matchingIds, focusNoteId],
  )
  // If the chosen note leaves the graph (trashed or deleted), show the first note instead.
  const focusNote = activeNotes.find((note) => note.id === focusNoteId) ?? activeNotes[0]
  const activeFocusNoteId = focusNote?.id ?? ''
  const neighbors = useMemo(
    () => getGraphNeighbors(activeFocusNoteId, activeNotes, links),
    [activeNotes, activeFocusNoteId, links],
  )
  const visibleNeighbors = neighbors.slice(0, MAX_VISIBLE_GRAPH_NEIGHBORS)
  const positions = visibleNeighbors.map((_, index): GraphPosition => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / visibleNeighbors.length
    return {
      x: graphCenter.x + Math.cos(angle) * 220,
      y: graphCenter.y + Math.sin(angle) * 140,
    }
  })
  const label = focusNote ? noteLabel(focusNote) : ''

  if (!activeNotes.length) {
    return (
      <section aria-labelledby="knowledge-graph-heading" className="empty-state">
        <span className="empty-icon"><Network size={24} aria-hidden="true" /></span>
        <h2 id="knowledge-graph-heading" className="mt-4 text-lg font-semibold">{t("Note map")}</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">{t("Create a note and connect it to others to see them on the map.")}</p>
      </section>
    )
  }

  const outgoing = neighbors.filter((neighbor) => neighbor.outgoing)
  const backlinks = neighbors.filter((neighbor) => neighbor.incoming)

  // The whole-library view needs WebGL 2; without it, only the map around a note is offered.
  const modeSwitch = canDrawLibraryGraph() && (
    <div className="segmented" role="group" aria-label={t("Graph view")}>
      <button type="button" aria-pressed={mode === 'note'} onClick={() => setMode('note')}>{t("Around a note")}</button>
      <button type="button" aria-pressed={mode === 'library'} onClick={() => setMode('library')}>{t("Whole library")}</button>
    </div>
  )

  if (mode === 'library') {
    return (
      <section aria-labelledby="knowledge-graph-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="knowledge-graph-heading" className="text-xl font-semibold">{t("Whole library")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("Every note and link. Point at a note to pick out its links; search to narrow the graph.")}</p>
          </div>
          {modeSwitch}
        </div>
        <Suspense fallback={<p role="status" className="py-16 text-center text-[var(--muted)]">{t("Loading the graph…")}</p>}>
          <LibraryGraph
            notes={activeLibraryNotes}
            links={libraryLinks}
            matchingIds={matchingIds}
            noteLabel={noteLabel}
            theme={theme}
            onOpenNote={onOpenNote}
            onExplore={(note) => {
              setFocusNoteId(note.id)
              setMode('note')
            }}
          />
        </Suspense>
      </section>
    )
  }

  return (
    <section aria-labelledby="knowledge-graph-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="knowledge-graph-heading" className="text-xl font-semibold">{t("Around a note")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("A note in the middle, with the notes it links to and the notes that mention it. Choose one to move the map to it.")}</p>
        </div>
        {modeSwitch}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="graph-focus-note" className="text-sm font-medium">{t("Explore note")}</label>
          <select
            id="graph-focus-note"
            className="small-input min-w-0 max-w-full sm:min-w-64"
            value={activeFocusNoteId}
            onChange={(event) => setFocusNoteId(event.target.value)}
          >
            {choices.map((note) => (
              <option key={note.id} value={note.id}>{noteLabel(note)}</option>
            ))}
          </select>
        </div>
      </div>

      {focusNote && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="min-w-0">
              <p className="section-label">{t("Focused note")}</p>
              <p className="truncate font-medium">{label}</p>
            </div>
            <button className="secondary-button shrink-0" onClick={() => onOpenNote(focusNote)}>
              <ExternalLink size={15} aria-hidden="true" /> {t("Open note")}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="secondary-button" onClick={() => listRef.current?.focus()}>{t("Skip to the list")}</button>
            <div className="flex gap-1" role="group" aria-label={t("Zoom")}>
              <button type="button" className="icon-button" aria-label={t("Zoom out")} disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}><ZoomOut size={16} aria-hidden="true" /></button>
              <button type="button" className="secondary-button" onClick={() => setZoom(1)}>{t("Reset zoom")}</button>
              <button type="button" className="icon-button" aria-label={t("Zoom in")} disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}><ZoomIn size={16} aria-hidden="true" /></button>
            </div>
          </div>

          <div
            role="group"
            aria-label={t("Connected note graph")}
            aria-describedby="graph-instructions"
            className="relative mx-auto aspect-[3/2] min-h-[280px] w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)]"
          >
            <p id="graph-instructions" className="sr-only">
              {t("The focused note is in the center. Select a connected note to explore its relationships. Arrows point from the note that links to the note it links to.")}
            </p>
            {/* Zoomed from the middle; the map's own size and the list below stay as they are. */}
            <div className="absolute inset-0 transition-transform" style={{ transform: `scale(${zoom})` }}>
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 600 400"
              preserveAspectRatio="none"
            >
              <defs>
                <marker id="graph-arrow-out" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="var(--accent)" />
                </marker>
                <marker id="graph-arrow-in" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="var(--muted)" />
                </marker>
              </defs>
              {visibleNeighbors.flatMap((neighbor, index) => {
                const position = positions[index]
                const bidirectional = neighbor.outgoing && neighbor.incoming
                return [
                  neighbor.outgoing && (
                    <path
                      key={`${neighbor.note.id}-outgoing`}
                      d={getEdgePath(graphCenter, position, bidirectional ? 12 : 0)}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                      markerEnd="url(#graph-arrow-out)"
                    />
                  ),
                  neighbor.incoming && (
                    <path
                      key={`${neighbor.note.id}-incoming`}
                      d={getEdgePath(position, graphCenter, bidirectional ? 12 : 0)}
                      fill="none"
                      stroke="var(--muted)"
                      strokeWidth="2"
                      strokeDasharray="5 4"
                      markerEnd="url(#graph-arrow-in)"
                    />
                  ),
                ]
              })}
            </svg>
            <button
              className="absolute z-10 flex min-h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border-2 border-[var(--accent)] bg-[var(--surface)] px-2 py-2 text-center text-xs font-semibold shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              style={{ left: `${(graphCenter.x / 600) * 100}%`, top: `${(graphCenter.y / 400) * 100}%` }}
              aria-label={t("Explore {label}", { label })}
              aria-pressed="true"
              onClick={() => setFocusNoteId(focusNote.id)}
            >
              <span className="line-clamp-2">{label}</span>
            </button>
            {visibleNeighbors.map((neighbor, index) => (
              <button
                key={neighbor.note.id}
                className="absolute z-10 flex min-h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-center text-xs shadow-sm hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                style={{ left: `${(positions[index].x / 600) * 100}%`, top: `${(positions[index].y / 400) * 100}%` }}
                aria-label={t("Explore {noteLabel}", { noteLabel: noteLabel(neighbor.note) })}
                aria-pressed="false"
                onClick={() => setFocusNoteId(neighbor.note.id)}
              >
                <span className="line-clamp-2">{noteLabel(neighbor.note)}</span>
              </button>
            ))}
            </div>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {label}: {tp(outgoing.length, '{count} outgoing link', '{count} outgoing links')}, {tp(backlinks.length, 'mentioned in {count} note', 'mentioned in {count} notes')}.
          </p>
          {neighbors.length > MAX_VISIBLE_GRAPH_NEIGHBORS && (
            <p className="text-xs text-[var(--muted)]">
              {tp(neighbors.length, 'The visual graph shows {shown} of {count} direct connection. All connections are listed below.', 'The visual graph shows {shown} of {count} direct connections. All connections are listed below.', { shown: MAX_VISIBLE_GRAPH_NEIGHBORS })}
            </p>
          )}

          <h3 ref={listRef} tabIndex={-1} className="text-base font-semibold">{t("The same notes, as a list")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <RelationshipList
              title={t("Links from this note")}
              icon={<ArrowUpRight size={15} aria-hidden="true" />}
              notes={outgoing}
              emptyText={t("No links from this note yet.")}
              noteLabel={noteLabel}
              onExplore={(note) => setFocusNoteId(note.id)}
            />
            <RelationshipList
              title={t("Mentioned in")}
              icon={<ArrowDownLeft size={15} aria-hidden="true" />}
              notes={backlinks}
              emptyText={t("No notes mention this one yet.")}
              noteLabel={noteLabel}
              onExplore={(note) => setFocusNoteId(note.id)}
            />
          </div>

          <p className="text-xs text-[var(--muted)]">
            {t("Notes in Trash are hidden from the graph; restore them to include their relationships again.")}
          </p>
        </>
      )}
    </section>
  )
}

function RelationshipList({
  title,
  icon,
  notes,
  emptyText,
  noteLabel,
  onExplore,
}: {
  title: string
  icon: React.ReactNode
  notes: ReturnType<typeof getGraphNeighbors>
  emptyText: string
  noteLabel: (note: Note) => string
  onExplore: (note: Note) => void
}) {
  return (
    <section aria-label={title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
      {notes.length ? (
        <ul className="space-y-1">
          {notes.map(({ note }) => (
            <li key={note.id}>
              <button
                className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--surface-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                onClick={() => onExplore(note)}
                aria-label={t("Explore {noteLabel}", { noteLabel: noteLabel(note) })}
              >
                {noteLabel(note)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--muted)]">{emptyText}</p>
      )}
    </section>
  )
}
