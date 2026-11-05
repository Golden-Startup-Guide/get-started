import { collectLibrary, importNotes, type NotesImportSummary } from '../../lib/notes'
import { convert } from './importers'
import type { ImportSource } from './importSources'
import { readInputFiles } from './inputFiles'
import { buildMarkdownZip } from './markdownExport'
import { t } from '../../i18n/i18n'

/**
 * Moving notes in and out, loaded only when used (the zip library and the importers stay out of
 * the install download).
 */
export async function exportMarkdown(): Promise<{ zip: Blob; notes: number }> {
  const library = await collectLibrary({ attachments: true, history: false })
  const zip = buildMarkdownZip(library)
  return { zip: new Blob([zip.slice().buffer], { type: 'application/zip' }), notes: library.notes.length }
}

export async function importFromFiles(source: ImportSource, files: readonly File[]): Promise<NotesImportSummary> {
  const notes = convert(source, await readInputFiles(files))
  if (!notes.length) throw new Error(t("No notes were found in the chosen files. Check that they are the export this app makes."))
  return importNotes(notes)
}
