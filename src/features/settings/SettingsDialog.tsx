import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BookOpen,
  Download,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react'
import { DATABASE_VERSION, getStorageSnapshot } from '../../lib/notes'
import { formatBytes } from '../notes/noteDisplay'
import { AutoBackupSettings } from '../backup/AutoBackupSettings'
import { TransferSettings } from '../transfer/TransferSettings'
import { ProblemsLog } from './ProblemsLog'
import { APP_VERSION } from '../../version'
import { InstallSettings } from '../app/InstallSettings'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { changeTheme, downloadBackup, requestPersistenceFromSettings, restoreBackup } from '../../state/actions'
import { useLibraryStore } from '../../state/libraryStore'
import { themeChoice } from '../../lib/theme'
import type { ThemeChoice } from '../../types'
import { useIntegrityStore } from '../../state/integrityStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { changeLanguage, useLanguageStore } from '../../state/languageStore'
import { LANGUAGES, type LanguageChoice } from '../../i18n/i18n'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { t, tp } from '../../i18n/i18n'

type StorageSnapshot = Awaited<ReturnType<typeof getStorageSnapshot>>

const EMPTY_SNAPSHOT: StorageSnapshot = { notes: 0, trash: 0, notebooks: 0, tags: 0, revisions: 0, attachments: 0, attachmentBytes: 0, estimatedBytes: 0 }

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useLibraryStore((state) => state.settings)
  const notes = useLibraryStore((state) => state.notes)
  const trash = useLibraryStore((state) => state.trash)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const tags = useLibraryStore((state) => state.tags)
  const links = useLibraryStore((state) => state.links)
  const persistence = usePersistenceStore((state) => state.status)
  const language = useLanguageStore((state) => state.choice)
  const integrity = useIntegrityStore()
  const error = useWorkspaceStore((state) => state.error)
  const notice = useWorkspaceStore((state) => state.notice)
  const showError = useWorkspaceStore((state) => state.showError)
  const showNotice = useWorkspaceStore((state) => state.showNotice)
  const [storage, setStorage] = useState<StorageSnapshot>(EMPTY_SNAPSHOT)
  const fileRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [includeHistory, setIncludeHistory] = useState(true)
  useEffect(() => closeRef.current?.focus(), [])

  // The snapshot reads every record, including attachment data, so it is computed only while
  // Settings is open, and again whenever the data it summarizes changes.
  useEffect(() => {
    let active = true
    getStorageSnapshot()
      .then((snapshot) => {
        if (active) setStorage(snapshot)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [notes, trash, notebooks, tags, links])

  const onTheme = (theme: ThemeChoice) => void changeTheme(theme)
  const currentTheme = themeChoice(settings)
  const onExport = (options: { attachments: boolean; history: boolean }) => void downloadBackup(options)
  const onRequestPersistence = () => void requestPersistenceFromSettings()
  const onDismissError = () => showError(null)
  const onDismissNotice = () => showNotice(null)

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = fileRef.current?.files?.[0]
    if (!file) {
      showError(t("Choose a JSON backup file to import."))
      return
    }
    if (window.confirm(t("Merge this backup with the notes on this device? Existing notes will never be overwritten."))) {
      await restoreBackup(file)
    }
    form.reset()
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="dialog-card max-w-xl" role="dialog" aria-modal="true" aria-labelledby="settings-heading" onKeyDown={(event) => keepFocusInDialog(event, onClose)}>
        <header className="mb-6 flex items-start justify-between">
          <div><p className="section-label">{t("Preferences")}</p><h2 id="settings-heading" className="text-2xl font-semibold">{t("Settings")}</h2></div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label={t("Close settings")}><X size={18} /></button>
        </header>
        <section>
          <h3 className="mb-3 text-sm font-semibold">{t("Appearance")}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t("Color theme")}>
            {(['light', 'paper', 'dark', 'system'] as const).map((choice, index, choices) => <button key={choice} id={`theme-${choice}`} role="radio" aria-checked={currentTheme === choice} tabIndex={currentTheme === choice ? 0 : -1} className={`theme-option ${currentTheme === choice ? 'theme-option-active' : ''}`} onKeyDown={(event) => {
              const nextIndex = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? (index + 1) % choices.length
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? (index + choices.length - 1) % choices.length
                  : -1
              if (nextIndex >= 0) {
                event.preventDefault()
                onTheme(choices[nextIndex])
                document.getElementById(`theme-${choices[nextIndex]}`)?.focus()
              }
            }} onClick={() => onTheme(choice)}>
              {choice === 'light' ? <Sun size={18} /> : choice === 'paper' ? <BookOpen size={18} /> : choice === 'dark' ? <Moon size={18} /> : <Settings size={18} />}
              <span>{choice === 'light' ? t('Light') : choice === 'paper' ? t('Soft paper') : choice === 'dark' ? t('Dark') : t('System')}</span>
            </button>)}
          </div>
          <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {t('Language')}
            <select className="small-input" value={language} onChange={(event) => void changeLanguage(event.target.value as LanguageChoice)}>
              <option value="system">{t('Same as this device')}</option>
              {Object.entries(LANGUAGES).map(([code, details]) => <option key={code} value={code} lang={code}>{details.name}</option>)}
            </select>
          </label>
        </section>
        {error && <div role="alert" className="notice notice-error mt-4">{error}<button onClick={onDismissError} aria-label={t("Dismiss error")}><X size={15} /></button></div>}
        {notice && <div role="status" className="notice mt-4">{notice}<button onClick={onDismissNotice} aria-label={t("Dismiss notice")}><X size={15} /></button></div>}
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">{t("Backup and restore")}</h3>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => onExport({ attachments: includeAttachments, history: includeHistory })}><Download size={15} /> {t("Export JSON backup")}</button>
            <form className="flex items-center gap-2" onSubmit={(event) => void onImport(event)}>
              <label className="sr-only" htmlFor="backup-file">{t("Choose a JSON backup")}</label>
              <input ref={fileRef} id="backup-file" type="file" accept="application/json,.json" className="max-w-48 text-xs file:me-2 file:rounded-lg file:border-0 file:bg-[var(--surface-alt)] file:px-3 file:py-2 file:text-[var(--text)]" />
              <button className="secondary-button" type="submit">{t("Import")}</button>
            </form>
          </div>
          <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <legend className="sr-only">{t("Include in export")}</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeAttachments} onChange={(event) => setIncludeAttachments(event.target.checked)} /> {t('Include attachments ({size})', { size: formatBytes(storage.attachmentBytes) })}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} /> {tp(storage.revisions, 'Include history ({count} revision)', 'Include history ({count} revisions)')}</label>
          </fieldset>
          <p className="mt-2 text-xs text-[var(--muted)]">{t("Import adds notes without overwriting existing notes. JSON backups up to 40 MiB are supported; if a backup is too large, export it without attachments or history.")}</p>
        </section>
        <AutoBackupSettings />
        <TransferSettings />
        <InstallSettings />
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">{t("Storage on this device")}</h3>
          <dl className="settings-stats">
            <div><dt>{t("Notes")}</dt><dd>{storage.notes}</dd></div><div><dt>{t("Trash")}</dt><dd>{storage.trash}</dd></div><div><dt>{t("Notebooks")}</dt><dd>{storage.notebooks}</dd></div><div><dt>{t("Tags")}</dt><dd>{storage.tags}</dd></div><div><dt>{t("History revisions")}</dt><dd>{storage.revisions}</dd></div><div><dt>{t("Attachments")}</dt><dd>{storage.attachments}</dd></div><div><dt>{t("Attachment data")}</dt><dd>{formatBytes(storage.attachmentBytes)}</dd></div><div><dt>{t("Estimated content size")}</dt><dd>{formatBytes(storage.estimatedBytes)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">{t("Includes attachment data; browser quota may differ.")}</p>
          <p className="mt-2 text-sm" aria-live="polite">
            {integrity.failed
              ? t("The library check at start-up could not run: {failed}", { failed: integrity.failed })
              : !integrity.checkedAt
                ? t("The library is checked for damage shortly after the app starts.")
                : integrity.repaired.length
                  ? t("The library check at start-up repaired it: {value}.", { value: integrity.repaired.join('; ') })
                  : t("The library check at start-up found no problems.")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
            <p className="text-sm">
              {persistence === 'persisted'
                ? t("Persistent storage is on: the browser will not clear your notes to free up space.")
                : persistence === 'best-effort'
                  ? t("Persistent storage is off: the browser may clear your notes if the device runs low on space.")
                  : t("This browser does not report whether your notes are protected from automatic clearing.")}
            </p>
            {persistence === 'best-effort' && (
              <button className="secondary-button" onClick={onRequestPersistence}>{t("Keep notes on this device")}</button>
            )}
          </div>
        </section>
        <section className="mt-7 border-t border-[var(--border)] pt-5">
          <h3 className="text-sm font-semibold">{t("About The Personal Knowledge Library")}</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">{t("An offline-first, private notes app. Your notes stay in this browser’s local storage; no account or network connection is required.")}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">{t('The Personal Knowledge Library {version} · Database version {schema} · Backup format 4 · Data stored locally', { version: APP_VERSION, schema: DATABASE_VERSION })}</p>
          <ProblemsLog />
        </section>
      </section>
    </div>
  )
}
