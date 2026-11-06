import { FolderOpen } from 'lucide-react'
import { useBackupStore } from '../../state/backupStore'
import type { BackupFrequency } from './backupSchedule'
import { t } from '../../i18n/i18n'

const formatTime = (time: number) =>
  new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** The "Automatic backups" part of Settings. */
export function AutoBackupSettings() {
  const backup = useBackupStore()
  const { folder, permission, frequency, lastBackupAt, lastBackupFile, lastBackupOmitted, lastCheck, lastError, running, supported } = backup

  const last = !lastBackupAt
    ? t('No backup yet.')
    : lastBackupFile === 'download'
      ? t('Last backup: {time} (downloaded).', { time: formatTime(lastBackupAt) })
      : lastBackupFile
        ? t('Last backup: {time} ({file}).', { time: formatTime(lastBackupAt), file: lastBackupFile })
        : t('Last backup: {time}.', { time: formatTime(lastBackupAt) })

  return (
    <section className="mt-7" aria-labelledby="auto-backup-heading">
      <h3 id="auto-backup-heading" className="mb-3 text-sm font-semibold">{t("Automatic backups")}</h3>
      {supported ? (
        folder ? (
          <p className="text-sm">
            {t("Backing up to the folder")} <strong>{folder.name}</strong>
            {frequency === 'off' ? t(" only when you ask.") : frequency === 'daily' ? t(" once a day, when your notes have changed.") : t(" once a week, when your notes have changed.")}
            {' '}{t("The newest 14 backups are kept.")}
          </p>
        ) : (
          <p className="text-sm">{t("Choose a folder, such as one your cloud drive keeps in sync, and the app will save a backup there while it is open.")}</p>
        )
      ) : (
        <p className="text-sm">
          {t("This browser cannot save backups to a folder by itself (Chrome and Edge on a computer can), so the app reminds you to download one instead. Browsers can clear a site’s data, and Safari does so for sites not opened for 7 days unless the app is added to the Home Screen.")}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {supported && (
          <button type="button" className="secondary-button" onClick={() => void backup.chooseFolder()}>
            <FolderOpen size={15} aria-hidden="true" /> {folder ? t("Change folder…") : t("Choose a backup folder…")}
          </button>
        )}
        {folder && (
          <>
            <button type="button" className="secondary-button" disabled={running} onClick={() => void backup.backUpNow()}>
              {running ? t("Backing up and checking…") : t("Back up now")}
            </button>
            <button type="button" className="secondary-button" onClick={() => void backup.stopFolder()}>{t("Stop using this folder")}</button>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          {folder ? t("Back up") : t("Remind me")}
          <select className="small-input" value={frequency} onChange={(event) => void backup.setFrequency(event.target.value as BackupFrequency)}>
            <option value="daily">{t("every day")}</option>
            <option value="weekly">{t("every week")}</option>
            <option value="off">{folder ? t("only when I ask") : 'never'}</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]" aria-live="polite">
        {last}
        {lastBackupOmitted && (lastBackupOmitted === 'history' ? t(' It left out history to stay under 40 MiB.') : t(' It left out attachments and history to stay under 40 MiB.'))}
        {lastCheck?.ok && t(" Checked {formatTime}: a test restore brought back {summary}.", { formatTime: formatTime(lastCheck.at), summary: lastCheck.summary })}
        {lastCheck && !lastCheck.ok && t(" The last backup failed its test restore ({summary}).", { summary: lastCheck.summary })}
        {folder && permission === 'prompt' && t(" The browser needs your permission again to use this folder; select Back up now to give it.")}
        {folder && permission === 'denied' && t(" The browser has refused access to this folder; choose it again.")}
        {lastError && t(" The last automatic backup failed: {lastError}", { lastError })}
      </p>
    </section>
  )
}
