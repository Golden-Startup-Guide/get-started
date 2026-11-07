import type { Note, NoteLink } from '../types'

export interface RelatedNote {
  note: Note
  /** Why it is related, in plain words, for the reader. */
  reason: RelatedReason
}

export type RelatedReason =
  | { kind: 'links-to' }
  | { kind: 'same-notebook' }
  | { kind: 'same-shelf' }
  | { kind: 'shared-tag'; tag: string }

const SCORES = { 'links-to': 4, 'shared-tag': 3, 'same-notebook': 2, 'same-shelf': 1 } as const
const MAX_RELATED = 5

/** The notes that link to this one (stored links and [[links]] in their text), each once. */
export function mentionsOf(noteId: string, links: readonly NoteLink[], noteById: ReadonlyMap<string, Note>): Note[] {
  const seen = new Set<string>()
  const mentions: Note[] = []
  for (const link of links) {
    if (link.targetNoteId !== noteId || link.sourceNoteId === noteId || seen.has(link.sourceNoteId)) continue
    const source = noteById.get(link.sourceNoteId)
    if (!source || source.deletedAt !== undefined) continue
    seen.add(source.id)
    mentions.push(source)
  }
  return mentions
}

/**
 * Up to five notes related to this one, each with its strongest reason (design specification,
 * section 4): notes it links to, then notes sharing a tag, then others in its notebook, then
 * others on its shelf. Notes that mention it are left out, since they are listed as mentions; so
 * are `exclude`d ones (the notes before and after it, already named).
 */
export function relatedNotes({
  note,
  notes,
  links,
  shelfOf,
  exclude = new Set(),
}: {
  note: Note
  notes: readonly Note[]
  links: readonly NoteLink[]
  /** The shelf a notebook is on. */
  shelfOf: (notebookId: string | undefined) => string | undefined
  exclude?: ReadonlySet<string>
}): RelatedNote[] {
  const linkedTo = new Set(links.filter((link) => link.sourceNoteId === note.id).map((link) => link.targetNoteId))
  const mentioning = new Set(links.filter((link) => link.targetNoteId === note.id).map((link) => link.sourceNoteId))
  const tags = new Set((note.tags ?? []).map((tag) => tag.toLocaleLowerCase()))
  const shelf = shelfOf(note.notebookId)
  const found: Array<RelatedNote & { score: number }> = []
  for (const other of notes) {
    if (other.id === note.id || other.deletedAt !== undefined || mentioning.has(other.id) || exclude.has(other.id)) continue
    const sharedTag = (other.tags ?? []).find((tag) => tags.has(tag.toLocaleLowerCase()))
    const reason: RelatedReason | undefined = linkedTo.has(other.id)
      ? { kind: 'links-to' }
      : sharedTag
        ? { kind: 'shared-tag', tag: sharedTag }
        : note.notebookId && other.notebookId === note.notebookId
          ? { kind: 'same-notebook' }
          : shelf && shelfOf(other.notebookId) === shelf
            ? { kind: 'same-shelf' }
            : undefined
    if (reason) found.push({ note: other, reason, score: SCORES[reason.kind] })
  }
  return found
    .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
    .slice(0, MAX_RELATED)
    .map(({ note: related, reason }) => ({ note: related, reason }))
}
