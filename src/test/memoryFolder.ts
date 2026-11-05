import type { BackupFolder } from '../features/backup/backupFolder'

// jsdom's Blob has no text().
export const readText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(blob)
})

/** A folder in memory, standing in for one picked with the File System Access API. */
export class MemoryFolder implements BackupFolder {
  files = new Map<string, string>()
  permission: PermissionState = 'granted'
  constructor(readonly name = 'Backups') {}
  async getFileHandle(name: string) {
    return {
      createWritable: async () => ({
        write: async (data: Blob) => {
          this.files.set(name, await readText(data))
        },
        close: async () => undefined,
      }),
      getFile: async () => {
        const text = this.files.get(name)
        if (text === undefined) throw new DOMException('Not found', 'NotFoundError')
        return new Blob([text], { type: 'application/json' })
      },
    }
  }
  async removeEntry(name: string) {
    this.files.delete(name)
  }
  async *keys() {
    yield* [...this.files.keys()]
  }
  async queryPermission() {
    return this.permission
  }
  async requestPermission() {
    if (this.permission === 'prompt') this.permission = 'granted'
    return this.permission
  }
}
