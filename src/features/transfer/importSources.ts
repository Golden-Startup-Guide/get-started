import { msg } from '../../i18n/i18n'
// The apps notes can be imported from, described for the import form. Kept apart from the
// importers, which are loaded only when an import starts.
export type ImportSource = 'markdown' | 'notion' | 'evernote' | 'keep' | 'apple'

/** What each source's export looks like, for the import form. */
export const IMPORT_SOURCES: Record<ImportSource, { label: string; accept: string; hint: string; folders: boolean }> = {
  markdown: {
    label: msg('Markdown files or an Obsidian vault'),
    accept: '.md,.markdown,.txt,.zip',
    hint: msg('Choose the vault folder, a .zip of it, or Markdown files. Folders become notebooks; front matter tags, #tags, and embedded files are kept. A Markdown export from this app imports this way too.'),
    folders: true,
  },
  notion: {
    label: msg('Notion'),
    accept: '.zip,.md',
    hint: msg('In Notion, choose Export → Markdown & CSV, then pick the .zip. Pages become notes in a “Notion” notebook, and links between pages become [[links]]. Databases (CSV) are not imported.'),
    folders: false,
  },
  evernote: {
    label: msg('Evernote'),
    accept: '.enex',
    hint: msg('In Evernote, export a notebook as an .enex file. Each file becomes a notebook of the same name, with tags, dates, checklists, and attachments.'),
    folders: false,
  },
  keep: {
    label: msg('Google Keep'),
    accept: '.zip,.json',
    hint: msg('From Google Takeout, export Keep and pick the .zip. Notes keep their labels (as tags), checklists, pins, and images; archived notes get the tag “archived”, and notes in Keep’s trash go to Trash.'),
    folders: false,
  },
  apple: {
    label: msg('Apple Notes'),
    accept: '.html,.htm,.md,.markdown,.txt,.zip',
    hint: msg('Apple Notes cannot export by itself: use an exporter app (such as “Exporter” on the Mac) to save notes as Markdown or HTML, then choose that folder or .zip. Folders become notebooks.'),
    folders: true,
  },
}
