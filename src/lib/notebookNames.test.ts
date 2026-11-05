import { beforeAll, describe, expect, it } from 'vitest'

describe('notebook names', () => {
  let storage: typeof import('./notes')
  beforeAll(async () => {
    storage = await import('./notes')
  })

  it('are unique across libraries, and the message says where the existing one is', async () => {
    const library = await storage.createLibrary('Name test library')
    const shelf = await storage.createShelf(library.id, 'Name test shelf')
    const garden = await storage.createNotebook('Garden plans', shelf.id)
    const other = await storage.createNotebook('Other plans', shelf.id)
    const expected = 'A notebook named “Garden plans” already exists, on the shelf “Name test shelf”. Notebook names are unique across all your libraries, so choose another name.'
    await expect(storage.createNotebook('  garden PLANS ')).rejects.toThrow(expected)
    await expect(storage.renameNotebook(other.id, 'GARDEN plans')).rejects.toThrow(expected)
    // Renaming a notebook to its own name in different capitals is fine.
    await storage.renameNotebook(garden.id, 'garden plans')
    expect((await storage.getNotebooks()).find((notebook) => notebook.id === garden.id)?.name).toBe('garden plans')
  })
})
