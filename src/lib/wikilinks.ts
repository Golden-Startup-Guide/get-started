import type { Note, NoteLink } from '../types'

/**
 * Wikilinks: `[[Note title]]` or `[[Note title|shown text]]` in a note's Markdown links it to the
 * note with that title. They are derived from the text rather than stored, so deleting the text
 * removes the link. Links added with the "Linked notes" picker are stored separately and are
 * unaffected.
 */

// The target cannot contain brackets, "|" or a line break; the shown text cannot contain brackets.
export const WIKILINK_PATTERN = /\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/g

/** Titles match ignoring case and repeated or surrounding spaces. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/**
 * The Markdown with fenced code blocks and inline code replaced by spaces, so `[[...]]` written as
 * code is not treated as a link. Offsets are preserved.
 */
function withoutCode(markdown: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  return markdown
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm, blank)
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, blank)
}

/** Every wikilink target in the Markdown, in order, without duplicates (by normalized title). */
export function findWikilinkTargets(markdown: string): string[] {
  if (!markdown.includes('[[')) return []
  const seen = new Set<string>()
  const targets: string[] = []
  for (const match of withoutCode(markdown).matchAll(WIKILINK_PATTERN)) {
    const target = match[1].trim()
    const key = normalizeTitle(target)
    if (!key || seen.has(key)) continue
    seen.add(key)
    targets.push(target)
  }
  return targets
}

/**
 * Maps each normalized title to a note. When several notes share a title, the most recently
 * updated one is the target, matching what a person most likely means.
 */
export function buildTitleIndex(notes: Note[]): Map<string, Note> {
  const index = new Map<string, Note>()
  for (const note of notes) {
    const key = normalizeTitle(note.title)
    if (!key) continue
    const existing = index.get(key)
    if (!existing || note.updatedAt > existing.updatedAt) index.set(key, note)
  }
  return index
}

// Parsing every note again on each library refresh would be wasted work: a note's targets only
// change when it is saved, which changes updatedAt.
const targetCache = new Map<string, { updatedAt: number; targets: string[] }>()

function targetsOf(note: Note): string[] {
  const cached = targetCache.get(note.id)
  if (cached && cached.updatedAt === note.updatedAt) return cached.targets
  const targets = findWikilinkTargets(note.content)
  targetCache.set(note.id, { updatedAt: note.updatedAt, targets })
  return targets
}

/** The links that wikilinks in these notes' text make between them (self-links excluded). */
export function deriveWikilinks(notes: Note[], titleIndex = buildTitleIndex(notes)): NoteLink[] {
  const links: NoteLink[] = []
  for (const note of notes) {
    for (const target of targetsOf(note)) {
      // [[Title#Section]] links to the note; [[#Section]] is within this note and not a link.
      const targetNote = titleIndex.get(normalizeTitle(targetTitle(target)))
      if (targetNote && targetNote.id !== note.id) links.push({ sourceNoteId: note.id, targetNoteId: targetNote.id })
    }
  }
  return links
}

/** The note title a link target names: the part before any "#section". */
export function targetTitle(target: string): string {
  const hash = target.indexOf('#')
  return hash < 0 ? target : target.slice(0, hash)
}

/**
 * Rewrites [[links]] to `oldTitle` so they name `newTitle`, keeping each link's "#section" and
 * "|shown text". Links inside code, and links to other titles, are left exactly as they were.
 */
export function renameWikilinks(markdown: string, oldTitle: string, newTitle: string): string {
  if (!markdown.includes('[[')) return markdown
  const from = normalizeTitle(oldTitle)
  const to = newTitle.trim()
  if (!from || !to) return markdown
  // Matches are found in the text with code blanked out; offsets are the same in the original.
  const masked = withoutCode(markdown)
  let result = ''
  let last = 0
  for (const match of masked.matchAll(WIKILINK_PATTERN)) {
    const target = match[1]
    if (normalizeTitle(targetTitle(target)) !== from) continue
    const start = match.index + 2
    const section = target.slice(targetTitle(target).length)
    result += markdown.slice(last, start) + to + section
    last = start + target.length
  }
  return last ? result + markdown.slice(last) : markdown
}

/** Notes (other than `excludeId`) whose text links to `title`, by [[title]] or [[title#section]]. */
export function notesLinkingTo(notes: readonly Note[], title: string, excludeId?: string): Note[] {
  const key = normalizeTitle(title)
  if (!key) return []
  return notes.filter((note) => note.id !== excludeId
    && note.deletedAt === undefined
    && targetsOf(note).some((target) => normalizeTitle(targetTitle(target)) === key))
}

const linkKey = (link: NoteLink) => `${link.sourceNoteId}\u0000${link.targetNoteId}`

/** Stored links plus wikilinks, each pair once. */
export function mergeLinks(stored: NoteLink[], fromText: NoteLink[]): NoteLink[] {
  const seen = new Set(stored.map(linkKey))
  const merged = [...stored]
  for (const link of fromText) {
    const key = linkKey(link)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(link)
  }
  return merged
}
