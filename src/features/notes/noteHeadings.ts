import type { Root } from 'hast'
import { textOf } from './markdownToHast'

export interface Heading {
  id: string
  text: string
  depth: number
}

/** Notes with at least this many headings get a table of contents. */
export const MIN_CONTENTS_HEADINGS = 3
/** Shown at once; a very long note keeps the rest out of the list rather than render thousands. */
export const MAX_CONTENTS_ITEMS = 300

/** The note's top-level headings, in order (headings inside quotes or lists are left out). */
export function collectHeadings(tree: Root): Heading[] {
  const headings: Heading[] = []
  for (const node of tree.children) {
    if (node.type !== 'element' || !/^h[1-6]$/.test(node.tagName)) continue
    const id = node.properties.id
    if (typeof id === 'string') headings.push({ id, text: textOf(node).trim(), depth: Number(node.tagName[1]) })
  }
  return headings
}
