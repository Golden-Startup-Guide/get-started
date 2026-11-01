// Generates a large, realistic library and writes it straight into the app's IndexedDB
// database (schema 6). Benchmarks run this inside the page with Playwright's page.evaluate,
// which serializes only the function's source: it must stay self-contained, with no imports
// or module-level helpers. Type-only imports are fine because they are erased.
import type { Library, Note, NoteHistoryEntry, NoteLink, Notebook, Shelf, Tag } from '../src/types'

export interface SeedOptions {
  /** Ordinary notes to create (the large note is extra). */
  notes: number
  /** Same seed, same library. */
  seed?: number
  /** Adds one note of roughly this many bytes, for typing-latency measurements. */
  largeNoteBytes?: number
}

export interface SeedSummary {
  notes: number
  libraries: number
  shelves: number
  notebooks: number
  tags: number
  links: number
  revisions: number
  contentBytes: number
  /** A word planted in a known share of notes and nowhere else. */
  searchTerm: string
  searchMatches: number
  largeNoteId: string | null
  largeNoteTitle: string
}

export async function seedLibrary({ notes: noteCount, seed = 20261101, largeNoteBytes = 0 }: SeedOptions): Promise<SeedSummary> {
  // mulberry32: small, fast, deterministic.
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))

  const words = [
    'garden', 'compost', 'seedling', 'harvest', 'project', 'meeting', 'budget', 'invoice', 'research', 'paper',
    'chapter', 'outline', 'recipe', 'flour', 'oven', 'travel', 'flight', 'hotel', 'museum', 'river',
    'mountain', 'trail', 'workout', 'protein', 'sleep', 'habit', 'journal', 'reflection', 'idea', 'sketch',
    'design', 'prototype', 'feedback', 'release', 'deadline', 'review', 'question', 'answer', 'library', 'shelf',
    'notebook', 'reading', 'quote', 'author', 'history', 'science', 'physics', 'biology', 'music', 'guitar',
    'practice', 'lesson', 'teacher', 'student', 'family', 'birthday', 'gift', 'friend', 'weekend', 'morning',
    'evening', 'coffee', 'market', 'vegetable', 'tomato', 'pepper', 'basil', 'water', 'sunlight', 'soil',
    'contract', 'client', 'proposal', 'strategy', 'growth', 'customer', 'support', 'ticket', 'bug', 'feature',
    'database', 'storage', 'backup', 'security', 'privacy', 'offline', 'search', 'index', 'graph', 'link',
    'the', 'and', 'with', 'for', 'about', 'after', 'before', 'during', 'next', 'every',
  ] as const
  const searchTerm = 'zephyrine'
  const sentence = () => {
    const text = Array.from({ length: between(8, 16) }, () => pick(words)).join(' ')
    return text[0].toUpperCase() + text.slice(1) + '.'
  }
  const paragraph = () => Array.from({ length: between(2, 5) }, sentence).join(' ')

  const base = Date.UTC(2025, 0, 1)
  const libraries: Library[] = ['Personal Library', 'Work Library', 'Study Library'].map((name, index) => ({
    id: `bench-library-${index}`, name, createdAt: base + index, updatedAt: base + index,
  }))
  const shelves: Shelf[] = libraries.flatMap((library, libraryIndex) =>
    ['General', 'Projects', 'Reference', 'Archive'].map((name, index) => ({
      id: `bench-shelf-${libraryIndex}-${index}`, libraryId: library.id, name, createdAt: base + index, updatedAt: base + index,
    })),
  )
  const notebooks: Notebook[] = Array.from({ length: 60 }, (_, index) => ({
    id: index === 0 ? 'starter-personal' : `bench-notebook-${index}`,
    name: index === 0 ? 'Personal' : `${pick(words)} ${pick(words)} ${index}`,
    shelfId: shelves[index % shelves.length].id,
    createdAt: base + index,
    updatedAt: base + index,
  }))
  const tagPool = Array.from({ length: 150 }, (_, index) => `${pick(words)}-${index}`)

  const notes: Note[] = []
  const history: NoteHistoryEntry[] = []
  const links: NoteLink[] = []
  const linkKeys = new Set<string>()
  const tagCounts = new Map<string, { label: string; count: number }>()
  let contentBytes = 0
  let searchMatches = 0

  for (let index = 0; index < noteCount; index += 1) {
    const id = `bench-note-${index}`
    const blocks: string[] = []
    if (random() < 0.2) blocks.push(`## ${sentence().slice(0, -1)}`)
    for (let count = between(2, 6); count > 0; count -= 1) blocks.push(paragraph())
    if (random() < 0.3) {
      blocks.push(Array.from({ length: between(2, 5) }, () => `- [${random() < 0.5 ? 'x' : ' '}] ${sentence()}`).join('\n'))
    }
    // Exactly every 100th note contains the search term, so its match count is known.
    if (index % 100 === 0) {
      blocks.push(`Remember ${searchTerm} for later.`)
      searchMatches += 1
    }
    const content = blocks.join('\n\n')
    contentBytes += content.length
    const noteTags = [...new Set(Array.from({ length: between(0, 3) }, () => pick(tagPool)))]
    for (const label of noteTags) {
      const key = label.toLocaleLowerCase()
      tagCounts.set(key, { label, count: (tagCounts.get(key)?.count ?? 0) + 1 })
    }
    const createdAt = base + index * 60_000
    const note: Note = {
      id,
      title: `${sentence().slice(0, -1).split(' ').slice(0, between(2, 6)).join(' ')} ${index}`,
      content,
      createdAt,
      updatedAt: createdAt + between(0, 86_400_000),
      notebookId: pick(notebooks).id,
      tags: noteTags,
      pinned: random() < 0.01,
      favorite: random() < 0.05,
    }
    notes.push(note)
    if (index % 10 === 0) {
      for (let revision = 0; revision < 2; revision += 1) {
        history.push({
          id: `bench-revision-${index}-${revision}`,
          noteId: id,
          savedAt: createdAt + revision,
          snapshot: { ...note, content: paragraph(), updatedAt: createdAt + revision },
        })
      }
    }
    for (let count = index === 0 ? 0 : between(0, 3); count > 0; count -= 1) {
      const targetNoteId = `bench-note-${between(0, index - 1)}`
      const key = `${id}>${targetNoteId}`
      if (linkKeys.has(key)) continue
      linkKeys.add(key)
      links.push({ sourceNoteId: id, targetNoteId })
    }
  }

  const largeNoteTitle = 'Large benchmark note'
  let largeNoteId: string | null = null
  if (largeNoteBytes > 0) {
    largeNoteId = 'bench-large-note'
    const chunk = `${paragraph()}\n\n`
    const content = chunk.repeat(Math.ceil(largeNoteBytes / chunk.length)).slice(0, largeNoteBytes)
    contentBytes += content.length
    notes.push({
      id: largeNoteId,
      title: largeNoteTitle,
      content,
      // The oldest note, so it sorts last and "open a note" measures a typical one.
      createdAt: base - 1,
      updatedAt: base - 1,
      notebookId: notebooks[0].id,
      tags: [],
      pinned: false,
      favorite: false,
    })
  }

  const tags: Tag[] = [...tagCounts].map(([id, value]) => ({ id, ...value }))

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('my-notes')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const run = (storeNames: string[], work: (transaction: IDBTransaction) => void) =>
    new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite')
      work(transaction)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  const content = ['notes', 'notebooks', 'shelves', 'libraries', 'tags', 'noteLinks', 'history', 'attachments']
  await run(content, (transaction) => {
    for (const name of content) transaction.objectStore(name).clear()
  })
  const putAll = async (storeName: string, records: unknown[]) => {
    for (let start = 0; start < records.length; start += 5000) {
      await run([storeName], (transaction) => {
        const store = transaction.objectStore(storeName)
        for (const record of records.slice(start, start + 5000)) store.put(record)
      })
    }
  }
  await putAll('libraries', libraries)
  await putAll('shelves', shelves)
  await putAll('notebooks', notebooks)
  await putAll('tags', tags)
  await putAll('notes', notes)
  await putAll('history', history)
  await putAll('noteLinks', links)
  db.close()

  return {
    notes: notes.length,
    libraries: libraries.length,
    shelves: shelves.length,
    notebooks: notebooks.length,
    tags: tags.length,
    links: links.length,
    revisions: history.length,
    contentBytes,
    searchTerm,
    searchMatches,
    largeNoteId,
    largeNoteTitle,
  }
}
