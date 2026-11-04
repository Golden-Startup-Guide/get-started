/**
 * Headings as link targets: the anchor a heading gets in the preview, and finding headings in a
 * note's Markdown for [[Note#Heading]] links and their suggestions.
 */

/**
 * The anchor name for a heading's text: lower case, punctuation removed, spaces as hyphens
 * ("Seed list!" becomes "seed-list"). The preview's heading IDs are "heading-" plus this, numbered
 * from the second heading with the same text.
 */
export function headingSlug(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'section'
}

export interface MarkdownHeading {
  text: string
  /** 1-based line number in the Markdown. */
  line: number
  depth: number
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const ATX_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/

/** The note's "# Heading" lines, in order, skipping fenced code. */
export function listHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  let fence: string | null = null
  markdown.split(/\r?\n/).forEach((line, index) => {
    const marker = FENCE.exec(line)?.[1]
    if (marker) {
      if (fence === null) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return
    }
    if (fence !== null) return
    const match = ATX_HEADING.exec(line)
    if (match && match[2].trim()) headings.push({ text: match[2].trim(), line: index + 1, depth: match[1].length })
  })
  return headings
}

/** The first heading a link's "#section" names, matched by its anchor (so case and punctuation do not matter). */
export function findHeading(markdown: string, section: string): MarkdownHeading | undefined {
  const wanted = headingSlug(section)
  return listHeadings(markdown).find((heading) => headingSlug(heading.text) === wanted)
}

/** The "#section" part of a link target, if any ("Note#Seeds" gives "Seeds"). */
export function sectionOf(target: string): string | undefined {
  const hash = target.indexOf('#')
  const section = hash < 0 ? '' : target.slice(hash + 1).trim()
  return section || undefined
}

/**
 * The part of the note under a section's heading: the heading line and everything after it, up to
 * the next heading of the same or a higher level. Undefined when the note has no such heading.
 */
export function extractSection(markdown: string, section: string): string | undefined {
  const headings = listHeadings(markdown)
  const index = headings.findIndex((heading) => headingSlug(heading.text) === headingSlug(section))
  if (index < 0) return undefined
  const start = headings[index]
  const end = headings.slice(index + 1).find((heading) => heading.depth <= start.depth)
  const lines = markdown.split(/\r?\n/)
  return lines.slice(start.line - 1, end ? end.line - 1 : lines.length).join('\n').trimEnd()
}
