import { ArrowRight, Layers3 } from 'lucide-react'
import { CORE_CATALOG, useCoreStore } from '../../state/coreStore'
import type { View } from '../../state/workspaceStore'
import { t, tp } from '../../i18n/i18n'

/** A built-in handbook library: what it covers, and its shelves. It cannot be changed. */
export function HandbookLibraryHome({ libraryId, onNavigate }: { libraryId: string; onNavigate: (view: View) => void }) {
  const notes = useCoreStore((state) => state.notes)
  const loaded = useCoreStore((state) => state.loaded)
  const library = CORE_CATALOG.libraries.find((item) => item.id === libraryId)
  if (!library) return null
  const shelves = CORE_CATALOG.shelves.filter((shelf) => shelf.libraryId === libraryId)
  return (
    <section aria-label={t('Shelves')}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shelves.map((shelf) => {
          const notebooks = CORE_CATALOG.notebooks.filter((notebook) => notebook.shelfId === shelf.id)
          const noteCount = notes.filter((note) => notebooks.some((notebook) => notebook.id === note.notebookId)).length
          return (
            <article key={shelf.id} className="note-card !min-h-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-label">{t('Shelf')}</p>
                  <h2 className="mt-2 text-lg font-semibold">{shelf.name}</h2>
                </div>
                <Layers3 size={20} className="text-[var(--accent)]" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm">{shelf.description}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {tp(notebooks.length, '{count} notebook', '{count} notebooks')}
                {loaded && <> · {tp(noteCount, '{count} note', '{count} notes')}</>}
              </p>
              {/* The visible words start the button's name, so voice control can use them. */}
              <button className="secondary-button mt-5" onClick={() => onNavigate(`shelf:${shelf.id}`)}>
                {t('Open shelf')}<span className="sr-only"> {shelf.name}</span> <ArrowRight className="rtl:rotate-180" size={15} aria-hidden="true" />
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
