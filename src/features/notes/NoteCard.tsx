import { memo } from 'react'
import {
  Heart,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type {
  CoreNote,
  Note,
} from '../../types'
import { highlight, formatDate } from './noteDisplay'
import { CardPreview } from './CardPreview'
import { isCoreId } from '../../lib/core'
import { t } from '../../i18n/i18n'

// Memoized: the grid can hold thousands of cards, and they must not re-render when unrelated
// state changes, such as the editor opening. Handlers receive the note so the parent can pass
// the same function to every card.
export const NoteCard = memo(function NoteCard({
  note,
  notebook,
  highlights,
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
  /** Words and phrases from the search, to highlight. */
  highlights: readonly string[]
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
      <button onClick={() => onOpen(note)} className="absolute inset-0 z-0 rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]" aria-label={t('Open note {title}', { title: note.title || t('Untitled note') })} />
      <div className="relative z-10 pointer-events-none">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-xs text-[var(--muted)]">{highlight(notebook, highlights)}</span>
          {/* Handbook notes are read-only: no pins or favourites. */}
          {!isTrash && !isCoreId(note.id) && <div className="pointer-events-auto flex gap-1">
            <button className={`card-action ${note.pinned ? 'card-action-active' : ''}`} onClick={() => onFlag(note, 'pinned')} aria-label={note.pinned ? t("Unpin note") : t("Pin note")} aria-pressed={Boolean(note.pinned)}><Pin size={15} /></button>
            <button className={`card-action ${note.favorite ? 'card-action-favorite' : ''}`} onClick={() => onFlag(note, 'favorite')} aria-label={note.favorite ? t("Remove from favorites") : t("Add to favorites")} aria-pressed={Boolean(note.favorite)}><Heart size={15} fill={note.favorite ? 'currentColor' : 'none'} /></button>
          </div>}
        </div>
        <h2 className="line-clamp-2 text-base font-semibold leading-snug">{highlight(note.title || t('Untitled note'), highlights)}</h2>
        <CardPreview content={note.content} highlights={highlights} />
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(note.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>{highlight(tag, highlights)}</span>)}
          {note.pinned && <span className="tag-chip tag-chip-pin"><Pin size={11} /> {t("Pinned")}</span>}
          {(note as Partial<CoreNote>).draft && <span className="tag-chip">{t('Draft')}</span>}
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">{isTrash ? t("Moved to Trash {formatDate}", { formatDate: formatDate(note.deletedAt ?? note.updatedAt) }) : t("Updated {formatDate}", { formatDate: formatDate(note.updatedAt) })}</p>
        {isTrash && <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
          <button className="secondary-button" onClick={() => onRestore(note)}><RotateCcw size={14} /> {t("Restore")}</button>
          <button className="danger-button" onClick={() => onPermanentDelete(note)}><Trash2 size={14} /> {t("Delete forever")}</button>
        </div>}
      </div>
    </article>
  )
})
