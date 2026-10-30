import type { Note, NoteLink } from '../../types'

export const MAX_VISIBLE_GRAPH_NEIGHBORS = 8

export interface GraphNeighbor {
  note: Note
  outgoing: boolean
  incoming: boolean
}

export function getGraphNeighbors(
  focusNoteId: string,
  notes: Note[],
  links: NoteLink[],
): GraphNeighbor[] {
  const activeNotes = new Map(
    notes.filter((note) => note.deletedAt === undefined).map((note) => [note.id, note]),
  )
  const neighbors = new Map<string, GraphNeighbor>()

  for (const link of links) {
    if (link.sourceNoteId === focusNoteId) {
      const target = activeNotes.get(link.targetNoteId)
      if (target && target.id !== focusNoteId) {
        const existing = neighbors.get(target.id)
        neighbors.set(target.id, { note: target, outgoing: true, incoming: existing?.incoming ?? false })
      }
    }

    if (link.targetNoteId === focusNoteId) {
      const source = activeNotes.get(link.sourceNoteId)
      if (source && source.id !== focusNoteId) {
        const existing = neighbors.get(source.id)
        neighbors.set(source.id, { note: source, outgoing: existing?.outgoing ?? false, incoming: true })
      }
    }
  }

  return [...neighbors.values()].sort((a, b) =>
    (a.note.title || 'Untitled note').localeCompare(b.note.title || 'Untitled note') ||
    a.note.id.localeCompare(b.note.id),
  )
}
