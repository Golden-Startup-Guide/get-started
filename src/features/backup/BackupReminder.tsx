import { useMemo } from 'react'
import { downloadBackup } from '../../state/actions'
import { backupReminder, newestChange, useBackupStore } from '../../state/backupStore'
import { useLibraryStore } from '../../state/libraryStore'
import { daysSince } from './backupSchedule'

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
  const folderName = backup.folder?.name ?? 'your backup folder'
  const message = reminder === 'permission'
    ? `Automatic backups to “${folderName}” are paused until you allow access again.`
    : reminder === 'failed'
      ? `The automatic backup to “${folderName}” failed: ${backup.lastError}`
      : backup.lastBackupAt
        ? `Your last backup was ${days} ${days === 1 ? 'day' : 'days'} ago. Your notes live only in this browser, which can clear them; a backup keeps them safe.`
        : 'You haven’t backed up your notes yet. They live only in this browser, which can clear them; a backup keeps them safe.'

  return (
    <div role="region" aria-label="Backup reminder" className="notice backup-reminder mb-5">
      <p className="min-w-0 flex-1">{message}</p>
      <div className="flex flex-wrap gap-2">
        {reminder === 'permission' && (
          <button type="button" className="secondary-button" onClick={() => void backup.allowFolder()}>Allow access</button>
        )}
        {reminder === 'failed' && (
          <button type="button" className="secondary-button" disabled={backup.running} onClick={() => void backup.backUpNow()}>Try again</button>
        )}
        {reminder === 'overdue' && (
          <>
            <button type="button" className="secondary-button" onClick={() => void downloadBackup({ attachments: true, history: true })}>Download a backup</button>
            <button type="button" className="secondary-button" onClick={onOpenSettings}>
              {backup.supported ? 'Back up automatically…' : 'Backup settings…'}
            </button>
          </>
        )}
        <button type="button" className="secondary-button" onClick={() => void backup.snooze()}>Later</button>
      </div>
    </div>
  )
}
