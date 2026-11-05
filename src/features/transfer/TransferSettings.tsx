import { useRef, useState, type FormEvent } from 'react'
import { FileDown, FileUp } from 'lucide-react'
import { exportMarkdownZip, importFromApp } from '../../state/actions'
import { IMPORT_SOURCES, type ImportSource } from './importSources'
import { t } from '../../i18n/i18n'

/** "Markdown and other apps" in Settings: export as Markdown files, and import from other apps. */
export function TransferSettings() {
  const [source, setSource] = useState<ImportSource>('markdown')
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)
  const details = IMPORT_SOURCES[source]

  async function onExport() {
    setBusy('export')
    await exportMarkdownZip()
    setBusy(null)
  }

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const files = [...(filesRef.current?.files ?? []), ...(folderRef.current?.files ?? [])]
    if (!files.length) return
    setBusy('import')
    if (await importFromApp(source, files)) event.currentTarget?.reset()
    setBusy(null)
  }

  return (
    <section className="mt-7" aria-labelledby="transfer-heading">
      <h3 id="transfer-heading" className="mb-3 text-sm font-semibold">{t("Markdown and other apps")}</h3>
      <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void onExport()}>
        <FileDown size={15} aria-hidden="true" /> {busy === 'export' ? t("Exporting…") : t("Export as Markdown (.zip)")}
      </button>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {t("A folder per library, shelf, and notebook, with a Markdown file per note (details in front matter) and its attachments beside it. Obsidian and other Markdown apps open it as it is. It is not a backup: use the JSON backup above to restore everything, including history.")}
      </p>
      <form className="mt-4 space-y-2" onSubmit={(event) => void onImport(event)}>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          {t("Import from")}
          <select className="small-input" value={source} onChange={(event) => setSource(event.target.value as ImportSource)}>
            {Object.entries(IMPORT_SOURCES).map(([value, item]) => <option key={value} value={value}>{t(item.label)}</option>)}
          </select>
        </label>
        <p className="text-xs text-[var(--muted)]">{t(details.hint)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="import-files">{t("Files to import from")} {t(details.label)}</label>
          <input key={`files-${source}`} ref={filesRef} id="import-files" type="file" multiple accept={details.accept} className="max-w-56 text-xs file:me-2 file:rounded-lg file:border-0 file:bg-[var(--surface-alt)] file:px-3 file:py-2 file:text-[var(--text)]" />
          {details.folders && (
            <>
              <label className="text-xs text-[var(--muted)]" htmlFor="import-folder">{t("or a folder:")}</label>
              <input
                key={`folder-${source}`}
                ref={(element) => {
                  folderRef.current = element
                  element?.setAttribute('webkitdirectory', '')
                }}
                id="import-folder"
                type="file"
                className="max-w-56 text-xs file:me-2 file:rounded-lg file:border-0 file:bg-[var(--surface-alt)] file:px-3 file:py-2 file:text-[var(--text)]"
              />
            </>
          )}
          <button className="secondary-button" type="submit" disabled={busy !== null}>
            <FileUp size={15} aria-hidden="true" /> {busy === 'import' ? t("Importing…") : t("Import notes")}
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">{t("Imported notes are added as new notes; nothing already here is changed.")}</p>
      </form>
    </section>
  )
}
