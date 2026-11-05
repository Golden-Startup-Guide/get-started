import { openDB } from 'idb'

/**
 * Settings that belong to this device rather than to the library, so they stay out of backups:
 * the backup folder (a browser handle that cannot be exported) and when backups were made. Kept
 * in a small database of their own, beside the notes database.
 */
const database = typeof indexedDB === 'undefined'
  ? undefined
  : openDB('my-notes-device', 1, {
    upgrade(db) {
      db.createObjectStore('values')
    },
  })

export async function readDeviceValue<T>(key: string): Promise<T | undefined> {
  const db = await database
  return db ? ((await db.get('values', key)) as T | undefined) : undefined
}

export async function writeDeviceValue<T>(key: string, value: T | undefined): Promise<void> {
  const db = await database
  if (!db) return
  if (value === undefined) await db.delete('values', key)
  else await db.put('values', value, key)
}
