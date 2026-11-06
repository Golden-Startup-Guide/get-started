import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryFolder } from '../test/memoryFolder'
import type { Note } from '../types'

const DAY = 24 * 60 * 60 * 1000

async function freshStores() {
  vi.resetModules()
  const { useBackupStore, backupReminder } = await import('./backupStore')
  const { useLibraryStore } = await import('./libraryStore')
  return { useBackupStore, backupReminder, useLibraryStore }
}

const edited = (updatedAt: number): Note => ({ id: `n${updatedAt}`, title: 'Edited', content: '', createdAt: 1, updatedAt })

describe('automatic backups', () => {
  beforeEach(async () => {
    // Earlier tests' copies of the modules keep the device database open, so clear it rather than delete it.
    const { writeDeviceValue } = await import('../lib/deviceStore')
    await writeDeviceValue('backup', undefined)
    await writeDeviceValue('backupFolder', undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reminds to download a backup when no folder can be used, until snoozed', async () => {
    const { useBackupStore, backupReminder } = await freshStores()
    await useBackupStore.getState().load()
    const state = useBackupStore.getState()
    expect(state).toEqual(expect.objectContaining({ loaded: true, supported: false, frequency: 'weekly' }))
    const now = Date.now()
    // Nothing changed since the app first ran: no reminder.
    expect(backupReminder(state, state.firstSeenAt - 1)).toBeUndefined()
    useBackupStore.setState({ firstSeenAt: now - 8 * DAY, checkedAt: now })
    expect(backupReminder(useBackupStore.getState(), now - DAY)).toBe('overdue')

    await useBackupStore.getState().snooze()
    expect(backupReminder(useBackupStore.getState(), now - DAY)).toBeUndefined()
    useBackupStore.setState({ checkedAt: now + 2 * DAY })
    expect(backupReminder(useBackupStore.getState(), now - DAY)).toBe('overdue')

    // A downloaded backup counts, and is remembered on this device.
    await useBackupStore.getState().recordDownload({ ok: true, notes: 5, attachments: 0, history: 0, links: 0 })
    expect(backupReminder(useBackupStore.getState(), now - DAY)).toBeUndefined()
    const reloaded = await freshStores()
    await reloaded.useBackupStore.getState().load()
    expect(reloaded.useBackupStore.getState().lastBackupFile).toBe('download')

    await useBackupStore.getState().setFrequency('off')
    useBackupStore.setState({ lastBackupAt: now - 30 * DAY, checkedAt: now })
    expect(backupReminder(useBackupStore.getState(), now)).toBeUndefined()
  })

  it('backs up to a chosen folder at once, then again when due and the library changed', async () => {
    const folder = new MemoryFolder('Cloud backups')
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => folder))
    const { useBackupStore, backupReminder, useLibraryStore } = await freshStores()
    await useBackupStore.getState().load()
    expect(useBackupStore.getState().supported).toBe(true)

    await useBackupStore.getState().chooseFolder()
    const first = useBackupStore.getState()
    expect(first.folder?.name).toBe('Cloud backups')
    expect(first.lastBackupFile).toMatch(/^my-notes-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(folder.files.get(first.lastBackupFile!)!)).toEqual(expect.objectContaining({ version: 4, notes: expect.any(Array) }))
    // Proven by restoring it, as saved, into a test database.
    expect(first.lastCheck).toEqual({ at: expect.any(Number), ok: true, summary: expect.stringMatching(/^\d+ notes?, \d+ attachments?, \d+ history entr(y|ies), and \d+ links?$/) })

    // Not due again straight away.
    folder.files.clear()
    await useBackupStore.getState().check()
    expect(folder.files.size).toBe(0)

    // A day later, with a change since: backed up again.
    const now = Date.now()
    useBackupStore.setState({ lastBackupAt: now - 2 * DAY })
    await useBackupStore.getState().setFrequency('daily')
    useLibraryStore.setState({ notes: [edited(now - DAY)] })
    await useBackupStore.getState().check()
    expect(folder.files.size).toBe(1)
    expect(useBackupStore.getState().lastBackupAt).toBeGreaterThanOrEqual(now)

    // After a restart the browser may ask again: a reminder offers to allow access, then backs up.
    folder.files.clear()
    folder.permission = 'prompt'
    useBackupStore.setState({ permission: 'prompt', lastBackupAt: now - 2 * DAY, checkedAt: now })
    await useBackupStore.getState().check()
    expect(folder.files.size).toBe(0)
    expect(backupReminder(useBackupStore.getState(), now - DAY)).toBe('permission')
    await useBackupStore.getState().allowFolder()
    expect(useBackupStore.getState().permission).toBe('granted')
    expect(folder.files.size).toBe(1)

    await useBackupStore.getState().stopFolder()
    expect(useBackupStore.getState().folder).toBeUndefined()
  })

  it('reports a failed backup and keeps trying', async () => {
    class FullFolder extends MemoryFolder {
      override async getFileHandle(): Promise<never> {
        throw new Error('The disk is full.')
      }
    }
    const folder = new FullFolder()
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => folder))
    const { useBackupStore, backupReminder } = await freshStores()
    await useBackupStore.getState().load()
    await useBackupStore.getState().chooseFolder()
    const state = useBackupStore.getState()
    expect(state.lastError).toBe('The disk is full.')
    expect(state.lastBackupAt).toBeUndefined()
    useBackupStore.setState({ firstSeenAt: Date.now() - 8 * DAY, checkedAt: Date.now() })
    expect(backupReminder(useBackupStore.getState(), Date.now())).toBe('failed')
  })

  it('does not count a backup that fails its test restore', async () => {
    // The file reads back damaged, as if the disk or a sync client mangled it.
    class DamagingFolder extends MemoryFolder {
      override async getFileHandle(name: string) {
        const handle = await super.getFileHandle(name)
        return { ...handle, getFile: async () => new Blob(['{"format": "my-notes-backup", "notes": [']) }
      }
    }
    const folder = new DamagingFolder()
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => folder))
    const { useBackupStore, backupReminder } = await freshStores()
    await useBackupStore.getState().load()
    await useBackupStore.getState().chooseFolder()
    const state = useBackupStore.getState()
    expect(state.lastBackupAt).toBeUndefined()
    expect(state.lastCheck).toEqual({ at: expect.any(Number), ok: false, summary: 'the file is not valid JSON' })
    expect(state.lastError).toMatch(/^my-notes-backup-.+\.json was saved, but restoring it as a test failed: the file is not valid JSON\.$/)
    useBackupStore.setState({ firstSeenAt: Date.now() - 8 * DAY, checkedAt: Date.now() })
    expect(backupReminder(useBackupStore.getState(), Date.now())).toBe('failed')
  })
})
