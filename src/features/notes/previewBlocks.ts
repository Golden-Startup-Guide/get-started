/**
 * What a note card shows of a note: its first few lines as simple blocks (headings, paragraphs,
 * bullets, numbered items, checklist items, quotes), with formatting marks removed, so cards
 * read like the start of a document rather than Markdown. Tables, code, maths, and diagrams are
 * shown as a word ("Table") instead of their text.
 *
 * Deliberately simple and fast: the grid shows many cards, so this reads only the start of a
 * note, line by line, without a full Markdown parse.
 */
export type PreviewBlock =
  | { kind: 'heading' | 'paragraph' | 'quote'; text: string }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'numbered'; text: string; number: string; depth: number }
  | { kind: 'task'; text: string; done: boolean; depth: number }
  | { kind: 'object'; object: 'table' | 'code' | 'formula' | 'diagram' | 'image' }

const MAX_BLOCKS = 6
const MAX_CHARACTERS = 600

/** Private-use characters stand in for escaped ones ("\*") while marks are removed. */
const ESCAPED = 0xe000

/** Removes inline formatting marks, keeping the words people see in the note. */
export function plainInline(text: string): string {
  return text
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>=$])/g, (_match, character: string) => String.fromCharCode(ESCAPED + character.charCodeAt(0)))
    // Images and embedded notes: their name.
    .replace(/!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Links: their words. Note links: the shown text, or the note's title.
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]#|]*)(?:#([^\]|]+))?\]\]/g, (_match, title: string, section?: string) => [title.trim(), section?.trim()].filter(Boolean).join(' › '))
    .replace(/\[([^\]]+)\]\((?:<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\)/g, '$1')
    // Bold, italic, strikethrough, code, and highlight marks.
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(^|[^\w*])([*_])(?=\S)(.+?)(?<=\S)\2(?![\w*])/g, '$1$3')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Inline maths: the formula as typed, without its dollar signs.
    .replace(/\$\$(.+?)\$\$/g, '$1')
    // Footnote references and HTML tags; then the escaped characters come back.
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/[-]/g, (character) => String.fromCharCode(character.charCodeAt(0) - ESCAPED))
    .replace(/\s+/g, ' ')
    .trim()
}

export function cardPreview(content: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = []
  const lines = content.slice(0, 4_000).split(/\r?\n/)
  let characters = 0
  let fence: string | undefined
  let inMathBlock = false
  let paragraph: string[] = []

  const push = (block: PreviewBlock) => {
    const last = blocks[blocks.length - 1]
    // One "Table" for a whole table, not one per row.
    if (block.kind === 'object' && last?.kind === 'object' && last.object === block.object) return
    // An empty list item or heading (a template's blank "- ") shows nothing.
    if ('text' in block && !block.text) return
    blocks.push(block)
    if ('text' in block) characters += block.text.length
  }
  const flushParagraph = () => {
    const text = plainInline(paragraph.join(' '))
    paragraph = []
    if (text) push({ kind: 'paragraph', text })
  }
  const full = () => blocks.length >= MAX_BLOCKS || characters >= MAX_CHARACTERS

  for (const raw of lines) {
    if (full()) break
    const line = raw.replace(/\t/g, '    ')
    if (fence) {
      if (line.trim().startsWith(fence)) fence = undefined
      continue
    }
    if (inMathBlock) {
      if (line.trim().endsWith('$$')) inMathBlock = false
      continue
    }
    const opening = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line)
    if (opening) {
      flushParagraph()
      fence = opening[1]
      push({ kind: 'object', object: opening[2] === 'mermaid' ? 'diagram' : opening[2] === 'math' ? 'formula' : 'code' })
      continue
    }
    if (/^\s*\$\$/.test(line)) {
      flushParagraph()
      push({ kind: 'object', object: 'formula' })
      inMathBlock = !/^\s*\$\$.*\$\$\s*$/.test(line) || line.trim() === '$$'
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      continue
    }
    // A front-matter or thematic break line, or a table's separator row.
    if (/^\s*([-*_]\s*){3,}$/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) {
      flushParagraph()
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph()
      push({ kind: 'object', object: 'table' })
      continue
    }
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
      flushParagraph()
      push({ kind: 'object', object: 'image' })
      continue
    }
    const depth = Math.min(3, Math.floor((/^(\s*)/.exec(line)?.[1].length ?? 0) / 2))
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*+](?:\s+(.*))?$/.exec(line)
    const numbered = /^\s*(\d{1,9})[.)](?:\s+(.*))?$/.exec(line)
    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (heading || task || bullet || numbered || quote) flushParagraph()
    if (heading) push({ kind: 'heading', text: plainInline(heading[1]) })
    else if (task) push({ kind: 'task', done: task[1] !== ' ', text: plainInline(task[2]), depth })
    else if (bullet) push({ kind: 'bullet', text: plainInline(bullet[1] ?? ''), depth })
    else if (numbered) push({ kind: 'numbered', number: numbered[1], text: plainInline(numbered[2] ?? ''), depth })
    // A callout's marker ("> [!NOTE]") is not part of what it says.
    else if (quote) push({ kind: 'quote', text: plainInline(quote[1].replace(/^\[!\w+\]\s*/, '')) })
    else paragraph.push(line.trim())
  }
  if (!full()) flushParagraph()
  return blocks
}
