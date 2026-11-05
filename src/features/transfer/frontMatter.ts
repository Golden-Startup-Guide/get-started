/**
 * YAML front matter, the block between `---` lines at the top of a Markdown file that Obsidian
 * and other apps use for a note's details. Only the simple forms notes use are read: `key: value`,
 * `key: [a, b]`, and `key:` followed by `- item` lines.
 */
export type FrontMatter = Record<string, string | string[]>

const BLOCK = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

const unquote = (value: string) => {
  const trimmed = value.trim()
  if (/^(["']).*\1$/.test(trimmed)) return trimmed.slice(1, -1).replace(/\\"/g, '"')
  return trimmed
}

export function parseFrontMatter(text: string): { data: FrontMatter; body: string } {
  const match = BLOCK.exec(text)
  if (!match) return { data: {}, body: text }
  const data: FrontMatter = {}
  let listKey: string | undefined
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s*(.*)$/.exec(line) ?? (listKey ? /^-\s*(.*)$/.exec(line) : null)
    if (item && listKey) {
      ;(data[listKey] as string[]).push(unquote(item[1]))
      continue
    }
    const pair = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1].trim().toLowerCase()
    const value = pair[2].trim()
    if (!value) {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean)
      listKey = undefined
    } else {
      data[key] = unquote(value)
      listKey = undefined
    }
  }
  return { data, body: text.slice(match[0].length) }
}

/** A value as a list: lists as they are, "a, b" or "a b" strings split. */
export const listOf = (value: string | string[] | undefined): string[] =>
  Array.isArray(value) ? value : value ? value.split(/[,\s]+/).filter(Boolean) : []

const quote = (value: string) => (/^[\w .:/@()-]*$/.test(value) && value.trim() === value && value !== '' ? value : JSON.stringify(value))

export function serializeFrontMatter(data: Record<string, string | number | boolean | string[] | undefined>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || (Array.isArray(value) && !value.length)) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${quote(item)}`)
    } else lines.push(`${key}: ${typeof value === 'string' ? quote(value) : String(value)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

/** A time from front matter (ISO dates or Unix milliseconds); undefined if it is not one. */
export function parseTime(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const time = /^\d{12,}$/.test(value) ? Number(value) : Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}
