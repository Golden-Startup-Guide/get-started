import { useEffect, useId, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { msg, t } from '../../i18n/i18n'

const TIPS: Array<[example: string, meaning: string]> = [
  ['garden plan', msg('Notes containing every word, in any order')],
  ['"seed tray"', msg('An exact phrase')],
  ['-tomato', msg('Leave out notes containing a word')],
  ['tag:health', msg('Notes with a tag (or #health)')],
  ['notebook:work', msg('Notes in a notebook whose name starts with this')],
  ['shelf:general', msg('The same for shelves (and library:)')],
  ['is:pinned', msg('Pinned notes (or is:favorite)')],
  ['has:attachment', msg('Notes with files (or has:task, has:link)')],
  ['after:2026-11-01', msg('Edited on or after a day (or before:)')],
  ['after:7d', msg('Edited in the last week (also today, 2w, 3m)')],
  ['-tag:draft', msg('Put - before any filter to exclude matches')],
]

/** A "?" button beside the search box that explains search operators; examples can be added with a click. */
export function SearchTips({ onAdd }: { onAdd: (example: string) => void }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    // Wherever focus is: clicking a button does not focus it in Safari, so focus may still be in
    // the search box. preventDefault also stops the search box clearing itself on Escape.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      const focusWasInside = rootRef.current?.contains(document.activeElement)
      setOpen(false)
      if (focusWasInside) buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="search-tips">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button !h-8 !w-8"
        aria-label={t("Search tips")}
        title={t("Search tips")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="search-tips-panel" role="region" aria-label={t("Search tips")}>
          <p className="search-tips-intro">{t("Combine any of these. Select one to add it to your search.")}</p>
          <ul>
            {TIPS.map(([example, meaning]) => (
              <li key={example}>
                <button type="button" className="search-tips-example" onClick={() => onAdd(example)}>
                  <code>{example}</code>
                  <span>{t(meaning)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
