import { openDB, type DBSchema } from 'idb'
import type { Note } from '../types'

interface NotesDatabase extends DBSchema {
  notes: {
    key: string
    value: Note
    indexes: { 'by-updated': number }
  }
}

const database = openDB<NotesDatabase>('my-notes', 1, {
  upgrade(db) {
    const store = db.createObjectStore('notes', { keyPath: 'id' })
    store.createIndex('by-updated', 'updatedAt')
  },
})

export async function getNotes(): Promise<Note[]> {
  const db = await database
  return (await db.getAll('notes')).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveNote(note: Note): Promise<void> {
  const db = await database
  await db.put('notes', note)
}

export async function deleteNote(id: string): Promise<void> {
  const db = await database
  await db.delete('notes', id)
}
