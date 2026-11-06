import { backupFileName, backupsToRemove } from './backupSchedule'

/**
 * A folder on the device that backups are written to, through the File System Access API
 * (Chrome and Edge on computers). Only what the app uses is described, so tests can stand in
 * for it.
 */
export interface BackupFolder {
  readonly name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
    getFile(): Promise<Blob>
  }>
  removeEntry(name: string): Promise<void>
  keys(): AsyncIterable<string>
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
}

type DirectoryPicker = (options: { id?: string; mode: 'readwrite'; startIn?: string }) => Promise<BackupFolder>

const picker = () => (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker

/** Whether this browser can write backups to a folder. */
export const canBackUpToFolder = () => typeof window !== 'undefined' && typeof picker() === 'function'

/** Asks the user for a folder; undefined if they cancel. */
export async function chooseBackupFolder(): Promise<BackupFolder | undefined> {
  const show = picker()
  if (!show) return undefined
  try {
    return await show({ id: 'my-notes-backups', mode: 'readwrite', startIn: 'documents' })
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') return undefined
    throw reason
  }
}

/**
 * Whether the app may write to the folder. After a restart the browser may want to ask again
 * ('prompt'), which needs a click; `ask` does that, so call it only from one.
 */
export async function folderPermission(folder: BackupFolder, ask = false): Promise<PermissionState> {
  const descriptor = { mode: 'readwrite' } as const
  if (!folder.queryPermission) return 'granted'
  const state = await folder.queryPermission(descriptor)
  if (state !== 'prompt' || !ask || !folder.requestPermission) return state
  return folder.requestPermission(descriptor)
}

/** Writes today's backup (replacing one already made today) and removes the oldest beyond those kept. */
export async function writeBackupToFolder(folder: BackupFolder, backup: Blob, now: number): Promise<string> {
  const name = backupFileName(now)
  const file = await folder.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(backup)
  await writable.close()
  const names: string[] = []
  for await (const entry of folder.keys()) names.push(entry)
  for (const old of backupsToRemove(names)) {
    // A file that cannot be removed is left; the next backup tries again.
    await folder.removeEntry(old).catch(() => undefined)
  }
  return name
}

/** Reads a backup back from the folder, as saved, to check it. */
export async function readBackupFromFolder(folder: BackupFolder, name: string): Promise<string> {
  return readText(await (await folder.getFileHandle(name)).getFile())
}

/** A file's text (with a fallback for test environments whose Blob has no text()). */
export function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}
