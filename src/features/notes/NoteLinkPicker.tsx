import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Note } from '../../types'
import { t, tp } from '../../i18n/i18n'

/** Matches shown at once; typing narrows the rest. */
export const MAX_LINK_PICKER_RESULTS = 50

interface Candidate {
  note: Note
  label: string
  /** Lower-cased label, prepared once per library change rather than on every keystroke. */
  searchText: string
}

/**
 * Chooses a note to link by typing part of its title or notebook (an ARIA 1.2 combobox).
 * Replaces a <select> with one <option> per note, which meant 100,000 elements at 100,000
 * notes every time a note opened. Nothing is rendered until the picker is used, and never more
 * than MAX_LINK_PICKER_RESULTS options.
 */
export function NoteLinkPicker({
  id,
  targets,
  labels,
  selectedId,
  onSelect,
  disabled,
}: {
  id: string
  targets: Note[]
  labels: Map<string, string>
  selectedId: string
  onSelect: (noteId: string) => void
  disabled?: boolean
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Prepared only once the picker is in use: opening a note should not lower-case the label of
  // every other note in the library just in case the user links one.
  const inUse = open || query !== ''
  const candidates = useMemo<Candidate[]>(() => inUse
    ? targets.map((note) => {
      const label = labels.get(note.id) ?? (note.title || t('Untitled note'))
      return { note, label, searchText: label.toLocaleLowerCase() }
    })
    : [], [inUse, labels, targets])

  const { results, total } = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return { results: candidates.slice(0, MAX_LINK_PICKER_RESULTS), total: candidates.length }
    const matches: Candidate[] = []
    let count = 0
    for (const candidate of candidates) {
      if (!candidate.searchText.includes(term)) continue
      count += 1
      if (matches.length < MAX_LINK_PICKER_RESULTS) matches.push(candidate)
    }
    return { results: matches, total: count }
  }, [candidates, query])

  const active = open ? results[Math.min(activeIndex, results.length - 1)] : undefined
  const optionId = (noteId: string) => `${listId}-${noteId}`

  function choose(candidate: Candidate) {
    onSelect(candidate.note.id)
    setQuery(candidate.label)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActiveIndex(0)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => Math.max(0, Math.min(results.length - 1, index + step)))
    } else if (event.key === 'Enter' && open && active) {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape' && open) {
      // Close only the list; the editor's own Escape handling should not also close the note.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="link-picker">
      <input
        ref={inputRef}
        id={id}
        className="small-input w-full"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={active ? optionId(active.note.id) : undefined}
        autoComplete="off"
        placeholder={targets.length ? t("Type to find a note…") : t("No other notes to link")}
        disabled={disabled || !targets.length}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
          setOpen(true)
          // Typing after choosing starts a new search, so the earlier choice no longer applies.
          if (selectedId) onSelect('')
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={t("Notes to link")} className="link-picker-list">
          {results.map((candidate) => (
            <li
              key={candidate.note.id}
              id={optionId(candidate.note.id)}
              role="option"
              aria-selected={candidate === active}
              className={candidate === active ? 'link-picker-option link-picker-option-active' : 'link-picker-option'}
              // Keep focus in the input so the click lands before the list closes on blur.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(candidate)}
            >
              {candidate.label}
            </li>
          ))}
          {results.length === 0 && <li role="presentation" className="link-picker-hint">{t("No matching notes")}</li>}
          {total > results.length && (
            <li role="presentation" className="link-picker-hint">
              {tp(total - results.length, '{count} more; keep typing to narrow the list', '{count} more; keep typing to narrow the list')}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
