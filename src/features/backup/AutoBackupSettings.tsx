import { FolderOpen } from 'lucide-react'
import { useBackupStore } from '../../state/backupStore'
import type { BackupFrequency } from './backupSchedule'

const formatTime = (time: number) =>
  new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** The "Automatic backups" part of Settings. */
export function AutoBackupSettings() {
  const backup = useBackupStore()
  const { folder, permission, frequency, lastBackupAt, lastBackupFile, lastBackupOmitted, lastError, running, supported } = backup

  const last = lastBackupAt
    ? `Last backup: ${formatTime(lastBackupAt)}${lastBackupFile === 'download' ? ' (downloaded)' : lastBackupFile ? ` (${lastBackupFile})` : ''}.`
    : 'No backup yet.'

  return (
    <section className="mt-7" aria-labelledby="auto-backup-heading">
      <h3 id="auto-backup-heading" className="mb-3 text-sm font-semibold">Automatic backups</h3>
      {supported ? (
        folder ? (
          <p className="text-sm">
            Backing up to the folder <strong>{folder.name}</strong>
            {frequency === 'off' ? ' only when you ask.' : frequency === 'daily' ? ' once a day, when your notes have changed.' : ' once a week, when your notes have changed.'}
            {' '}The newest 14 backups are kept.
          </p>
        ) : (
          <p className="text-sm">Choose a folder, such as one your cloud drive keeps in sync, and My Notes will save a backup there while it is open.</p>
        )
      ) : (
        <p className="text-sm">
          This browser cannot save backups to a folder by itself (Chrome and Edge on a computer can), so My Notes reminds you to download one instead.
          Browsers can clear a site’s data, and Safari does so for sites not opened for 7 days unless My Notes is added to the Home Screen.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {supported && (
          <button type="button" className="secondary-button" onClick={() => void backup.chooseFolder()}>
            <FolderOpen size={15} aria-hidden="true" /> {folder ? 'Change folder…' : 'Choose a backup folder…'}
          </button>
        )}
        {folder && (
          <>
            <button type="button" className="secondary-button" disabled={running} onClick={() => void backup.backUpNow()}>
              {running ? 'Backing up…' : 'Back up now'}
            </button>
            <button type="button" className="secondary-button" onClick={() => void backup.stopFolder()}>Stop using this folder</button>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          {folder ? 'Back up' : 'Remind me'}
          <select className="small-input" value={frequency} onChange={(event) => void backup.setFrequency(event.target.value as BackupFrequency)}>
            <option value="daily">every day</option>
            <option value="weekly">every week</option>
            <option value="off">{folder ? 'only when I ask' : 'never'}</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]" aria-live="polite">
        {last}
        {lastBackupOmitted && ` It left out ${lastBackupOmitted} to stay under 40 MiB.`}
        {folder && permission === 'prompt' && ' The browser needs your permission again to use this folder; select Back up now to give it.'}
        {folder && permission === 'denied' && ' The browser has refused access to this folder; choose it again.'}
        {lastError && ` The last automatic backup failed: ${lastError}`}
      </p>
    </section>
  )
}
