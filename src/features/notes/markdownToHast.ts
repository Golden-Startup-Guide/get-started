import type { Nodes, Root } from 'hast'
import { urlAttributes } from 'html-url-attributes'
import { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { remarkWikilinks } from './remarkWikilinks'

/** The text inside a hast node, as the browser's textContent would give it. */
export function textOf(node: Nodes): string {
  if (node.type === 'text') return node.value
  return 'children' in node ? node.children.map(textOf).join('') : ''
}

/**
 * A heading's anchor: "heading-" plus its text in lower case with spaces as hyphens, numbered
 * when a note repeats a heading ("heading-notes", "heading-notes-1"). The prefix keeps it from
 * clashing with the app's own element IDs.
 */
function headingId(text: string, used: Map<string, number>): string {
  const slug = text.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'section'
  const count = used.get(slug) ?? 0
  used.set(slug, count + 1)
  return `heading-${count ? `${slug}-${count}` : slug}`
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // Maths only as $$…$$ (inline or as a block) or ```math: single $ signs stay text, so prices
  // such as "$5 and $10" are never turned into formulas.
  .use(remarkMath, { singleDollarTextMath: false })
  .use(remarkWikilinks)
  // Raw HTML is kept as "raw" nodes only so it can be shown as text below; it never renders.
  .use(remarkRehype, { allowDangerousHtml: true })

/**
 * Parses a note's Markdown into an HTML syntax tree (hast) for the preview.
 *
 * The same steps as react-markdown, which the preview used before, so output and safety are
 * unchanged: raw HTML becomes plain text, and every URL attribute (href, src, …) goes through
 * react-markdown's defaultUrlTransform, which blanks javascript: and other unsafe protocols.
 *
 * It has no DOM or React dependency, so long notes can be parsed in a Web Worker
 * (markdownPreview.worker.ts) and short ones on the main thread, with identical results.
 */
export function markdownToHast(markdown: string): Root {
  const tree = processor.runSync(processor.parse(markdown)) as Root
  const usedIds = new Map<string, number>()
  visit(tree, (node, index, parent) => {
    if (node.type === 'raw' && parent && typeof index === 'number') {
      parent.children[index] = { type: 'text', value: node.value }
      return index
    }
    if (node.type !== 'element') return
    if (/^h[1-6]$/.test(node.tagName)) node.properties.id = headingId(textOf(node), usedIds)
    for (const key in urlAttributes) {
      if (!Object.hasOwn(node.properties, key)) continue
      const tags = urlAttributes[key]
      if (tags === null || tags.includes(node.tagName)) {
        node.properties[key] = defaultUrlTransform(String(node.properties[key] || ''))
      }
    }
  })
  return tree
}
