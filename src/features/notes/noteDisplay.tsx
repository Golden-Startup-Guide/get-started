import type {
  Note,
  Notebook,
} from '../../types'

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt,
  )
}

// Cards clamp to a few lines, so rendering a note's full text would only cost time.
export const CARD_PREVIEW_LENGTH = 600

// Iterative so a long note with many matches cannot overflow the call stack.
export function highlight(text: string, query: string): React.ReactNode {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return text
  const lower = text.toLocaleLowerCase()
  const parts: React.ReactNode[] = []
  let start = 0
  let index = lower.indexOf(term)
  while (index >= 0) {
    if (index > start) parts.push(text.slice(start, index))
    parts.push(
      <mark key={index} className="rounded bg-amber-200 px-0.5 text-stone-950">
        {text.slice(index, index + term.length)}
      </mark>,
    )
    start = index + term.length
    index = lower.indexOf(term, start)
  }
  if (!parts.length) return text
  if (start < text.length) parts.push(text.slice(start))
  return <>{parts}</>
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    timestamp,
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function getNoteLinkLabel(note: Note, records: Note[], notebooks: Notebook[]): string {
  const title = note.title || 'Untitled note'
  const duplicates = records.filter((item) =>
    (item.title || 'Untitled note').toLocaleLowerCase() === title.toLocaleLowerCase(),
  )
  const notebook = notebooks.find((item) => item.id === note.notebookId)?.name ?? 'Personal'
  const maxIdLength = Math.max(0, ...duplicates.map((item) => item.id.length))
  let suffixLength = Math.min(8, maxIdLength)
  while (suffixLength < maxIdLength && duplicates.some((item) =>
    item.id !== note.id && item.id.slice(-suffixLength) === note.id.slice(-suffixLength),
  )) {
    suffixLength += 1
  }
  return `${title} — ${notebook}${duplicates.length > 1 ? ` · ${note.id.slice(-suffixLength)}` : ''}`
}
