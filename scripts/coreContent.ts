/**
 * Reads the built-in handbooks in content/ (see content/README.md), checks them, and compiles
 * them for the app. Used by the Vite plugin below, so every build, dev server, and test run
 * checks the content; a mistake stops the build with a message naming the file.
 *
 * The app imports `virtual:core-content` for the catalog (libraries, shelves, notebooks, and the
 * content version), and loads each library's notes as its own chunk, so the text of every
 * handbook is not parsed at start-up.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { CoreCatalog, CoreLibrary, CoreNote, CoreNotebook, CoreNoteType, CoreShelf } from '../src/types'

export interface CompiledContent {
  catalog: CoreCatalog
  /** Each library's notes, in notebook order. */
  notes: Record<string, CoreNote[]>
  /** Each picture's file, by the address its notes use for it (`core-picture:<path in content/>`). */
  pictures: Record<string, string>
  /** Every file read, for the dev server to watch. */
  files: string[]
}

const ID = /^core-[a-z0-9]+(?:-[a-z0-9]+)*$/
const NOTE_TYPES: CoreNoteType[] = ['Article', 'Guide', 'Chapter', 'Handbook']
const DATE = /^\d{4}-\d{2}-\d{2}$/
/** A picture in a note: `![what it shows](file.svg)`, the file next to the note. */
const PICTURE = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const PICTURE_TYPES = /\.(svg|png|jpe?g|webp)$/i
export const PICTURE_PREFIX = 'core-picture:'

type Header = Record<string, string | number | boolean>

/** A file's `---` header (one `key: value` per line) and the text after it. */
export function parseFile(text: string): { header: Header; body: string } {
  const normalized = text.replace(/\r\n?/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (!match) throw new Error('it has no header between --- lines')
  const header: Header = {}
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue
    const pair = /^([a-z]+):\s*(.*)$/.exec(line)
    if (!pair) throw new Error(`header line "${line}" is not "key: value"`)
    const raw = pair[2].trim()
    header[pair[1]] = /^".*"$/.test(raw)
      ? raw.slice(1, -1)
      : raw === 'true' || raw === 'false'
        ? raw === 'true'
        : /^-?\d+$/.test(raw)
          ? Number(raw)
          : raw
  }
  return { header, body: normalized.slice(match[0].length).trim() }
}

/** Reads and checks content/. Throws one error listing every problem found. */
export function compileContent(root: string): CompiledContent {
  const problems: string[] = []
  const files: string[] = []
  const ids = new Map<string, string>()
  const libraries: CoreLibrary[] = []
  const shelves: CoreShelf[] = []
  const notebooks: CoreNotebook[] = []
  const notes: CoreNote[] = []
  const pictures: Record<string, string> = {}
  const hash = createHash('sha256')

  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/')
  const read = (file: string) => {
    files.push(file)
    const text = readFileSync(file, 'utf8')
    hash.update(relative(file)).update('\0').update(text).update('\0')
    try {
      return parseFile(text)
    } catch (error) {
      problems.push(`${relative(file)}: ${(error as Error).message}`)
      return undefined
    }
  }
  const text = (file: string, header: Header, key: string) => {
    const value = header[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    problems.push(`${relative(file)}: "${key}" is missing`)
    return ''
  }
  const whole = (file: string, header: Header, key: string) => {
    if (Number.isInteger(header[key])) return header[key] as number
    problems.push(`${relative(file)}: "${key}" must be a whole number`)
    return 0
  }
  const identity = (file: string, header: Header) => {
    const id = text(file, header, 'id')
    if (id && !ID.test(id)) problems.push(`${relative(file)}: id "${id}" must start with "core-" and use only a-z, 0-9, and hyphens`)
    const earlier = ids.get(id)
    if (id && earlier) problems.push(`${relative(file)}: id "${id}" is already used by ${earlier}`)
    if (id) ids.set(id, relative(file))
    return id
  }
  const folders = (directory: string) =>
    readdirSync(directory).filter((name) => statSync(path.join(directory, name)).isDirectory()).sort()
  const level = (directory: string, name: string) => {
    const file = path.join(directory, name)
    try {
      statSync(file)
    } catch {
      problems.push(`${relative(directory)}/: ${name} is missing`)
      return undefined
    }
    const parsed = read(file)
    if (!parsed) return undefined
    return {
      file,
      id: identity(file, parsed.header),
      name: text(file, parsed.header, 'name'),
      description: text(file, parsed.header, 'description'),
      order: whole(file, parsed.header, 'order'),
    }
  }

  for (const libraryFolder of folders(root)) {
    const libraryDirectory = path.join(root, libraryFolder)
    const library = level(libraryDirectory, 'library.md')
    if (!library) continue
    const created = Date.UTC(2026, 10, 6)
    libraries.push({ id: library.id, name: library.name, description: library.description, order: library.order, createdAt: created, updatedAt: created, source: 'core' })
    for (const shelfFolder of folders(libraryDirectory)) {
      const shelfDirectory = path.join(libraryDirectory, shelfFolder)
      const shelf = level(shelfDirectory, 'shelf.md')
      if (!shelf) continue
      shelves.push({ id: shelf.id, libraryId: library.id, name: shelf.name, description: shelf.description, order: shelf.order, createdAt: created, updatedAt: created, source: 'core' })
      for (const notebookFolder of folders(shelfDirectory)) {
        const notebookDirectory = path.join(shelfDirectory, notebookFolder)
        const notebook = level(notebookDirectory, 'notebook.md')
        if (!notebook) continue
        notebooks.push({ id: notebook.id, shelfId: shelf.id, name: notebook.name, description: notebook.description, order: notebook.order, createdAt: created, updatedAt: created, source: 'core' })
        const noteFiles = readdirSync(notebookDirectory).filter((name) => name.endsWith('.md') && name !== 'notebook.md').sort()
        for (const name of noteFiles) {
          const file = path.join(notebookDirectory, name)
          const parsed = read(file)
          if (!parsed) continue
          const { header, body } = parsed
          const type = text(file, header, 'type') as CoreNoteType
          if (type && !NOTE_TYPES.includes(type)) problems.push(`${relative(file)}: type "${type}" must be one of ${NOTE_TYPES.join(', ')}`)
          const added = text(file, header, 'added')
          if (added && !(DATE.test(added) && !Number.isNaN(Date.parse(added)))) problems.push(`${relative(file)}: added "${added}" must be a date, YYYY-MM-DD`)
          if (header.draft !== undefined && typeof header.draft !== 'boolean') problems.push(`${relative(file)}: draft must be true or false`)
          if (!body) problems.push(`${relative(file)}: the note has no text`)
          // Every page has at least one picture, stored in content/ so it shows offline.
          let pictureCount = 0
          const content = body.replace(PICTURE, (whole, alt: string, source: string) => {
            pictureCount += 1
            if (!alt.trim()) problems.push(`${relative(file)}: the picture ${source} needs words saying what it shows, ![like this](${source})`)
            if (/^[a-z][a-z0-9+.-]*:|^\//i.test(source)) {
              problems.push(`${relative(file)}: the picture ${source} must be a file in content/, next to the note, so it shows offline`)
              return whole
            }
            if (!PICTURE_TYPES.test(source)) problems.push(`${relative(file)}: the picture ${source} must be .svg, .png, .jpg, or .webp`)
            const picture = path.join(notebookDirectory, source)
            let bytes: Buffer
            try {
              bytes = readFileSync(picture)
            } catch {
              problems.push(`${relative(file)}: the picture ${source} is not in ${relative(notebookDirectory)}/`)
              return whole
            }
            files.push(picture)
            const address = PICTURE_PREFIX + relative(picture)
            hash.update(relative(picture)).update('\0').update(bytes).update('\0')
            pictures[address] = picture
            return `![${alt}](${address})`
          })
          if (body && pictureCount === 0) problems.push(`${relative(file)}: every page needs at least one picture (see content/README.md)`)
          const time = Date.parse(added) || created
          notes.push({
            id: identity(file, header),
            title: text(file, header, 'title'),
            summary: text(file, header, 'summary'),
            type,
            order: whole(file, header, 'order'),
            added,
            ...(header.draft === true ? { draft: true } : {}),
            ...(typeof header.reviewed === 'string' && header.reviewed ? { reviewed: header.reviewed } : {}),
            content,
            notebookId: notebook.id,
            createdAt: time,
            updatedAt: time,
            tags: [],
            pinned: false,
            favorite: false,
            source: 'core',
          })
        }
      }
    }
  }

  // Titles are unique, and every [[link]] in a handbook note points at a handbook note.
  const titles = new Map<string, CoreNote>()
  for (const note of notes) {
    const key = note.title.toLocaleLowerCase()
    const other = titles.get(key)
    if (other) problems.push(`${ids.get(note.id)}: title "${note.title}" is also used by ${ids.get(other.id)}`)
    titles.set(key, note)
  }
  for (const note of notes) {
    for (const match of note.content.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      if (!titles.has(match[1].trim().toLocaleLowerCase())) problems.push(`${ids.get(note.id)}: [[${match[1].trim()}]] is not a handbook note`)
    }
  }

  if (problems.length) throw new Error(`The handbooks in content/ have ${problems.length === 1 ? 'a problem' : `${problems.length} problems`}:\n- ${problems.join('\n- ')}`)

  const byOrder = <T extends { order: number; name?: string; title?: string }>(a: T, b: T) => a.order - b.order || (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '')
  libraries.sort(byOrder)
  shelves.sort(byOrder)
  notebooks.sort(byOrder)
  notes.sort(byOrder)
  const shelfLibrary = new Map(shelves.map((shelf) => [shelf.id, shelf.libraryId]))
  const notebookLibrary = new Map(notebooks.map((notebook) => [notebook.id, shelfLibrary.get(notebook.shelfId)!]))
  const byLibrary: Record<string, CoreNote[]> = Object.fromEntries(libraries.map((library) => [library.id, []]))
  for (const note of notes) byLibrary[notebookLibrary.get(note.notebookId)!].push(note)

  return {
    catalog: { version: hash.digest('hex').slice(0, 12), libraries, shelves, notebooks },
    notes: byLibrary,
    pictures,
    files,
  }
}

const CATALOG = 'virtual:core-content'
const LIBRARY = `${CATALOG}/`

/**
 * Serves the handbooks to the app: `virtual:core-content` exports the catalog and a loader per
 * library; each loader imports that library's notes, which the build puts in its own file
 * (assets/core-<library id>-<hash>.js), precached so handbooks open offline.
 */
export function coreContentPlugin(root: string): Plugin {
  let base = '/'
  let building = false
  let projectRoot = process.cwd()
  return {
    name: 'core-content',
    configResolved(config) {
      base = config.base
      building = config.command === 'build'
      projectRoot = config.root
    },
    resolveId(id) {
      return id === CATALOG || id.startsWith(LIBRARY) ? `\0${id}` : undefined
    },
    load(id) {
      if (!id.startsWith(`\0${CATALOG}`)) return undefined
      const content = compileContent(root)
      for (const file of content.files) this.addWatchFile(file)
      if (id === `\0${CATALOG}`) {
        const loaders = content.catalog.libraries
          .map((library) => `  ${JSON.stringify(library.id)}: () => import(${JSON.stringify(LIBRARY + library.id)}).then((module) => module.default),`)
          .join('\n')
        return `export const catalog = ${JSON.stringify(content.catalog)}\nexport const loaders = {\n${loaders}\n}\n`
      }
      const libraryId = id.slice(`\0${LIBRARY}`.length)
      // Pictures become files of their own (assets/picture-<name>-<hash>.svg, precached with the
      // handbooks); the dev server serves them from content/ as they are.
      const address = (picture: string) => {
        const file = content.pictures[picture]
        if (!building) return base + path.relative(projectRoot, file).split(path.sep).join('/')
        const source = readFileSync(file)
        const { name, ext } = path.parse(file)
        const fileName = `assets/picture-${name}-${createHash('sha256').update(source).digest('hex').slice(0, 8)}${ext}`
        this.emitFile({ type: 'asset', fileName, source })
        return base + fileName
      }
      const notes = (content.notes[libraryId] ?? []).map((note) => ({
        ...note,
        content: note.content.replace(/\]\((core-picture:[^)\s]+)\)/g, (_whole, picture: string) => `](${address(picture)})`),
      }))
      return `export default ${JSON.stringify(notes)}\n`
    },
  }
}
