import type { Root } from 'hast'
import { urlAttributes } from 'html-url-attributes'
import { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { remarkWikilinks } from './remarkWikilinks'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
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
  visit(tree, (node, index, parent) => {
    if (node.type === 'raw' && parent && typeof index === 'number') {
      parent.children[index] = { type: 'text', value: node.value }
      return index
    }
    if (node.type !== 'element') return
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
