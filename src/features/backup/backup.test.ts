import { describe, expect, it } from 'vitest'
import { MemoryFolder } from '../../test/memoryFolder'
import { writeBackupToFolder, folderPermission } from './backupFolder'
import { backupFileName, backupsToRemove, daysSince, isBackupDue, localDate } from './backupSchedule'

const DAY = 24 * 60 * 60 * 1000
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()

describe('backup schedule', () => {
  it('names one backup file a day, in local time', () => {
    expect(localDate(at(4, 23))).toBe('2026-11-04')
    expect(backupFileName(at(4, 0))).toBe('my-notes-backup-2026-11-04.json')
  })

  it('is due when the library changed since the last backup and the interval has passed', () => {
    const base = { firstSeenAt: at(1), now: at(9) }
    expect(isBackupDue({ ...base, frequency: 'weekly', lastChangeAt: at(2) })).toBe(true)
    // Nothing changed since the last backup.
    expect(isBackupDue({ ...base, frequency: 'weekly', lastBackupAt: at(3), lastChangeAt: at(2) })).toBe(false)
    // Changed, but the last backup is recent.
    expect(isBackupDue({ ...base, frequency: 'weekly', lastBackupAt: at(5), lastChangeAt: at(8) })).toBe(false)
    expect(isBackupDue({ ...base, frequency: 'daily', lastBackupAt: at(5), lastChangeAt: at(8) })).toBe(true)
    expect(isBackupDue({ ...base, frequency: 'daily', lastBackupAt: at(9) - DAY + 1, lastChangeAt: at(9) })).toBe(false)
    expect(isBackupDue({ ...base, frequency: 'off', lastChangeAt: at(8) })).toBe(false)
  })

  it('removes only its own backups beyond the newest kept', () => {
    const names = ['notes.txt', 'my-notes-backup-2026-11-03.json', 'my-notes-backup-2026-11-01.json', 'my-notes-backup-2026-11-04.json', 'my-notes-backup-2026-11-02.json', 'my-notes-backup-copy.json']
    expect(backupsToRemove(names, 2)).toEqual(['my-notes-backup-2026-11-02.json', 'my-notes-backup-2026-11-01.json'])
    expect(backupsToRemove(names, 14)).toEqual([])
  })

  it('counts whole days', () => {
    expect(daysSince(at(1), at(9, 11))).toBe(7)
    expect(daysSince(at(9), at(1))).toBe(0)
  })
})

describe('backup folder', () => {
  it('writes today’s backup, replacing one from earlier today, and keeps the newest 14', async () => {
    const folder = new MemoryFolder()
    folder.files.set('holiday.jpg', 'not ours')
    for (let day = 1; day <= 20; day += 1) await writeBackupToFolder(folder, new Blob([`day ${day}`]), at(day))
    expect(await writeBackupToFolder(folder, new Blob(['day 20, later']), at(20, 18))).toBe('my-notes-backup-2026-11-20.json')
    const ours = [...folder.files.keys()].filter((name) => name.startsWith('my-notes-backup-')).sort()
    expect(ours).toHaveLength(14)
    expect(ours[0]).toBe('my-notes-backup-2026-11-07.json')
    expect(folder.files.get('my-notes-backup-2026-11-20.json')).toBe('day 20, later')
    expect(folder.files.get('holiday.jpg')).toBe('not ours')
  })

  it('asks for permission again only when allowed to', async () => {
    const folder = new MemoryFolder()
    folder.permission = 'prompt'
    expect(await folderPermission(folder)).toBe('prompt')
    expect(await folderPermission(folder, true)).toBe('granted')
  })
})
