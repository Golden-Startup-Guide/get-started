// Tasks may sit inside blockquotes ("> - [ ] task"); the quote markers are kept as prefix.
const taskMarker = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/
const fenceMarker = /^(?:\s*>)*\s{0,3}(`{3,}|~{3,})/

// Task syntax inside fenced code blocks is literal text, not a checkbox.
function taskLineMatches(markdown: string): Array<{ lineNumber: number; match: RegExpExecArray }> {
  const matches: Array<{ lineNumber: number; match: RegExpExecArray }> = []
  let openFence: string | null = null
  markdown.split(/\r?\n/).forEach((line, index) => {
    const fence = fenceMarker.exec(line)?.[1]
    if (fence) {
      if (openFence === null) openFence = fence
      else if (fence[0] === openFence[0] && fence.length >= openFence.length) openFence = null
      return
    }
    if (openFence !== null) return
    const match = taskMarker.exec(line)
    if (match) matches.push({ lineNumber: index + 1, match })
  })
  return matches
}

export function getChecklistTaskLines(markdown: string): number[] {
  return taskLineMatches(markdown).map(({ lineNumber }) => lineNumber)
}

export function getChecklistProgress(markdown: string): { completed: number; total: number } {
  const matches = taskLineMatches(markdown)
  return {
    completed: matches.filter(({ match }) => match[2].toLocaleLowerCase() === 'x').length,
    total: matches.length,
  }
}

export function getChecklistTaskText(markdown: string, lineNumber: number): string {
  const line = markdown.split(/\r?\n/)[lineNumber - 1] ?? ''
  const match = taskMarker.exec(line)
  return match ? line.slice(match[0].length).trim() : ''
}

export function toggleChecklistItem(markdown: string, lineNumber: number): string {
  const lines = markdown.split(/\r?\n/)
  const line = lines[lineNumber - 1]
  if (line === undefined) return markdown
  const match = taskMarker.exec(line)
  if (!match) return markdown
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n'
  const checked = match[2].toLocaleLowerCase() === 'x'
  lines[lineNumber - 1] = `${match[1]}${checked ? ' ' : 'x'}${match[3]}${line.slice(match[0].length)}`
  return lines.join(newline)
}
