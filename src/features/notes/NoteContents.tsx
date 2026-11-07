import { useId, useState } from 'react'
import { ListTree } from 'lucide-react'
import { MAX_CONTENTS_ITEMS, MIN_CONTENTS_HEADINGS, type Heading } from './noteHeadings'
import { t, tp } from '../../i18n/i18n'

/**
 * A collapsible table of contents above the preview. Selecting a heading scrolls the preview to
 * it and moves focus there, so keyboard and screen-reader users land in the right place.
 */
export function NoteContents({ headings }: { headings: Heading[] }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (headings.length < MIN_CONTENTS_HEADINGS) return null
  const shallowest = Math.min(...headings.map((heading) => heading.depth))
  const shown = headings.slice(0, MAX_CONTENTS_ITEMS)

  function jumpTo(id: string) {
    const target = document.getElementById(id)
    if (!target) return
    target.setAttribute('tabindex', '-1')
    // A smooth scroll is motion: skipped when the system asks for less (WCAG 2.3.3).
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    target.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    target.focus({ preventScroll: true })
  }

  return (
    <nav className="note-contents" aria-label={t("Contents")}>
      <button type="button" className="note-contents-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)}>
        <ListTree size={15} aria-hidden="true" /> {t("Contents")} <span className="note-contents-count">{headings.length}</span>
      </button>
      {open && (
        <ol id={listId} className="note-contents-list">
          {shown.map((heading) => (
            <li key={heading.id} style={{ paddingLeft: `${(heading.depth - shallowest) * 0.9}rem` }}>
              <a
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  jumpTo(heading.id)
                }}
              >
                {heading.text || t("Untitled section")}
              </a>
            </li>
          ))}
          {headings.length > shown.length && (
            <li className="note-contents-more">{tp(headings.length - shown.length, 'and {count} more heading', 'and {count} more headings')}</li>
          )}
        </ol>
      )}
    </nav>
  )
}
