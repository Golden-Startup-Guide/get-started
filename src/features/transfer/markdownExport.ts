import { strToU8, zipSync } from 'fflate'
import { base64ToArrayBuffer, type NotesBackup } from '../../lib/backupFormat'
import { serializeFrontMatter } from './frontMatter'

/** A name safe on every file system: no slashes, colons, or other reserved characters. */
export function safeFileName(name: string, fallback = 'Untitled'): string {
  const cleaned = name
    // Control characters are not allowed in file names on Windows.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 100)
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) || !cleaned ? fallback : cleaned
}

const iso = (time: number | undefined) => (time === undefined ? undefined : new Date(time).toISOString())

/**
 * The library as a folder of Markdown files, zipped: Library/Shelf/Notebook/Title.md, each with
 * its details (tags, dates, pinned, favorite) in front matter and its attachments in a folder
 * beside it. Notes in Trash are in a Trash folder. Obsidian and most Markdown apps open it as it
 * is, and the app imports it back ("Markdown files or an Obsidian vault").
 */
export function buildMarkdownZip(library: NotesBackup): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  const unique = (folder: string, name: string, extension: string) => {
    let candidate = `${folder}${name}${extension}`
    for (let copy = 2; used.has(candidate.toLowerCase()); copy += 1) candidate = `${folder}${name} (${copy})${extension}`
    used.add(candidate.toLowerCase())
    return candidate
  }

  const libraryName = new Map(library.libraries.map((item) => [item.id, safeFileName(item.name, 'Library')]))
  const shelfPath = new Map(library.shelves.map((shelf) => [shelf.id, `${libraryName.get(shelf.libraryId) ?? 'Library'}/${safeFileName(shelf.name, 'Shelf')}`]))
  const notebookById = new Map(library.notebooks.map((notebook) => [notebook.id, notebook]))
  const folderOf = (notebookId: string | undefined) => {
    const notebook = notebookId ? notebookById.get(notebookId) : undefined
    if (!notebook) return 'Notes/'
    const shelf = notebook.shelfId ? shelfPath.get(notebook.shelfId) : undefined
    return `${shelf ? `${shelf}/` : ''}${safeFileName(notebook.name, 'Notebook')}/`
  }
  const attachmentsOf = new Map<string, NotesBackup['attachments']>()
  for (const attachment of library.attachments) attachmentsOf.set(attachment.noteId, [...(attachmentsOf.get(attachment.noteId) ?? []), attachment])

  for (const note of library.notes) {
    const folder = note.deletedAt === undefined ? folderOf(note.notebookId) : 'Trash/'
    const title = note.title.trim() || 'Untitled note'
    const path = unique(folder, safeFileName(title), '.md')
    const attachmentFolder = `${path.slice(0, -3)} files/`
    const attachmentPaths: string[] = []
    for (const attachment of attachmentsOf.get(note.id) ?? []) {
      const filePath = unique(attachmentFolder, safeFileName(attachment.name.replace(/\.[^.]+$/, ''), 'attachment'), attachment.name.match(/\.[^.]+$/)?.[0] ?? '')
      files[filePath] = new Uint8Array(base64ToArrayBuffer(attachment.data))
      attachmentPaths.push(filePath.slice(folder.length))
    }
    const header = serializeFrontMatter({
      // File names lose some characters and gain " (2)" for repeats, so the exact title and
      // notebook are kept here.
      title: path.slice(folder.length, -3) !== title ? title : undefined,
      notebook: notebookById.get(note.notebookId ?? '')?.name,
      tags: note.tags ?? [],
      created: iso(note.createdAt),
      updated: iso(note.updatedAt),
      deleted: iso(note.deletedAt),
      pinned: note.pinned || undefined,
      favorite: note.favorite || undefined,
    })
    // Attachments are linked at the end, so they open from the note in any Markdown app.
    const links = attachmentPaths.length
      ? `\n\n## Attachments\n\n${attachmentPaths.map((file) => `- [${file.split('/').pop()}](<${file}>)`).join('\n')}\n`
      : ''
    files[path] = strToU8(`${header}${note.content}${links}`)
  }
  return zipSync(files, { level: 6 })
}
