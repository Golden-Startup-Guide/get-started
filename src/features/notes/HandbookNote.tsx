import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Copy, Network, NotebookPen, Type, X } from 'lucide-react'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { headingSlug } from '../../lib/headings'
import { readingMinutes } from '../../lib/readingTime'
import { buildTitleIndex, normalizeTitle, targetTitle } from '../../lib/wikilinks'
import type { RelatedNote, RelatedReason } from '../../lib/related'
import type { CoreNote, CoreNoteType, Note, ReaderSettings, ThemeChoice } from '../../types'
import { MarkdownPreview, type WikilinkTarget } from './MarkdownPreview'
import { ReaderControls } from './ReaderControls'
import { t, tp } from '../../i18n/i18n'

const TYPE_LABELS: Record<CoreNoteType, () => string> = {
  Article: () => t('Article'),
  Guide: () => t('Guide'),
  Chapter: () => t('Chapter'),
  Handbook: () => t('Handbook'),
}

/** Why a note is related, in plain words. */
function reasonText(reason: RelatedReason): string {
  switch (reason.kind) {
    case 'links-to': return t('Linked from this note')
    case 'shared-tag': return t('Shares the tag {tag}', { tag: reason.tag })
    case 'same-notebook': return t('In the same notebook')
    case 'same-shelf': return t('On the same shelf')
  }
}

// The reading column: text size, line spacing, and line length, as CSS custom properties.
const SCALE: Record<ReaderSettings['size'], number> = { small: 0.9, medium: 1, large: 1.15, larger: 1.3 }
const LEADING: Record<ReaderSettings['spacing'], number> = { normal: 1.7, roomy: 1.95 }
// Line length, in characters: the design specification asks for 62–72 at the default.
const CHARACTERS: Record<ReaderSettings['width'], number> = { narrow: 56, medium: 66, wide: 78 }
// Used until the font is measured (and where nothing can be measured): about the same in most fonts.
const MEASURE: Record<ReaderSettings['width'], string> = { narrow: '27em', medium: '32em', wide: '38em' }
// Ordinary text to measure the font by: the width of a character depends on the font the device
// has (no font is downloaded), so a fixed width in ch or em gives 62 characters in one font and 80
// in another.
const SAMPLE = 'The quick brown fox jumps over the lazy dog, then rests by the river a while.'

/**
 * The reading room for a built-in handbook note (design specification, section 4): one comfortable
 * column, reader settings, a quiet position cue, and the notes before and after it by name. The
 * place in the note is remembered. Handbooks are read-only: to change one, the reader makes a
 * personal copy, or writes a personal note about it that links back here.
 */
export function HandbookNote({
  note,
  location,
  notebookNotes,
  notes,
  settings,
  theme,
  initialPosition,
  onSettings,
  onTheme,
  onPosition,
  onOpenNote,
  onClose,
  onMakeCopy,
  onWriteAbout,
  mentions,
  related,
  pathOf,
  onShowOnMap,
}: {
  note: CoreNote
  /** Where it sits: "Library / Shelf / Notebook". */
  location: string
  /** Its notebook's notes, in reading order. */
  notebookNotes: CoreNote[]
  /** Every note a [[link]] could reach: handbook notes first, then personal ones. */
  notes: Note[]
  settings: ReaderSettings
  theme: ThemeChoice
  /** How far through the note the reader was, from 0 to 1; undefined opens it at the start. */
  initialPosition?: number
  onSettings: (settings: ReaderSettings) => void
  onTheme: (theme: ThemeChoice) => void
  onPosition: (noteId: string, position: number) => void
  onOpenNote: (note: Note, section?: string) => void
  onClose: () => void
  onMakeCopy: () => void
  onWriteAbout: () => void
  /** Notes that link to this one. */
  mentions: Note[]
  /** Notes near this one, each with why. */
  related: RelatedNote[]
  /** "Library / Shelf / Notebook" for a note. */
  pathOf: (note: Note) => string
  onShowOnMap: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const sampleRef = useRef<HTMLSpanElement>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    closeRef.current?.focus()
  }, [note.id])

  // How far through the note the reader is, from 0 to 1.
  const positionNow = () => {
    const scroller = scrollRef.current
    if (!scroller) return 0
    const range = scroller.scrollHeight - scroller.clientHeight
    return range > 0 ? scroller.scrollTop / range : 0
  }
  const scrollTo = (position: number) => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollTop = position * Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  }

  // The line length, measured in the font this device shows: so many characters of ordinary text,
  // as a width in em, so it follows the text size. Before the place is restored below, since the
  // width changes how tall the note is.
  useLayoutEffect(() => {
    const column = columnRef.current
    const sample = sampleRef.current
    if (!column) return
    const fontSize = parseFloat(getComputedStyle(column).fontSize)
    const sampleWidth = sample?.getBoundingClientRect().width ?? 0
    column.style.setProperty('--reader-measure', fontSize > 0 && sampleWidth > 0
      ? `${((CHARACTERS[settings.width] * sampleWidth) / SAMPLE.length / fontSize).toFixed(2)}em`
      : MEASURE[settings.width])
  }, [settings.font, settings.width])

  // Back where the reader left off, if known (the saved place may arrive just after the note
  // opens); otherwise at the start, with no claim of progress. Once the reader scrolls, their
  // place wins.
  const readerScrolled = useRef(false)
  const restoring = useRef(false)
  useLayoutEffect(() => {
    if (readerScrolled.current || initialPosition === undefined) return
    restoring.current = true
    scrollTo(initialPosition)
    setProgress(positionNow())
    requestAnimationFrame(() => { restoring.current = false })
  }, [initialPosition])
  // What follows the text (mentions, related notes) arrives a moment later and makes the note
  // taller; until the reader scrolls, keep them at their saved place as it does.
  useEffect(() => {
    const column = columnRef.current
    if (!column || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (readerScrolled.current || initialPosition === undefined) return
      restoring.current = true
      scrollTo(initialPosition)
      requestAnimationFrame(() => { restoring.current = false })
    })
    observer.observe(column)
    return () => observer.disconnect()
  }, [initialPosition])

  // Remember the place a moment after scrolling stops, and when the note closes. One reader is
  // drawn per note (the app keys it by note), so this note's id never changes here.
  const onPositionRef = useRef(onPosition)
  useLayoutEffect(() => {
    onPositionRef.current = onPosition
  })
  const saveTimer = useRef<number>()
  const lastPosition = useRef<number>()
  const noteId = note.id
  useEffect(() => () => {
    if (saveTimer.current === undefined) return
    window.clearTimeout(saveTimer.current)
    if (lastPosition.current !== undefined) onPositionRef.current(noteId, lastPosition.current)
  }, [noteId])
  const onScroll = () => {
    if (!restoring.current) readerScrolled.current = true
    const position = positionNow()
    lastPosition.current = position
    setProgress(position)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined
      onPositionRef.current(noteId, position)
    }, 700)
  }

  // A change of settings reflows the text; keep the reader at the same place in the note.
  const keptPosition = useRef<number>()
  const changeSettings = (next: ReaderSettings) => {
    keptPosition.current = positionNow()
    onSettings(next)
  }
  useLayoutEffect(() => {
    if (keptPosition.current === undefined) return
    scrollTo(keptPosition.current)
    keptPosition.current = undefined
  }, [settings])

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

  const index = notebookNotes.findIndex((item) => item.id === note.id)
  const previous = index > 0 ? notebookNotes[index - 1] : undefined
  const next = index >= 0 && index < notebookNotes.length - 1 ? notebookNotes[index + 1] : undefined
  const minutes = readingMinutes(note.content)
  const columnStyle = {
    '--reader-scale': SCALE[settings.size],
    '--reader-leading': LEADING[settings.spacing],
  } as CSSProperties

  function closeControls() {
    setControlsOpen(false)
    requestAnimationFrame(() => settingsButtonRef.current?.focus())
  }

  // Escape closes the settings wherever focus is: Safari leaves focus where it was when a choice
  // is clicked, so a key press may not come from inside the reader.
  useEffect(() => {
    if (!controlsOpen) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setControlsOpen(false)
      requestAnimationFrame(() => settingsButtonRef.current?.focus())
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [controlsOpen])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <article className="editor-card reader-room" role="dialog" aria-modal="true" aria-labelledby="handbook-title" onKeyDown={(event) => {
        // Escape closes the settings first, then the note.
        if (event.key === 'Escape' && controlsOpen) {
          event.preventDefault()
          event.stopPropagation()
          closeControls()
          return
        }
        keepFocusInDialog(event, onClose)
      }}>
        <header className="editor-header">
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label={t('Close note')}><ArrowLeft size={18} className="rtl:rotate-180" aria-hidden="true" /></button>
          <div className="min-w-0 flex-1">
            <p className="section-label reader-location"><BookOpen size={13} aria-hidden="true" /> {t('Handbook')} · {location}</p>
          </div>
          <button ref={settingsButtonRef} className="secondary-button reader-settings-button" aria-expanded={controlsOpen} aria-controls="reader-controls" onClick={() => (controlsOpen ? closeControls() : setControlsOpen(true))}>
            <Type size={15} aria-hidden="true" /> {t('Reading settings')}
          </button>
          <button className="icon-button" onClick={onClose} aria-label={t('Close note')}><X size={18} aria-hidden="true" /></button>
        </header>
        {/* A quiet cue of how far through the note the reader is; the words say where it sits. */}
        <div className="reader-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        {controlsOpen && (
          <ReaderControls id="reader-controls" settings={settings} theme={theme} onChange={changeSettings} onTheme={onTheme} onClose={closeControls} />
        )}
        <div ref={scrollRef} className="reader-scroll" onScroll={onScroll}>
          <div ref={columnRef} className={`reader-column reader-font-${settings.font}`} style={columnStyle}>
            <span ref={sampleRef} className="reader-sample" aria-hidden="true">{SAMPLE}</span>
            <p className="handbook-type">{TYPE_LABELS[note.type]()}</p>
            <h1 id="handbook-title" className="handbook-title">{note.title}</h1>
            <p className="handbook-summary">{note.summary}</p>
            <p className="handbook-meta">
              {note.draft
                ? <span className="handbook-draft">{t('Draft: not yet reviewed')}</span>
                : note.reviewed ? <span>{t('Reviewed by {reviewer}', { reviewer: note.reviewed })}</span> : null}
              {index >= 0 && <span>{t('Note {index} of {count}', { index: index + 1, count: notebookNotes.length })}</span>}
              {/* Only when it is worth knowing: short notes need no estimate. */}
              {minutes >= 2 && <span>{tp(minutes, 'About {count} minute to read', 'About {count} minutes to read')}</span>}
            </p>
            <div className="prose-notes handbook-text">
              <MarkdownPreview markdown={note.content} noteId={note.id} showContents resolveWikilink={resolveWikilink} onOpenWikilink={openWikilink} />
            </div>
            {(previous || next) && (
              <nav className="reader-pages" aria-label={t('In this notebook')}>
                {previous ? (
                  <button className="reader-page reader-page-previous" onClick={() => onOpenNote(previous)}>
                    <span className="reader-page-label"><ArrowLeft size={14} className="rtl:rotate-180" aria-hidden="true" /> {t('Previous')}</span>
                    <span className="reader-page-title">{previous.title}</span>
                  </button>
                ) : <span />}
                {next && (
                  <button className="reader-page reader-page-next" onClick={() => onOpenNote(next)}>
                    <span className="reader-page-label">{t('Next')} <ArrowRight size={14} className="rtl:rotate-180" aria-hidden="true" /></span>
                    <span className="reader-page-title">{next.title}</span>
                  </button>
                )}
              </nav>
            )}
            {/* After the text, never in the middle of it: what refers to this note, and what is near it. */}
            {mentions.length > 0 && (
              <section className="reader-related" aria-labelledby="reader-mentions-heading">
                <h2 id="reader-mentions-heading" className="reader-related-title">{t('Mentioned in')}</h2>
                <ul>
                  {mentions.map((mention) => (
                    <li key={mention.id}>
                      <button className="related-item" onClick={() => onOpenNote(mention)}>
                        <span className="home-recent-title">{mention.title || t('Untitled note')}</span>
                        <span className="home-recent-place">{pathOf(mention)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {related.length > 0 && (
              <section className="reader-related" aria-labelledby="reader-related-heading">
                <h2 id="reader-related-heading" className="reader-related-title">{t('Related notes')}</h2>
                <ul>
                  {related.map(({ note: item, reason }) => (
                    <li key={item.id}>
                      <button className="related-item" onClick={() => onOpenNote(item)}>
                        <span className="home-recent-title">{item.title || t('Untitled note')}</span>
                        <span className="home-recent-place">{reasonText(reason)} · {pathOf(item)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button className="secondary-button reader-map-button" onClick={onShowOnMap}>
              <Network size={15} aria-hidden="true" /> {t('Show on the note map')}
            </button>
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
