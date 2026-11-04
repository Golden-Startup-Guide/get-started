import type { Link, Nodes, Parent, Root, Text } from 'mdast'
import { sectionOf } from '../../lib/headings'
import { targetTitle, WIKILINK_PATTERN } from '../../lib/wikilinks'

/** How a link without shown text reads: "Note", "Note › Section", or "Section" within this note. */
function defaultLabel(target: string): string {
  const title = targetTitle(target).trim()
  const section = sectionOf(target)
  if (!section) return title
  return title ? `${title} › ${section}` : section
}

/**
 * Turns `[[Title]]` and `[[Title|shown text]]` in Markdown text into link nodes carrying the
 * target title as `data-wikilink`, which MarkdownPreview renders as an in-app link. Code is
 * never touched: inline code and code blocks are separate node types, not text.
 */
export function remarkWikilinks() {
  return (tree: Root) => visit(tree)
}

function visit(node: Nodes) {
  if (!('children' in node) || node.type === 'link' || node.type === 'linkReference') return
  const parent = node as Parent
  const children: Parent['children'] = []
  for (const child of parent.children) {
    if (child.type === 'text' && child.value.includes('[[')) children.push(...split(child))
    else {
      visit(child as Nodes)
      children.push(child)
    }
  }
  parent.children = children
}

function split(node: Text): Array<Text | Link> {
  const parts: Array<Text | Link> = []
  let last = 0
  for (const match of node.value.matchAll(WIKILINK_PATTERN)) {
    const target = match[1].trim()
    if (!target) continue
    if (match.index > last) parts.push({ type: 'text', value: node.value.slice(last, match.index) })
    parts.push({
      type: 'link',
      url: '#',
      children: [{ type: 'text', value: match[2]?.trim() || defaultLabel(target) }],
      data: { hProperties: { dataWikilink: target } },
    })
    last = match.index + match[0].length
  }
  if (last === 0) return [node]
  if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) })
  return parts
}
