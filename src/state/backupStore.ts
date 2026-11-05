import { create } from 'zustand'
import { canBackUpToFolder, chooseBackupFolder, folderPermission, readBackupFromFolder, writeBackupToFolder, type BackupFolder } from '../features/backup/backupFolder'
import { isBackupDue, SNOOZE_MS, type BackupFrequency } from '../features/backup/backupSchedule'
import { checkBackup, describeCheck, type BackupCheck } from '../lib/backupCheck'
import { readDeviceValue, writeDeviceValue } from '../lib/deviceStore'
import { exportBackupFile } from '../lib/notes'
import { useLibraryStore } from './libraryStore'
import { t } from '../i18n/i18n'

/** What is kept about backups on this device (the folder is kept separately). */
interface BackupRecord {
  frequency: BackupFrequency
  firstSeenAt: number
  lastBackupAt?: number
  /** The file written last, or 'download' for an exported backup. */
  lastBackupFile?: string
  /** What the last automatic backup had to leave out to fit, if anything. */
  lastBackupOmitted?: 'history' | 'attachments and history'
  /** The last backup's test restore: what came back, or what went wrong. */
  lastCheck?: { at: number; ok: boolean; summary: string }
  snoozedUntil?: number
}

export type BackupReminder = 'permission' | 'overdue' | 'failed'

interface BackupState extends BackupRecord {
  loaded: boolean
  /** The browser can write to a folder. */
  supported: boolean
  folder?: BackupFolder
  permission?: PermissionState
  running: boolean
  /** Why the last automatic backup failed, until one succeeds. */
  lastError?: string
  /** When backups were last checked, for working out reminders. */
  checkedAt: number
  load: () => Promise<void>
  /** Checks whether a backup is due, and makes it if a folder is ready. */
  check: () => Promise<void>
  chooseFolder: () => Promise<void>
  /** Asks again for access to the folder (needs a click), then backs up if due. */
  allowFolder: () => Promise<void>
  stopFolder: () => Promise<void>
  backUpNow: () => Promise<void>
  setFrequency: (frequency: BackupFrequency) => Promise<void>
  /** A backup was exported by hand, and restored as a test with this result. */
  recordDownload: (check: BackupCheck) => Promise<void>
  snooze: () => Promise<void>
}

const RECORD_KEY = 'backup'
const FOLDER_KEY = 'backupFolder'

const record = (state: BackupRecord): BackupRecord => ({
  frequency: state.frequency,
  firstSeenAt: state.firstSeenAt,
  lastBackupAt: state.lastBackupAt,
  lastBackupFile: state.lastBackupFile,
  lastBackupOmitted: state.lastBackupOmitted,
  lastCheck: state.lastCheck,
  snoozedUntil: state.snoozedUntil,
})

const checkRecord = (check: BackupCheck): NonNullable<BackupRecord['lastCheck']> =>
  ({ at: Date.now(), ok: check.ok, summary: check.ok ? describeCheck(check) : check.problem })

type Dated = ReadonlyArray<{ updatedAt: number; deletedAt?: number }>

/** The newest change to anything in the library. */
export function newestChange(...lists: Dated[]): number {
  let newest = 0
  for (const items of lists) {
    for (const item of items) newest = Math.max(newest, item.updatedAt, item.deletedAt ?? 0)
  }
  return newest
}

function lastLibraryChange(): number {
  const { notes, trash, notebooks, shelves, libraries } = useLibraryStore.getState()
  return newestChange(notes, trash, notebooks, shelves, libraries)
}

/**
 * The backup to write: everything if it fits in a backup file, otherwise without history, then
 * without attachments too, so an automatic backup always protects at least the notes.
 */
async function buildBackup(): Promise<{ blob: Blob; omitted?: BackupRecord['lastBackupOmitted'] }> {
  try {
    return { blob: await exportBackupFile({ attachments: true, history: true }) }
  } catch {
    try {
      return { blob: await exportBackupFile({ attachments: true, history: false }), omitted: 'history' }
    } catch {
      return { blob: await exportBackupFile({ attachments: false, history: false }), omitted: 'attachments and history' }
    }
  }
}

export const useBackupStore = create<BackupState>()((set, get) => {
  const save = () => writeDeviceValue(RECORD_KEY, record(get()))

  async function backUp(folder: BackupFolder) {
    if (get().running) return
    set({ running: true })
    try {
      const { blob, omitted } = await buildBackup()
      const now = Date.now()
      const file = await writeBackupToFolder(folder, blob, now)
      // Only a backup proven by restoring it, as saved, counts; otherwise keep trying.
      const check = await checkBackup(await readBackupFromFolder(folder, file))
      if (check.ok) {
        set({ lastBackupAt: now, lastBackupFile: file, lastBackupOmitted: omitted, lastCheck: checkRecord(check), lastError: undefined, snoozedUntil: undefined })
      } else {
        set({ lastCheck: checkRecord(check), lastError: t('{file} was saved, but restoring it as a test failed: {problem}.', { file, problem: check.problem }) })
      }
      await save()
    } catch (reason) {
      set({ lastError: reason instanceof Error ? reason.message : t('The backup could not be written.') })
    } finally {
      set({ running: false, checkedAt: Date.now() })
    }
  }

  return {
    loaded: false,
    supported: false,
    frequency: 'weekly',
    firstSeenAt: 0,
    running: false,
    checkedAt: 0,
    load: async () => {
      const saved = await readDeviceValue<BackupRecord>(RECORD_KEY)
      const folder = await readDeviceValue<BackupFolder>(FOLDER_KEY)
      const supported = canBackUpToFolder()
      const usable = supported && folder && typeof folder.getFileHandle === 'function' ? folder : undefined
      const permission = usable ? await folderPermission(usable).catch(() => 'denied' as const) : undefined
      set({ ...(saved ?? { frequency: 'weekly', firstSeenAt: Date.now() }), supported, folder: usable, permission, loaded: true, checkedAt: Date.now() })
      if (!saved) await save()
    },
    check: async () => {
      const state = get()
      set({ checkedAt: Date.now() })
      if (!state.loaded || !state.folder || state.permission !== 'granted') return
      if (!isBackupDue({ ...state, lastChangeAt: lastLibraryChange(), now: Date.now() })) return
      await backUp(state.folder)
    },
    chooseFolder: async () => {
      const folder = await chooseBackupFolder()
      if (!folder) return
      const permission = await folderPermission(folder, true)
      set({ folder, permission, lastError: undefined, frequency: get().frequency === 'off' ? 'daily' : get().frequency })
      // Kept for next time; if this browser cannot keep it, backups still run while the app is open.
      await writeDeviceValue(FOLDER_KEY, folder).catch(() => undefined)
      await save()
      if (permission === 'granted') await backUp(folder)
    },
    allowFolder: async () => {
      const folder = get().folder
      if (!folder) return
      const permission = await folderPermission(folder, true).catch(() => 'denied' as const)
      set({ permission })
      if (permission === 'granted') await get().check()
    },
    stopFolder: async () => {
      set({ folder: undefined, permission: undefined, lastError: undefined })
      await writeDeviceValue(FOLDER_KEY, undefined)
    },
    backUpNow: async () => {
      const folder = get().folder
      if (!folder) return
      if (get().permission !== 'granted') {
        const permission = await folderPermission(folder, true).catch(() => 'denied' as const)
        set({ permission })
        if (permission !== 'granted') return
      }
      await backUp(folder)
    },
    setFrequency: async (frequency) => {
      set({ frequency })
      await save()
    },
    recordDownload: async (check) => {
      set(check.ok
        ? { lastBackupAt: Date.now(), lastBackupFile: 'download', lastBackupOmitted: undefined, lastCheck: checkRecord(check), snoozedUntil: undefined, checkedAt: Date.now() }
        : { lastCheck: checkRecord(check), checkedAt: Date.now() })
      await save()
    },
    snooze: async () => {
      set({ snoozedUntil: Date.now() + SNOOZE_MS })
      await save()
    },
  }
})

/**
 * The reminder to show, if any: access to the backup folder needs allowing again, the last
 * automatic backup failed, or (without a folder) a backup is overdue. Worked out from the last
 * check rather than the clock, so it changes only when backups are checked.
 */
export function backupReminder(state: BackupState, lastChangeAt: number): BackupReminder | undefined {
  const now = state.checkedAt
  if (!state.loaded || state.frequency === 'off' || (state.snoozedUntil ?? 0) > now) return undefined
  if (!isBackupDue({ ...state, lastChangeAt, now })) return undefined
  if (state.folder && state.permission === 'prompt') return 'permission'
  if (state.folder && state.permission === 'granted') return state.lastError ? 'failed' : undefined
  return 'overdue'
}
