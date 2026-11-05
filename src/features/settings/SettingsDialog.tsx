import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
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
import { InstallSettings } from '../app/InstallSettings'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { changeTheme, downloadBackup, requestPersistenceFromSettings, restoreBackup } from '../../state/actions'
import { useLibraryStore } from '../../state/libraryStore'
import { useIntegrityStore } from '../../state/integrityStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { useWorkspaceStore } from '../../state/workspaceStore'

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

  const onTheme = (theme: typeof settings.theme) => void changeTheme(theme)
  const onExport = (options: { attachments: boolean; history: boolean }) => void downloadBackup(options)
  const onRequestPersistence = () => void requestPersistenceFromSettings()
  const onDismissError = () => showError(null)
  const onDismissNotice = () => showNotice(null)

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = fileRef.current?.files?.[0]
    if (!file) {
      showError('Choose a JSON backup file to import.')
      return
    }
    if (window.confirm('Merge this backup with the notes on this device? Existing notes will never be overwritten.')) {
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
          <div><p className="section-label">Preferences</p><h2 id="settings-heading" className="text-2xl font-semibold">Settings</h2></div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
        </header>
        <section>
          <h3 className="mb-3 text-sm font-semibold">Appearance</h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Color theme">
            {(['light', 'dark', 'system'] as const).map((choice, index, choices) => <button key={choice} id={`theme-${choice}`} role="radio" aria-checked={settings.theme === choice} tabIndex={settings.theme === choice ? 0 : -1} className={`theme-option ${settings.theme === choice ? 'theme-option-active' : ''}`} onKeyDown={(event) => {
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
              {choice === 'light' ? <Sun size={18} /> : choice === 'dark' ? <Moon size={18} /> : <Settings size={18} />}
              <span className="capitalize">{choice}</span>
            </button>)}
          </div>
        </section>
        {error && <div role="alert" className="notice notice-error mt-4">{error}<button onClick={onDismissError} aria-label="Dismiss error"><X size={15} /></button></div>}
        {notice && <div role="status" className="notice mt-4">{notice}<button onClick={onDismissNotice} aria-label="Dismiss notice"><X size={15} /></button></div>}
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">Backup and restore</h3>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => onExport({ attachments: includeAttachments, history: includeHistory })}><Download size={15} /> Export JSON backup</button>
            <form className="flex items-center gap-2" onSubmit={(event) => void onImport(event)}>
              <label className="sr-only" htmlFor="backup-file">Choose a JSON backup</label>
              <input ref={fileRef} id="backup-file" type="file" accept="application/json,.json" className="max-w-48 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-alt)] file:px-3 file:py-2 file:text-[var(--text)]" />
              <button className="secondary-button" type="submit">Import</button>
            </form>
          </div>
          <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <legend className="sr-only">Include in export</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeAttachments} onChange={(event) => setIncludeAttachments(event.target.checked)} /> Include attachments ({formatBytes(storage.attachmentBytes)})</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} /> Include history ({storage.revisions} {storage.revisions === 1 ? 'revision' : 'revisions'})</label>
          </fieldset>
          <p className="mt-2 text-xs text-[var(--muted)]">Import adds notes without overwriting existing notes. JSON backups up to 40 MiB are supported; if a backup is too large, export it without attachments or history.</p>
        </section>
        <AutoBackupSettings />
        <TransferSettings />
        <InstallSettings />
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">Storage on this device</h3>
          <dl className="settings-stats">
            <div><dt>Notes</dt><dd>{storage.notes}</dd></div><div><dt>Trash</dt><dd>{storage.trash}</dd></div><div><dt>Notebooks</dt><dd>{storage.notebooks}</dd></div><div><dt>Tags</dt><dd>{storage.tags}</dd></div><div><dt>History revisions</dt><dd>{storage.revisions}</dd></div><div><dt>Attachments</dt><dd>{storage.attachments}</dd></div><div><dt>Attachment data</dt><dd>{formatBytes(storage.attachmentBytes)}</dd></div><div><dt>Estimated content size</dt><dd>{formatBytes(storage.estimatedBytes)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">Includes attachment data; browser quota may differ.</p>
          <p className="mt-2 text-sm" aria-live="polite">
            {integrity.failed
              ? `The library check at start-up could not run: ${integrity.failed}`
              : !integrity.checkedAt
                ? 'The library is checked for damage shortly after My Notes starts.'
                : integrity.repaired.length
                  ? `The library check at start-up repaired it: ${integrity.repaired.join('; ')}.`
                  : 'The library check at start-up found no problems.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
            <p className="text-sm">
              {persistence === 'persisted'
                ? 'Persistent storage is on: the browser will not clear your notes to free up space.'
                : persistence === 'best-effort'
                  ? 'Persistent storage is off: the browser may clear your notes if the device runs low on space.'
                  : 'This browser does not report whether your notes are protected from automatic clearing.'}
            </p>
            {persistence === 'best-effort' && (
              <button className="secondary-button" onClick={onRequestPersistence}>Keep notes on this device</button>
            )}
          </div>
        </section>
        <section className="mt-7 border-t border-[var(--border)] pt-5">
          <h3 className="text-sm font-semibold">About My Notes</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">An offline-first, private notes app. Your notes stay in this browser’s local storage; no account or network connection is required.</p>
          <p className="mt-2 text-xs text-[var(--muted)]">My Notes · IndexedDB schema {DATABASE_VERSION} · Backup format 4 · Data stored locally</p>
        </section>
      </section>
    </div>
  )
}
