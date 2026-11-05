// The apps notes can be imported from, described for the import form. Kept apart from the
// importers, which are loaded only when an import starts.
export type ImportSource = 'markdown' | 'notion' | 'evernote' | 'keep' | 'apple'

/** What each source's export looks like, for the import form. */
export const IMPORT_SOURCES: Record<ImportSource, { label: string; accept: string; hint: string; folders: boolean }> = {
  markdown: {
    label: 'Markdown files or an Obsidian vault',
    accept: '.md,.markdown,.txt,.zip',
    hint: 'Choose the vault folder, a .zip of it, or Markdown files. Folders become notebooks; front matter tags, #tags, and embedded files are kept. A My Notes Markdown export imports this way too.',
    folders: true,
  },
  notion: {
    label: 'Notion',
    accept: '.zip,.md',
    hint: 'In Notion, choose Export → Markdown & CSV, then pick the .zip. Pages become notes in a “Notion” notebook, and links between pages become [[links]]. Databases (CSV) are not imported.',
    folders: false,
  },
  evernote: {
    label: 'Evernote',
    accept: '.enex',
    hint: 'In Evernote, export a notebook as an .enex file. Each file becomes a notebook of the same name, with tags, dates, checklists, and attachments.',
    folders: false,
  },
  keep: {
    label: 'Google Keep',
    accept: '.zip,.json',
    hint: 'From Google Takeout, export Keep and pick the .zip. Notes keep their labels (as tags), checklists, pins, and images; archived notes get the tag “archived”, and notes in Keep’s trash go to Trash.',
    folders: false,
  },
  apple: {
    label: 'Apple Notes',
    accept: '.html,.htm,.md,.markdown,.txt,.zip',
    hint: 'Apple Notes cannot export by itself: use an exporter app (such as “Exporter” on the Mac) to save notes as Markdown or HTML, then choose that folder or .zip. Folders become notebooks.',
    folders: true,
  },
}
