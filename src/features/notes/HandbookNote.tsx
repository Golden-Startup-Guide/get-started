import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, BookOpen, Copy, NotebookPen, X } from 'lucide-react'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { headingSlug } from '../../lib/headings'
import { buildTitleIndex, normalizeTitle, targetTitle } from '../../lib/wikilinks'
import type { CoreNote, CoreNoteType, Note } from '../../types'
import { MarkdownPreview, type WikilinkTarget } from './MarkdownPreview'
import { t } from '../../i18n/i18n'

const TYPE_LABELS: Record<CoreNoteType, () => string> = {
  Article: () => t('Article'),
  Guide: () => t('Guide'),
  Chapter: () => t('Chapter'),
  Handbook: () => t('Handbook'),
}

/**
 * A built-in handbook note, for reading. Handbooks are read-only: to change one, the reader makes a
 * personal copy, or writes a personal note about it that links back here.
 */
export function HandbookNote({
  note,
  location,
  notes,
  onOpenNote,
  onClose,
  onMakeCopy,
  onWriteAbout,
}: {
  note: CoreNote
  /** Where it sits: "Library / Shelf / Notebook". */
  location: string
  /** Every note a [[link]] could reach: handbook notes first, then personal ones. */
  notes: Note[]
  onOpenNote: (note: Note, section?: string) => void
  onClose: () => void
  onMakeCopy: () => void
  onWriteAbout: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [note.id])

  const titleIndex = useMemo(() => buildTitleIndex(notes), [notes])
  const noteById = useMemo(() => new Map(notes.map((item) => [item.id, item])), [notes])
  const resolveWikilink = useCallback((target: string): WikilinkTarget | undefined => {
    const title = targetTitle(target).trim()
    return title ? titleIndex.get(normalizeTitle(title)) : { id: note.id, title: note.title }
  }, [titleIndex, note.id, note.title])
  const openWikilink = useCallback((target: WikilinkTarget) => {
    if (target.id === note.id) {
      const heading = target.section ? document.getElementById(`heading-${headingSlug(target.section)}`) : null
      heading?.scrollIntoView?.({ block: 'start' })
      return
    }
    const related = noteById.get(target.id)
    if (related) onOpenNote(related, target.section)
  }, [noteById, note.id, onOpenNote])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <article className="editor-card handbook-note" role="dialog" aria-modal="true" aria-labelledby="handbook-title" onKeyDown={(event) => keepFocusInDialog(event, onClose)}>
        <header className="editor-header">
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label={t('Close note')}><ArrowLeft size={18} aria-hidden="true" /></button>
          <div className="min-w-0 flex-1">
            <p className="section-label flex items-center gap-1.5"><BookOpen size={13} aria-hidden="true" /> {t('Handbook')} · {location}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('Close note')}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="handbook-body">
          <div className="handbook-column">
            <p className="handbook-type">{TYPE_LABELS[note.type]()}</p>
            <h1 id="handbook-title" className="handbook-title">{note.title}</h1>
            <p className="handbook-summary">{note.summary}</p>
            <p className="handbook-meta">
              {note.draft
                ? <span className="handbook-draft">{t('Draft: not yet reviewed')}</span>
                : note.reviewed ? t('Reviewed by {reviewer}', { reviewer: note.reviewed }) : null}
            </p>
            <div className="prose-notes handbook-text">
              <MarkdownPreview markdown={note.content} noteId={note.id} resolveWikilink={resolveWikilink} onOpenWikilink={openWikilink} />
            </div>
          </div>
        </div>
        <footer className="editor-footer handbook-actions">
          <p className="text-xs text-[var(--muted)]">{t('Handbooks are read-only. Make a personal copy to change one.')}</p>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" onClick={onWriteAbout}><NotebookPen size={15} aria-hidden="true" /> {t('Write a note about this')}</button>
            <button className="primary-button" onClick={onMakeCopy}><Copy size={15} aria-hidden="true" /> {t('Make a personal copy')}</button>
          </div>
        </footer>
      </article>
    </div>
  )
}
