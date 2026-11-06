/**
 * When backups are due, what they are called, and which old ones to remove. No storage or
 * browser access here, so the rules can be tested on their own.
 */

/** How often to back up (to a folder) or be reminded to (by export). */
export type BackupFrequency = 'daily' | 'weekly' | 'off'

const DAY = 24 * 60 * 60 * 1000
export const FREQUENCY_MS: Record<Exclude<BackupFrequency, 'off'>, number> = { daily: DAY, weekly: 7 * DAY }
/** Dated backups kept in a backup folder; older ones are removed after each new one. */
export const BACKUPS_KEPT = 14
/** "Later" on a reminder puts it off this long. */
export const SNOOZE_MS = DAY

const pad = (value: number) => String(value).padStart(2, '0')

/** The day in local time, as 2026-11-04. */
export const localDate = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** One file a day; a second backup on the same day replaces the first. */
export const backupFileName = (time: number) => `my-notes-backup-${localDate(time)}.json`

const BACKUP_FILE = /^my-notes-backup-\d{4}-\d{2}-\d{2}\.json$/

/** The backups of ours to remove from a folder, keeping the newest `keep`; other files are never touched. */
export function backupsToRemove(names: Iterable<string>, keep = BACKUPS_KEPT): string[] {
  return [...names].filter((name) => BACKUP_FILE.test(name)).sort().reverse().slice(keep)
}

export interface BackupTiming {
  frequency: BackupFrequency
  /** When the last backup (to the folder, or downloaded) was made. */
  lastBackupAt?: number
  /** When the app first ran on this device; reminders count from here until the first backup. */
  firstSeenAt: number
  /** The newest change to the library. */
  lastChangeAt: number
  now: number
}

/** A backup is due when the library changed since the last one and the interval has passed. */
export function isBackupDue({ frequency, lastBackupAt, firstSeenAt, lastChangeAt, now }: BackupTiming): boolean {
  if (frequency === 'off') return false
  const since = lastBackupAt ?? firstSeenAt
  return lastChangeAt > since && now - since >= FREQUENCY_MS[frequency]
}

/** Whole days since a time, for "Your last backup was 9 days ago". */
export const daysSince = (time: number, now: number) => Math.max(0, Math.floor((now - time) / DAY))
