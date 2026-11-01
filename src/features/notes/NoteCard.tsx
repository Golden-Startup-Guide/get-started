import { memo } from 'react'
import {
  Heart,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type {
  Note,
} from '../../types'
import { CARD_PREVIEW_LENGTH, highlight, formatDate } from './noteDisplay'

// Memoized: the grid can hold thousands of cards, and they must not re-render when unrelated
// state changes, such as the editor opening. Handlers receive the note so the parent can pass
// the same function to every card.
export const NoteCard = memo(function NoteCard({
  note,
  notebook,
  query,
  onOpen,
  onFlag,
  isTrash,
  onRestore,
  onPermanentDelete,
  position,
  setSize,
}: {
  note: Note
  notebook: string
  query: string
  isTrash: boolean
  onOpen: (note: Note) => void
  onFlag: (note: Note, flag: 'pinned' | 'favorite') => void
  onRestore: (note: Note) => void
  onPermanentDelete: (note: Note) => void
  /** 1-based position and total, for screen readers when the grid renders only part of the list. */
  position?: number
  setSize?: number
}) {
  return (
    <article className="note-card group relative" aria-posinset={position} aria-setsize={setSize}>
      <button onClick={() => onOpen(note)} className="absolute inset-0 z-0 rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b45d4d]" aria-label={`Open note ${note.title || 'Untitled note'}`} />
      <div className="relative z-10 pointer-events-none">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-xs text-[var(--muted)]">{highlight(notebook, query)}</span>
          {!isTrash && <div className="pointer-events-auto flex gap-1">
            <button className={`card-action ${note.pinned ? 'card-action-active' : ''}`} onClick={() => onFlag(note, 'pinned')} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={Boolean(note.pinned)}><Pin size={15} /></button>
            <button className={`card-action ${note.favorite ? 'card-action-favorite' : ''}`} onClick={() => onFlag(note, 'favorite')} aria-label={note.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={Boolean(note.favorite)}><Heart size={15} fill={note.favorite ? 'currentColor' : 'none'} /></button>
          </div>}
        </div>
        <h2 className="line-clamp-2 text-base font-semibold leading-snug">{highlight(note.title || 'Untitled note', query)}</h2>
        <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{highlight(note.content.slice(0, CARD_PREVIEW_LENGTH), query) || 'No content yet.'}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(note.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>{highlight(tag, query)}</span>)}
          {note.pinned && <span className="tag-chip tag-chip-pin"><Pin size={11} /> Pinned</span>}
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">{isTrash ? `Moved to Trash ${formatDate(note.deletedAt ?? note.updatedAt)}` : `Updated ${formatDate(note.updatedAt)}`}</p>
        {isTrash && <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
          <button className="secondary-button" onClick={() => onRestore(note)}><RotateCcw size={14} /> Restore</button>
          <button className="danger-button" onClick={() => onPermanentDelete(note)}><Trash2 size={14} /> Delete forever</button>
        </div>}
      </div>
    </article>
  )
})
