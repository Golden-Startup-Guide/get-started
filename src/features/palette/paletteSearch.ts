export type PaletteGroup = 'Actions' | 'Places' | 'Notes'

export interface PaletteItem {
  id: string
  group: PaletteGroup
  label: string
  /** Shown after the label, e.g. a note's notebook or a shelf's library. */
  detail?: string
  /** Extra words that should find this item, e.g. "dark" for the theme action. */
  keywords?: string
  /** Runs over an open note without closing it (a theme change). Everything else saves and closes it first. */
  keepsEditor?: boolean
  run: () => void
}

export const MAX_PALETTE_RESULTS = 50
const GROUP_ORDER: PaletteGroup[] = ['Actions', 'Places', 'Notes']

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

/**
 * How well the item matches, lower is better, or undefined if it does not. Every word of the
 * query must appear in the label or keywords; the first word decides the rank:
 * 0 the label is the query, 1 the label starts with it, 2 a word in the label starts with it,
 * 3 it appears elsewhere.
 */
export function scoreItem(item: PaletteItem, query: string): number | undefined {
  const label = normalize(item.label)
  const haystack = item.keywords ? `${label} ${normalize(item.keywords)}` : label
  const words = query.split(' ')
  if (!words.every((word) => haystack.includes(word))) return undefined
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  const first = words[0]
  if (label.startsWith(first) || label.includes(` ${first}`) || haystack.includes(` ${first}`)) return 2
  return 3
}

/**
 * The items to show for a query, best first, at most MAX_PALETTE_RESULTS. With no query, every
 * action and place comes first, then `recent` (the newest notes), in the given order.
 */
export function searchPalette(items: readonly PaletteItem[], rawQuery: string, recent: readonly PaletteItem[] = []): PaletteItem[] {
  const query = normalize(rawQuery)
  if (!query) {
    return [...items.filter((item) => item.group === 'Actions'), ...recent].slice(0, MAX_PALETTE_RESULTS)
  }
  const scored: Array<{ item: PaletteItem; score: number; index: number }> = []
  items.forEach((item, index) => {
    const score = scoreItem(item, query)
    if (score !== undefined) scored.push({ item, score, index })
  })
  scored.sort((a, b) =>
    a.score - b.score
    || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group)
    || a.index - b.index)
  return scored.slice(0, MAX_PALETTE_RESULTS).map(({ item }) => item)
}
