import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { buildPaletteItems, type PaletteHandlers, type PaletteSources } from './paletteItems'
import { searchPalette, type PaletteItem } from './paletteSearch'
import { msg, t, tp } from '../../i18n/i18n'

const GROUP_NAMES: Record<PaletteItem['group'], string> = { Actions: msg('Action'), Places: msg('Go to'), Notes: msg('Note') }

/**
 * Ctrl+K / ⌘K: jump to any note or place, or run an action, from the keyboard.
 *
 * An ARIA 1.2 combobox in a modal dialog. Focus stays in the input; ↑/↓ move through the
 * results (wrapping), Enter runs the highlighted one, Escape closes. At most 50 results render.
 */
export function CommandPalette({
  sources,
  handlers,
  onClose,
  onRun,
}: {
  sources: PaletteSources
  handlers: PaletteHandlers
  /** Closes without running anything. */
  onClose: () => void
  /** Closes and runs the chosen item. */
  onRun: (item: PaletteItem) => void
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // Built when the palette opens. Typing only changes this component's state, so it is not rebuilt
  // per keystroke; the library changing underneath does rebuild it.
  const { items, recent } = useMemo(() => buildPaletteItems(sources, handlers), [sources, handlers])
  const results = useMemo(() => searchPalette(items, query, recent), [items, query, recent])
  const active = results.length ? results[Math.min(activeIndex, results.length - 1)] : undefined
  const optionId = (item: PaletteItem) => `${listId}-${item.id}`
  const firstRecent = query.trim() ? undefined : recent[0]

  useEffect(() => {
    if (active) document.getElementById(`${listId}-${active.id}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, listId])

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const count = results.length
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!count) break
        const current = Math.min(activeIndex, count - 1)
        setActiveIndex((current + (event.key === 'ArrowDown' ? 1 : -1) + count) % count)
        break
      }
      case 'Enter':
        if (active) onRun(active)
        break
      case 'Escape':
        onClose()
        break
      case 'Tab':
        // The input is the only stop in this dialog.
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="modal-backdrop palette-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("Command palette")}>
        <div className="palette-input-row">
          <Search size={17} aria-hidden="true" />
          <input
            // The palette exists to be typed into the moment it opens.
            autoFocus
            className="palette-input"
            type="text"
            role="combobox"
            aria-label={t("Search notes, places, and actions")}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={active ? optionId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("Search notes, places, and actions…")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="palette-kbd">{t("Esc")}</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label={t("Results")} className="palette-list">
          {results.map((item, index) => [
            item === firstRecent && <li key="recent-heading" role="presentation" className="palette-heading">{t("Recent notes")}</li>,
            <li
              key={item.id}
              id={optionId(item)}
              role="option"
              aria-selected={item === active}
              className={item === active ? 'palette-option palette-option-active' : 'palette-option'}
              // Keep focus in the input.
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => { if (index !== activeIndex) setActiveIndex(index) }}
              onClick={() => onRun(item)}
            >
              <span className="palette-option-row">
                <span className="min-w-0 flex-1 truncate">
                  {item.label}
                  {item.detail && <span className="palette-detail"> — {item.detail}</span>}
                </span>
                <span className="palette-group">{t(GROUP_NAMES[item.group])}</span>
              </span>
            </li>,
          ])}
          {results.length === 0 && <li role="presentation" className="palette-empty">{t("No matches. Try another word.")}</li>}
        </ul>
        <p className="sr-only" role="status" aria-live="polite">
          {query.trim() ? tp(results.length, '{count} result', '{count} results') : ''}
        </p>
      </div>
    </div>
  )
}
