import { useMemo } from 'react'
import { downloadBackup } from '../../state/actions'
import { backupReminder, newestChange, useBackupStore } from '../../state/backupStore'
import { useLibraryStore } from '../../state/libraryStore'
import { daysSince } from './backupSchedule'
import { t, tp } from '../../i18n/i18n'

/**
 * A banner when backups need attention: one is overdue (no backup folder, or a browser that
 * cannot use one), access to the backup folder must be allowed again, or the last automatic
 * backup failed.
 */
export function BackupReminder({ onOpenSettings }: { onOpenSettings: () => void }) {
  const backup = useBackupStore()
  const notes = useLibraryStore((state) => state.notes)
  const trash = useLibraryStore((state) => state.trash)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const shelves = useLibraryStore((state) => state.shelves)
  const libraries = useLibraryStore((state) => state.libraries)
  const lastChangeAt = useMemo(() => newestChange(notes, trash, notebooks, shelves, libraries), [notes, trash, notebooks, shelves, libraries])
  const reminder = backupReminder(backup, lastChangeAt)
  if (!reminder) return null

  const days = backup.lastBackupAt ? daysSince(backup.lastBackupAt, backup.checkedAt) : 0
  const folderName = backup.folder?.name ?? t('your backup folder')
  const message = reminder === 'permission'
    ? t('Automatic backups to “{folder}” are paused until you allow access again.', { folder: folderName })
    : reminder === 'failed'
      ? t('The automatic backup to “{folder}” failed: {error}', { folder: folderName, error: backup.lastError ?? '' })
      : backup.lastBackupAt
        ? tp(days, 'Your last backup was {count} day ago. Your notes live only in this browser, which can clear them; a backup keeps them safe.', 'Your last backup was {count} days ago. Your notes live only in this browser, which can clear them; a backup keeps them safe.')
        : 'You haven’t backed up your notes yet. They live only in this browser, which can clear them; a backup keeps them safe.'

  return (
    <div role="region" aria-label={t("Backup reminder")} className="notice backup-reminder mb-5">
      <p className="min-w-0 flex-1">{message}</p>
      <div className="flex flex-wrap gap-2">
        {reminder === 'permission' && (
          <button type="button" className="secondary-button" onClick={() => void backup.allowFolder()}>{t("Allow access")}</button>
        )}
        {reminder === 'failed' && (
          <button type="button" className="secondary-button" disabled={backup.running} onClick={() => void backup.backUpNow()}>{t("Try again")}</button>
        )}
        {reminder === 'overdue' && (
          <>
            <button type="button" className="secondary-button" onClick={() => void downloadBackup({ attachments: true, history: true })}>{t("Download a backup")}</button>
            <button type="button" className="secondary-button" onClick={onOpenSettings}>
              {backup.supported ? t("Back up automatically…") : t("Backup settings…")}
            </button>
          </>
        )}
        <button type="button" className="secondary-button" onClick={() => void backup.snooze()}>{t("Later")}</button>
      </div>
    </div>
  )
}
