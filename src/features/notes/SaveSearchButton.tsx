import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { BookmarkCheck, BookmarkPlus } from 'lucide-react'
import { MAX_SAVED_SEARCH_NAME } from '../../lib/savedSearches'
import { removeSavedSearch, saveNamedSearch } from '../../state/actions'
import { useWorkspaceStore } from '../../state/workspaceStore'
import type { SavedSearch } from '../../types'
import { t } from '../../i18n/i18n'

/**
 * A button beside the search box that saves the current search by name, or removes it when it
 * is already saved. Saved searches are listed in the sidebar and the command palette.
 */
export function SaveSearchButton({ query, saved }: { query: string; saved: SavedSearch | undefined }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    // preventDefault also stops the search box clearing itself on Escape.
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

  function toggle() {
    if (saved) {
      void removeSavedSearch(saved)
      return
    }
    if (!open) {
      setName(query.trim().slice(0, MAX_SAVED_SEARCH_NAME))
      setError(null)
    }
    setOpen(!open)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await saveNamedSearch(name, query)
      setOpen(false)
      buttonRef.current?.focus()
      useWorkspaceStore.getState().showNotice(t("Saved the search “{value}”. Find it in the sidebar or the command palette.", { value: name.trim() }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('The search could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  const label = saved ? t('Remove saved search “{name}”', { name: saved.name }) : t('Save this search')
  return (
    <div ref={rootRef} className="search-tips">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button !h-8 !w-8"
        aria-label={label}
        title={label}
        aria-expanded={saved ? undefined : open}
        aria-controls={saved ? undefined : panelId}
        onClick={toggle}
      >
        {saved ? <BookmarkCheck size={16} aria-hidden="true" className="text-[var(--accent)]" /> : <BookmarkPlus size={16} aria-hidden="true" />}
      </button>
      {open && !saved && (
        <form id={panelId} className="search-tips-panel save-search-form" aria-label={t("Save this search")} onSubmit={(event) => void save(event)}>
          <label htmlFor={`${panelId}-name`}>{t("Name this search")}</label>
          <input
            id={`${panelId}-name`}
            className="small-input"
            value={name}
            maxLength={MAX_SAVED_SEARCH_NAME}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            autoFocus
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>{t("Cancel")}</button>
            <button type="submit" className="primary-button" disabled={saving}>{t("Save search")}</button>
          </div>
        </form>
      )}
    </div>
  )
}
