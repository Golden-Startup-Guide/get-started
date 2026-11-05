/**
 * Turns the HTML other apps export (Evernote's ENML, Google Keep, Apple Notes exporters) into
 * Markdown: headings, paragraphs, line breaks, bold, italic, strikethrough, links, lists
 * (nested), checklists, quotes, code, rules, simple tables, and images. Anything else keeps its
 * text. Attachments shown inline (Evernote's en-media, local images) become "(attachment: …)".
 */
export function htmlToMarkdown(html: string, options: { attachmentName?: (element: Element) => string | undefined } = {}): string {
  // Evernote writes <en-todo/> and <en-media/> self-closed, which HTML parsing ignores (the
  // text after them would end up inside them), so they are closed first.
  const closed = html.replace(/<(en-todo|en-media)\b([^>]*?)\s*\/>/gi, '<$1$2></$1>')
  const doc = new DOMParser().parseFromString(closed, 'text/html')
  const markdown = blocks(doc.body, options)
  return markdown.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

type Options = Parameters<typeof htmlToMarkdown>[1]

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'EN-NOTE', 'BODY'])

const BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, hr, table'

const escapeText = (text: string) => text.replace(/([\\`*_[\]])/g, '\\$1')

function blocks(element: Element, options: Options): string {
  let output = ''
  let line = ''
  const flush = (separator: string) => {
    const text = line.trim()
    // A line that starts with a checkbox (Evernote's to-dos) is a checklist item.
    if (text) output += `${/^\[[ x]\] /.test(text) ? `- ${text}` : text}${separator}`
    line = ''
  }
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      line += escapeText((node.textContent ?? '').replace(/\s+/g, ' '))
      continue
    }
    if (!(node instanceof Element)) continue
    const tag = node.tagName.toUpperCase()
    if (!BLOCK_TAGS.has(tag)) {
      // An inline element holding paragraphs or lists (Google Docs wraps everything it copies in
      // a <b>) is read as a container, so its paragraphs and lists keep their shape.
      if (node.querySelector(BLOCK_SELECTOR)) {
        flush('\n\n')
        output += blocks(node, options)
        continue
      }
      line += inline(node, options)
      continue
    }
    // A div is a line (Evernote writes one per line); a paragraph is followed by a blank line.
    flush(tag === 'DIV' ? '\n' : '\n\n')
    output += block(node, tag, options)
  }
  flush('\n')
  return output
}

function block(element: Element, tag: string, options: Options): string {
  if (/^H[1-6]$/.test(tag)) return `\n${'#'.repeat(Number(tag[1]))} ${inlineChildren(element, options).trim()}\n\n`
  if (tag === 'HR') return '\n---\n\n'
  if (tag === 'PRE') return `\n\`\`\`\n${(element.textContent ?? '').replace(/\n$/, '')}\n\`\`\`\n\n`
  if (tag === 'BLOCKQUOTE') return `\n${blocks(element, options).trim().split('\n').map((text) => `> ${text}`).join('\n')}\n\n`
  if (tag === 'UL' || tag === 'OL') return `\n${list(element, tag === 'OL', 0, options)}\n`
  if (tag === 'TABLE') return `\n${table(element, options)}\n\n`
  if (tag === 'P') return `${blocks(element, options).trim()}\n\n`
  return blocks(element, options)
}

function list(element: Element, ordered: boolean, depth: number, options: Options): string {
  let output = ''
  let number = 1
  for (const item of Array.from(element.children)) {
    if (item.tagName.toUpperCase() !== 'LI') continue
    const nested = Array.from(item.children).filter((child) => /^(UL|OL)$/i.test(child.tagName))
    const clone = item.cloneNode(true) as Element
    for (const child of Array.from(clone.children)) if (/^(UL|OL)$/i.test(child.tagName)) child.remove()
    // Checklists: Evernote's <en-todo checked="true"/> or an <input type="checkbox">.
    const box = clone.querySelector('en-todo, input[type="checkbox"]')
    const checked = box ? (box.getAttribute('checked') === 'true' || box.hasAttribute('checked') && box.getAttribute('checked') !== 'false') : undefined
    box?.remove()
    const marker = ordered ? `${number++}.` : '-'
    const text = blocks(clone, options).trim().replace(/\n+/g, ' ')
    output += `${'  '.repeat(depth)}${marker} ${checked === undefined ? '' : checked ? '[x] ' : '[ ] '}${text}\n`
    for (const child of nested) output += list(child, /^OL$/i.test(child.tagName), depth + 1, options)
  }
  return output
}

function table(element: Element, options: Options): string {
  const rows = Array.from(element.querySelectorAll('tr')).map((row) =>
    Array.from(row.children).map((cell) => inlineChildren(cell, options).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')))
  if (!rows.length) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

const inlineChildren = (element: Element, options: Options) =>
  Array.from(element.childNodes).map((node) => (node instanceof Element ? inline(node, options) : escapeText((node.textContent ?? '').replace(/\s+/g, ' ')))).join('')

function inline(element: Element, options: Options): string {
  const tag = element.tagName.toUpperCase()
  const inner = () => inlineChildren(element, options)
  const wrap = (mark: string) => {
    const text = inner()
    const trimmed = text.trim()
    return trimmed ? text.replace(trimmed, `${mark}${trimmed}${mark}`) : text
  }
  switch (tag) {
    case 'BR': return '\n'
    // Google Docs wraps everything it copies in <b style="font-weight:normal">.
    case 'B': case 'STRONG': return /font-weight\s*:\s*(normal|[1-4]00)\b/i.test(element.getAttribute('style') ?? '') ? inner() : wrap('**')
    case 'I': case 'EM': return wrap('*')
    case 'S': case 'STRIKE': case 'DEL': return wrap('~~')
    case 'CODE': return `\`${element.textContent ?? ''}\``
    case 'A': {
      const href = element.getAttribute('href') ?? ''
      const text = inner().trim()
      return href && /^(https?:|mailto:)/i.test(href) ? `[${text || href}](${href})` : text
    }
    case 'IMG': {
      const src = element.getAttribute('src') ?? ''
      if (/^https?:/i.test(src)) return `![${element.getAttribute('alt') ?? ''}](${src})`
      const name = options?.attachmentName?.(element) ?? element.getAttribute('alt') ?? src.split('/').pop()
      return name ? `*(attachment: ${name})*` : ''
    }
    case 'EN-MEDIA': {
      const name = options?.attachmentName?.(element)
      return `*(attachment${name ? `: ${name}` : ''})*`
    }
    case 'EN-TODO': case 'INPUT':
      return element.getAttribute('type') && element.getAttribute('type') !== 'checkbox' ? '' : element.getAttribute('checked') === 'true' || (tag === 'INPUT' && element.hasAttribute('checked')) ? '[x] ' : '[ ] '
    case 'SCRIPT': case 'STYLE': case 'HEAD': case 'TITLE': return ''
    default: {
      // Word and Google Docs mark bold and italic with styles on <span>s.
      const style = element.getAttribute('style') ?? ''
      const bold = /font-weight\s*:\s*(bold|[6-9]00)\b/i.test(style)
      const italic = /font-style\s*:\s*italic/i.test(style)
      return bold && italic ? wrap('***') : bold ? wrap('**') : italic ? wrap('*') : inner()
    }
  }
}
