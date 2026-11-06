import type { IncomingNote } from '../../lib/notes'
import { listOf, parseFrontMatter, parseTime } from './frontMatter'
import { htmlToMarkdown } from './htmlToMarkdown'
import { baseName, findReferenced, folderOf, stem, textOf, typeOf, type InputFile } from './inputFiles'
import type { ImportSource } from './importSources'

export function convert(source: ImportSource, files: readonly InputFile[]): IncomingNote[] {
  switch (source) {
    case 'markdown': return fromMarkdownFiles(files, 'Imported')
    case 'apple': return fromMarkdownFiles(files, 'Apple Notes')
    case 'notion': return fromNotion(files)
    case 'evernote': return fromEvernote(files)
    case 'keep': return fromKeep(files)
  }
}

const now = () => Date.now()
const NOTE_FILE = /\.(md|markdown|txt|html?)$/i

// --- Markdown files, Obsidian vaults, and Apple Notes exports --------------------------------

// Inline #tags as Obsidian writes them (not headings, not inside words or code).
const INLINE_TAG = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu

function inlineTags(markdown: string): string[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```|`[^`\n]*`/g, '')
  return [...withoutCode.matchAll(INLINE_TAG)].map((match) => match[2])
}

/**
 * Notes from Markdown, text, or HTML files: the file name is the title (unless front matter
 * gives one), the folder it is in is the notebook, and front matter supplies tags, dates, and
 * flags. Files a note embeds or links to are attached, and the embed is left as a mention.
 */
export function fromMarkdownFiles(files: readonly InputFile[], defaultNotebook: string): IncomingNote[] {
  const notes: IncomingNote[] = []
  for (const file of files) {
    if (!NOTE_FILE.test(file.path) || /(^|\/)\.(obsidian|trash)\//.test(file.path)) continue
    const text = textOf(file)
    const html = /\.html?$/i.test(file.path)
    const { data, body } = html ? { data: {}, body: text } : parseFrontMatter(text)
    const attachments: IncomingNote['attachments'] = []
    const attach = (reference: string) => {
      const found = findReferenced(files, file.path, reference)
      if (found && !NOTE_FILE.test(found.path) && !attachments.some((item) => item.name === baseName(found.path))) {
        attachments.push({ name: baseName(found.path), type: typeOf(found.path), data: found.data })
      }
      return found
    }
    let content: string
    let title = typeof data.title === 'string' ? data.title : stem(file.path)
    if (html) {
      const doc = new DOMParser().parseFromString(text, 'text/html')
      title = doc.title.trim() || doc.querySelector('h1')?.textContent?.trim() || title
      content = htmlToMarkdown(text, { attachmentName: (element) => attach(element.getAttribute('src') ?? '') ? baseName(element.getAttribute('src') ?? '') : undefined })
    } else {
      content = body
        // Obsidian embeds of files: ![[photo.png]] (a [[note]] embed is left for the app to show).
        .replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (embed, target: string) => (attach(target.trim()) ? `*(attachment: ${baseName(target.trim())})*` : embed))
        // Markdown images and links to local files: ![alt](images/photo.png), [report](files/report.pdf)
        // (a link in <…> may contain spaces).
        .replace(/(!?)\[([^\]]*)\]\((?:<([^>\n]+)>|([^)\s]+))\)/g, (link, _image: string, text: string, bracketed?: string, plain?: string) => {
          const href = bracketed ?? plain ?? ''
          if (/^[a-z][\w+.-]*:/i.test(href) || href.startsWith('#') || /\.(md|markdown)$/i.test(href)) return link
          return attach(href) ? `*(attachment: ${text || baseName(href)})*` : link
        })
        // The list of attachments an export from this app adds at the end; they are attached again.
        .replace(/\n*## Attachments\n\n(?:- \*\(attachment: [^)\n]*\)\*\n?)+$/, '\n')
    }
    const fileTime = (key: string) => parseTime(data[key] as string | undefined)
    const created = fileTime('created') ?? fileTime('date') ?? now()
    const notebookName = (typeof data.notebook === 'string' && data.notebook) || folderOf(file.path) || defaultNotebook
    notes.push({
      title: title.trim() || 'Untitled note',
      content: content.replace(/^\s*\n/, ''),
      tags: [...new Set([...listOf(data.tags), ...listOf(data.tag), ...inlineTags(content)].map((tag) => tag.replace(/^#/, '')))],
      notebook: notebookName,
      createdAt: created,
      updatedAt: fileTime('updated') ?? fileTime('modified') ?? created,
      pinned: data.pinned === 'true',
      favorite: data.favorite === 'true',
      trashed: data.trashed === 'true' || Boolean(fileTime('deleted')),
      attachments,
    })
  }
  return notes
}

// --- Notion ----------------------------------------------------------------------------------

// Notion adds a 32-character ID to every exported file and folder name: "Plan 1a2b…f.md".
const NOTION_ID = /\s+[0-9a-f]{32}(?=(\.\w+)?$)/i
const withoutNotionId = (name: string) => name.replace(NOTION_ID, '')

export function fromNotion(files: readonly InputFile[]): IncomingNote[] {
  const pages = files.filter((file) => /\.md$/i.test(file.path))
  const others = files.filter((file) => !NOTE_FILE.test(file.path))
  const titleOf = new Map(pages.map((file) => [baseName(file.path), withoutNotionId(stem(file.path))]))
  return pages.flatMap((page) => fromMarkdownFiles([page, ...others], 'Notion')).map((note, index) => {
    const title = withoutNotionId(stem(pages[index].path))
    // The page title is repeated as the first heading.
    let content = note.content.replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '')
    // Links to other pages become [[wikilinks]].
    content = content.replace(/\[([^\]]*)\]\(<?([^)>]+\.md)>?\)/g, (link, text: string, href: string) => {
      let target: string
      try {
        target = baseName(decodeURIComponent(href))
      } catch {
        return link
      }
      const linked = titleOf.get(target)
      if (!linked) return link
      return text && text !== linked ? `[[${linked}|${text}]]` : `[[${linked}]]`
    })
    return { ...note, title, content: content.replace(/^\s*\n/, ''), notebook: 'Notion' }
  })
}

// --- Evernote (.enex) ------------------------------------------------------------------------

/** Evernote's dates: 20240131T094500Z. */
const enexTime = (value: string | null | undefined) => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value?.trim() ?? '')
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]) : undefined
}

const base64Bytes = (value: string) => Uint8Array.from(atob(value.replace(/\s+/g, '')), (char) => char.charCodeAt(0))

export function fromEvernote(files: readonly InputFile[]): IncomingNote[] {
  const notes: IncomingNote[] = []
  for (const file of files) {
    if (!/\.enex$/i.test(file.path)) continue
    const doc = new DOMParser().parseFromString(textOf(file), 'application/xml')
    for (const note of Array.from(doc.getElementsByTagName('note'))) {
      const child = (name: string) => note.getElementsByTagName(name)[0]?.textContent ?? undefined
      const attachments: IncomingNote['attachments'] = []
      const names: string[] = []
      for (const resource of Array.from(note.getElementsByTagName('resource'))) {
        const data = resource.getElementsByTagName('data')[0]?.textContent
        if (!data) continue
        const type = resource.getElementsByTagName('mime')[0]?.textContent ?? 'application/octet-stream'
        const name = resource.getElementsByTagName('file-name')[0]?.textContent ?? `attachment-${attachments.length + 1}.${type.split('/')[1] ?? 'bin'}`
        attachments.push({ name, type, data: base64Bytes(data) })
        names.push(name)
      }
      let media = 0
      const created = enexTime(child('created')) ?? now()
      notes.push({
        title: child('title')?.trim() || 'Untitled note',
        // Inline attachments appear in order; each is mentioned by name.
        content: htmlToMarkdown(child('content') ?? '', { attachmentName: () => names[media++] }),
        tags: Array.from(note.getElementsByTagName('tag')).map((tag) => tag.textContent?.trim() ?? '').filter(Boolean),
        notebook: stem(file.path),
        createdAt: created,
        updatedAt: enexTime(child('updated')) ?? created,
        attachments,
      })
    }
  }
  return notes
}

// --- Google Keep (Takeout) -------------------------------------------------------------------

interface KeepNote {
  title?: string
  textContent?: string
  textContentHtml?: string
  listContent?: Array<{ text: string; isChecked: boolean }>
  labels?: Array<{ name: string }>
  attachments?: Array<{ filePath: string; mimetype?: string }>
  isTrashed?: boolean
  isArchived?: boolean
  isPinned?: boolean
  createdTimestampUsec?: number
  userEditedTimestampUsec?: number
}

export function fromKeep(files: readonly InputFile[]): IncomingNote[] {
  const notes: IncomingNote[] = []
  for (const file of files) {
    if (!/\.json$/i.test(file.path)) continue
    let keep: KeepNote
    try {
      keep = JSON.parse(textOf(file))
    } catch {
      continue
    }
    if (typeof keep !== 'object' || keep === null || !('textContent' in keep || 'listContent' in keep)) continue
    const list = (keep.listContent ?? []).map((item) => `- [${item.isChecked ? 'x' : ' '}] ${item.text}`).join('\n')
    const attachments = (keep.attachments ?? []).flatMap((attachment) => {
      const found = findReferenced(files, file.path, attachment.filePath)
      return found ? [{ name: baseName(found.path), type: attachment.mimetype ?? typeOf(found.path), data: found.data }] : []
    })
    const created = keep.createdTimestampUsec ? Math.round(keep.createdTimestampUsec / 1000) : now()
    notes.push({
      title: keep.title?.trim() || stem(file.path) || 'Untitled note',
      content: [keep.textContent?.trim(), list].filter(Boolean).join('\n\n'),
      tags: [...(keep.labels ?? []).map((label) => label.name), ...(keep.isArchived ? ['archived'] : [])],
      notebook: 'Google Keep',
      createdAt: created,
      updatedAt: keep.userEditedTimestampUsec ? Math.round(keep.userEditedTimestampUsec / 1000) : created,
      pinned: keep.isPinned,
      trashed: keep.isTrashed,
      attachments,
    })
  }
  return notes
}
