import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Network } from 'lucide-react'
import type { Note, NoteLink } from '../../types'
import { getGraphNeighbors, MAX_VISIBLE_GRAPH_NEIGHBORS } from './graphModel'

interface KnowledgeGraphProps {
  notes: Note[]
  links: NoteLink[]
  noteLabel: (note: Note) => string
  onOpenNote: (note: Note) => void
}

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

export function KnowledgeGraph({ notes, links, noteLabel, onOpenNote }: KnowledgeGraphProps) {
  const activeNotes = useMemo(() => notes.filter((note) => note.deletedAt === undefined), [notes])
  const [focusNoteId, setFocusNoteId] = useState(() => activeNotes[0]?.id ?? '')

  useEffect(() => {
    if (!activeNotes.some((note) => note.id === focusNoteId)) {
      setFocusNoteId(activeNotes[0]?.id ?? '')
    }
  }, [activeNotes, focusNoteId])

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
        <h2 id="knowledge-graph-heading" className="mt-4 text-lg font-semibold">Relationship explorer</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">Create a note and connect it to others to explore your knowledge graph.</p>
      </section>
    )
  }

  const outgoing = neighbors.filter((neighbor) => neighbor.outgoing)
  const backlinks = neighbors.filter((neighbor) => neighbor.incoming)

  return (
    <section aria-labelledby="knowledge-graph-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="knowledge-graph-heading" className="text-xl font-semibold">Relationship explorer</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Explore direct links and backlinks between your saved notes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="graph-focus-note" className="text-sm font-medium">Explore note</label>
          <select
            id="graph-focus-note"
            className="small-input min-w-0 max-w-full sm:min-w-64"
            value={activeFocusNoteId}
            onChange={(event) => setFocusNoteId(event.target.value)}
          >
            {activeNotes.map((note) => (
              <option key={note.id} value={note.id}>{noteLabel(note)}</option>
            ))}
          </select>
        </div>
      </div>

      {focusNote && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="min-w-0">
              <p className="section-label">Focused note</p>
              <p className="truncate font-medium">{label}</p>
            </div>
            <button className="secondary-button shrink-0" onClick={() => onOpenNote(focusNote)}>
              <ExternalLink size={15} aria-hidden="true" /> Open in editor
            </button>
          </div>

          <div
            role="group"
            aria-label="Connected note graph"
            aria-describedby="graph-instructions"
            className="relative mx-auto aspect-[3/2] min-h-[280px] w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-alt)]"
          >
            <p id="graph-instructions" className="sr-only">
              The focused note is in the center. Select a connected note to explore its relationships.
              Arrows point from the note that links to the note it links to.
            </p>
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 600 400"
              preserveAspectRatio="none"
            >
              <defs>
                <marker id="graph-arrow-out" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="#d77762" />
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
                      stroke="#d77762"
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
              className="absolute z-10 flex min-h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border-2 border-[#d77762] bg-[var(--surface)] px-2 py-2 text-center text-xs font-semibold shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b45d4d]"
              style={{ left: `${(graphCenter.x / 600) * 100}%`, top: `${(graphCenter.y / 400) * 100}%` }}
              aria-label={`Explore ${label}`}
              aria-pressed="true"
              onClick={() => setFocusNoteId(focusNote.id)}
            >
              <span className="line-clamp-2">{label}</span>
            </button>
            {visibleNeighbors.map((neighbor, index) => (
              <button
                key={neighbor.note.id}
                className="absolute z-10 flex min-h-14 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-center text-xs shadow-sm hover:border-[#d77762] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b45d4d]"
                style={{ left: `${(positions[index].x / 600) * 100}%`, top: `${(positions[index].y / 400) * 100}%` }}
                aria-label={`Explore ${noteLabel(neighbor.note)}`}
                aria-pressed="false"
                onClick={() => setFocusNoteId(neighbor.note.id)}
              >
                <span className="line-clamp-2">{noteLabel(neighbor.note)}</span>
              </button>
            ))}
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {label}: {outgoing.length} outgoing {outgoing.length === 1 ? 'link' : 'links'} and {backlinks.length} {backlinks.length === 1 ? 'backlink' : 'backlinks'}.
          </p>
          {neighbors.length > MAX_VISIBLE_GRAPH_NEIGHBORS && (
            <p className="text-xs text-[var(--muted)]">
              The visual graph shows {MAX_VISIBLE_GRAPH_NEIGHBORS} of {neighbors.length} direct connections. All connections are listed below.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <RelationshipList
              title="Links from this note"
              icon={<ArrowUpRight size={15} aria-hidden="true" />}
              notes={outgoing}
              emptyText="No links from this note yet."
              noteLabel={noteLabel}
              onExplore={(note) => setFocusNoteId(note.id)}
            />
            <RelationshipList
              title="Backlinks to this note"
              icon={<ArrowDownLeft size={15} aria-hidden="true" />}
              notes={backlinks}
              emptyText="No notes link to this one yet."
              noteLabel={noteLabel}
              onExplore={(note) => setFocusNoteId(note.id)}
            />
          </div>

          <p className="text-xs text-[var(--muted)]">
            Notes in Trash are hidden from the graph; restore them to include their relationships again.
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
                className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--surface-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#b45d4d]"
                onClick={() => onExplore(note)}
                aria-label={`Explore ${noteLabel(note)}`}
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
