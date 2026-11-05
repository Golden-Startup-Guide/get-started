import type {
  Note,
  Notebook,
} from '../../types'
import { t } from '../../i18n/i18n'

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt,
  )
}

// Cards clamp to a few lines, so rendering a note's full text would only cost time.
export const CARD_PREVIEW_LENGTH = 600

/**
 * Marks every case-insensitive match of any of the terms (the search's words and phrases). Where
 * terms overlap, the earliest and then the longest wins. Iterative so a long note with many
 * matches cannot overflow the call stack.
 */
export function highlight(text: string, terms: readonly string[]): React.ReactNode {
  const needles = terms.map((term) => term.trim().toLocaleLowerCase()).filter(Boolean)
  if (!needles.length) return text
  const lower = text.toLocaleLowerCase()
  const parts: React.ReactNode[] = []
  let start = 0
  for (;;) {
    let index = -1
    let length = 0
    for (const needle of needles) {
      const found = lower.indexOf(needle, start)
      if (found >= 0 && (index < 0 || found < index || (found === index && needle.length > length))) {
        index = found
        length = needle.length
      }
    }
    if (index < 0) break
    if (index > start) parts.push(text.slice(start, index))
    parts.push(
      <mark key={index} className="rounded bg-amber-200 px-0.5 text-stone-950">
        {text.slice(index, index + length)}
      </mark>,
    )
    start = index + length
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

/**
 * Labels for choosing a note in a list: "Title — Notebook". Notes that share a title (ignoring
 * case) also get the shortest ID suffix, at least 8 characters, that tells them apart.
 *
 * Builds every label in one pass. Computing one label at a time scanned the whole library per
 * note, which made the editor's link picker quadratic in the number of notes.
 */
export function buildNoteLinkLabels(records: Note[], notebooks: Notebook[]): Map<string, string> {
  const notebookNames = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]))
  const byTitle = new Map<string, Note[]>()
  for (const note of records) {
    const key = (note.title || 'Untitled note').toLocaleLowerCase()
    const group = byTitle.get(key)
    if (group) group.push(note)
    else byTitle.set(key, [note])
  }

  const labels = new Map<string, string>()
  for (const group of byTitle.values()) {
    const suffixes = new Map<string, string>()
    if (group.length > 1) {
      const maxIdLength = Math.max(...group.map((note) => note.id.length))
      let unresolved = group
      // Each note gets the shortest length at which no other duplicate shares its suffix.
      for (let length = Math.min(8, maxIdLength); unresolved.length && length < maxIdLength; length += 1) {
        const counts = new Map<string, number>()
        for (const note of group) counts.set(note.id.slice(-length), (counts.get(note.id.slice(-length)) ?? 0) + 1)
        unresolved = unresolved.filter((note) => {
          if (counts.get(note.id.slice(-length)) !== 1) return true
          suffixes.set(note.id, note.id.slice(-length))
          return false
        })
      }
      for (const note of unresolved) suffixes.set(note.id, note.id.slice(-maxIdLength))
    }
    for (const note of group) {
      const title = note.title || t('Untitled note')
      const notebook = notebookNames.get(note.notebookId ?? '') ?? 'Personal'
      const suffix = suffixes.get(note.id)
      labels.set(note.id, `${title} — ${notebook}${suffix === undefined ? '' : ` · ${suffix}`}`)
    }
  }
  return labels
}
