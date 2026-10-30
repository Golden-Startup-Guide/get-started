const taskMarker = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/

export function getChecklistTaskLines(markdown: string): number[] {
  const taskLines: number[] = []
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (taskMarker.test(line)) taskLines.push(index + 1)
  })
  return taskLines
}

export function getChecklistProgress(markdown: string): { completed: number; total: number } {
  let completed = 0
  let total = 0
  for (const line of markdown.split(/\r?\n/)) {
    const match = taskMarker.exec(line)
    if (!match) continue
    total += 1
    if (match[2].toLocaleLowerCase() === 'x') completed += 1
  }
  return { completed, total }
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
