import type { Note, Notebook } from '../types'

/** Notes in a notebook with this name are templates. */
export const TEMPLATES_NOTEBOOK = 'Templates'
/** Daily notes live in a notebook with this name. */
export const DAILY_NOTEBOOK = 'Daily notes'
/** A template with this title is used for new daily notes. */
export const DAILY_TEMPLATE_TITLE = 'Daily note'

const pad = (value: number) => String(value).padStart(2, '0')

/** A date as YYYY-MM-DD in the device's time zone: the title of that day's daily note. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Fills a template's placeholders, ignoring case and spaces inside the braces:
 * {{date}} 2026-11-03, {{time}} 14:05, {{weekday}} Tuesday, {{longdate}} Tuesday, 3 November 2026
 * (in the device's language), and {{title}} the new note's title. Unknown placeholders are kept.
 */
export function fillTemplate(text: string, { date, title = '' }: { date: Date; title?: string }): string {
  const values: Record<string, string> = {
    date: isoDate(date),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    weekday: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date),
    longdate: new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    title,
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) => values[name.toLowerCase()] ?? placeholder)
}

export const DEFAULT_DAILY_NOTE = `# {{longdate}}

## Today
- [ ] Plan the day

## Notes
`

export const SAMPLE_TEMPLATE = `# {{title}}

Created {{longdate}} at {{time}}.

## Agenda
- First topic

## Actions
- [ ] First action
`

const sameName = (notebook: Notebook, name: string) => notebook.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()

export function findNotebook(notebooks: readonly Notebook[], name: string): Notebook | undefined {
  return notebooks.find((notebook) => sameName(notebook, name))
}

/** Template notes, by title. */
export function findTemplates(notes: readonly Note[], notebooks: readonly Notebook[]): Note[] {
  const templates = findNotebook(notebooks, TEMPLATES_NOTEBOOK)
  if (!templates) return []
  return notes
    .filter((note) => note.notebookId === templates.id && note.deletedAt === undefined)
    .sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'))
}

/** The day's daily note, if it exists. */
export function findDailyNote(notes: readonly Note[], notebooks: readonly Notebook[], date: Date): Note | undefined {
  const daily = findNotebook(notebooks, DAILY_NOTEBOOK)
  if (!daily) return undefined
  const title = isoDate(date)
  return notes.find((note) => note.notebookId === daily.id && note.deletedAt === undefined && note.title.trim() === title)
}

/** The content for a new daily note: the "Daily note" template if there is one, otherwise a simple layout. */
export function dailyNoteContent(notes: readonly Note[], notebooks: readonly Notebook[], date: Date): string {
  const template = findTemplates(notes, notebooks).find((note) => note.title.trim().toLocaleLowerCase() === DAILY_TEMPLATE_TITLE.toLocaleLowerCase())
  return fillTemplate(template?.content ?? DEFAULT_DAILY_NOTE, { date, title: isoDate(date) })
}
