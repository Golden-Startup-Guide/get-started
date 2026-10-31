import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Download,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react'
import {
  DATABASE_VERSION,
  type BackupOptions,
} from '../../lib/notes'
import type {
  AppSettings,
  ThemePreference,
} from '../../types'
import { formatBytes } from '../notes/noteDisplay'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { type StoragePersistence } from '../notes/storagePersistence'

export function SettingsDialog({
  settings,
  storage,
  persistence,
  onRequestPersistence,
  fileRef,
  onClose,
  onTheme,
  onExport,
  onImport,
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: {
  settings: AppSettings
  storage: { notes: number; trash: number; notebooks: number; tags: number; revisions: number; attachments: number; attachmentBytes: number; estimatedBytes: number }
  persistence: StoragePersistence
  onRequestPersistence: () => void
  fileRef: React.RefObject<HTMLInputElement>
  onClose: () => void
  onTheme: (theme: ThemePreference) => void
  onExport: (options: BackupOptions) => void
  onImport: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  notice: string | null
  onDismissError: () => void
  onDismissNotice: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [includeHistory, setIncludeHistory] = useState(true)
  useEffect(() => closeRef.current?.focus(), [])
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
            <form className="flex items-center gap-2" onSubmit={onImport}>
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
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">Storage on this device</h3>
          <dl className="settings-stats">
            <div><dt>Notes</dt><dd>{storage.notes}</dd></div><div><dt>Trash</dt><dd>{storage.trash}</dd></div><div><dt>Notebooks</dt><dd>{storage.notebooks}</dd></div><div><dt>Tags</dt><dd>{storage.tags}</dd></div><div><dt>History revisions</dt><dd>{storage.revisions}</dd></div><div><dt>Attachments</dt><dd>{storage.attachments}</dd></div><div><dt>Attachment data</dt><dd>{formatBytes(storage.attachmentBytes)}</dd></div><div><dt>Estimated content size</dt><dd>{formatBytes(storage.estimatedBytes)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">Includes attachment data; browser quota may differ.</p>
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
