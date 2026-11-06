/**
 * Captures sample databases made by past versions of the app, for the upgrade tests
 * (src/test/databaseFixtures/upgrades.test.ts). Each version's own storage code builds a small
 * library with everything that version could store, and the database is saved as JSON.
 *
 * Past versions are read from git worktrees; to capture again, or to add the version a change
 * is about to replace:
 *
 *   git worktree add --detach .fixture-worktrees/<commit> <commit>
 *   npx vitest run --config vitest.fixtures.config.ts
 *
 * The current source is captured too, so the next upgrade is tested against today's data.
 */
import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, it, vi } from 'vitest'
import { dumpDatabase } from '../src/test/databaseFixtures/fixtureFormat'

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'src/test/databaseFixtures')

/** Every released database version, with the commit that introduced it (3 was never released). */
const PAST_VERSIONS = [
  { version: 1, commit: 'f931a8f' },
  { version: 2, commit: '241f369' },
  { version: 4, commit: 'c3e37d4' },
  { version: 5, commit: 'f8736cd' },
  { version: 6, commit: '9ea3c74' },
]

// Any storage module from any version: only the functions it has are used.
type Storage = Record<string, ((...args: never[]) => Promise<unknown>) | unknown>
const has = (storage: Storage, name: string) => typeof storage[name] === 'function'
const call = <T>(storage: Storage, name: string, ...args: unknown[]) => (storage[name] as (...values: unknown[]) => Promise<T>)(...args)

async function populate(storage: Storage) {
  const tick = () => vi.setSystemTime(Date.now() + 60_000)
  await call(storage, 'getNotes')
  const organized = has(storage, 'createNotebook')
  let shelfId: string | undefined
  if (has(storage, 'createLibrary')) {
    const library = await call<{ id: string }>(storage, 'createLibrary', 'Fixture library')
    shelfId = (await call<{ id: string }>(storage, 'createShelf', library.id, 'Fixture shelf')).id
  }
  const notebookId = organized ? (await call<{ id: string }>(storage, 'createNotebook', 'Fixture notebook', shelfId)).id : undefined
  const extra = (fields: Record<string, unknown>) => (organized ? { notebookId, ...fields } : {})

  tick()
  const garden = {
    id: 'fixture-garden',
    title: 'Garden plan',
    content: '# Garden\n\n- [ ] Sow basil\n- [x] Order seeds\n\nCafé ✓ — **bold** and `code`',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra({ tags: [' Garden', 'garden', 'Plans'], pinned: true }),
  }
  await call(storage, 'saveNote', garden)
  tick()
  await call(storage, 'saveNote', { ...garden, content: `${garden.content}\n\nA later edit`, updatedAt: Date.now() })
  tick()
  await call(storage, 'saveNote', { id: 'fixture-recipes', title: 'Recipes', content: 'Pesto: basil, garlic, pine nuts', createdAt: Date.now(), updatedAt: Date.now(), ...extra({ tags: ['Recipes'], favorite: true }) })
  tick()
  await call(storage, 'saveNote', { id: 'fixture-old', title: 'Old list', content: 'Done with this', createdAt: Date.now(), updatedAt: Date.now(), ...extra({ tags: ['Archive'] }) })
  if (has(storage, 'addNoteAttachment')) {
    await call(storage, 'addNoteAttachment', 'fixture-garden', new Blob([new Uint8Array([0, 1, 2, 253, 254, 255])], { type: 'application/octet-stream' }), 'bytes.bin')
  }
  if (has(storage, 'linkNotes')) await call(storage, 'linkNotes', 'fixture-recipes', 'fixture-garden')
  if (has(storage, 'trashNote')) await call(storage, 'trashNote', 'fixture-old')
  if (has(storage, 'saveTheme')) await call(storage, 'saveTheme', 'dark')
  if (has(storage, 'saveEditorMode')) await call(storage, 'saveEditorMode', 'source')
  if (has(storage, 'saveSearch')) await call(storage, 'saveSearch', 'Open tasks', 'has:task')
  if (has(storage, 'recordReading')) await call(storage, 'recordReading', 'fixture-garden')
}

async function capture(source: string, label: string, description: string) {
  // A fresh, empty IndexedDB, and the version's own modules.
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
  const storage = (await import(/* @vite-ignore */ path.join(source, 'lib/notes.ts'))) as Storage
  await populate(storage)
  const fixture = await dumpDatabase('my-notes', description)
  const file = path.join(output, `my-notes-v${fixture.version}-${label}.json`)
  await writeFile(file, `${JSON.stringify(fixture, null, 1)}\n`)
}

describe('capture database fixtures', () => {
  afterEach(() => vi.useRealTimers())

  for (const { version, commit } of PAST_VERSIONS) {
    const source = path.join(root, '.fixture-worktrees', commit, 'src')
    it.skipIf(!existsSync(source))(`version ${version} (${commit})`, async () => {
      await capture(source, commit, `Made by the storage code of commit ${commit}, the first release of database version ${version}.`)
    })
  }

  it('the current source', async () => {
    const commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()
    await capture(path.join(root, 'src'), 'latest', `Made by the storage code at commit ${commit} (plus any uncommitted changes), the latest when captured.`)
  })
})
