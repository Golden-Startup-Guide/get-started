// Prints the benchmark results in bench/results/ as a Markdown table, for CI job summaries
// and docs/PERFORMANCE.md. Usage: node bench/report.mjs
import { readdirSync, readFileSync } from 'node:fs'

const dir = 'bench/results'
let files = []
try {
  files = readdirSync(dir).filter((name) => /^library-\d+\.json$/.test(name))
} catch {
  console.log('No benchmark results found in bench/results.')
  process.exit(0)
}
const results = files
  .map((name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')))
  .sort((a, b) => a.size - b.size)

const mark = (met) => (met ? '✅' : '❌')
const rows = [
  ['Cold start', 'coldStartMs', 'coldStart'],
  ['Search', 'searchMs', 'search'],
  ['Open a note', 'openNoteMs', 'openNote'],
  ['Open the 1 MB note', 'openLargeNoteMs', null],
  ['Typing work p95, 1 MB note', 'typingWorkP95Ms', 'typing'],
  ['Typing work p50, 1 MB note', 'typingWorkP50Ms', null],
  ['Typing to next frame p95', 'typingToFrameP95Ms', null],
  ['Bare input: typing work p95', 'floorWorkP95Ms', null],
  ['Bare input: to next frame p95', 'floorToFrameP95Ms', null],
]
const targets = results[0]?.targets ?? {}
const targetFor = { coldStartMs: targets.coldStartMs, searchMs: targets.searchMs, openNoteMs: targets.openNoteMs, typingWorkP95Ms: targets.typingWorkP95Ms }

const header = ['Measure', 'Target', ...results.map((result) => `${result.size.toLocaleString('en-US')} notes`)]
const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`]
for (const [label, key, check] of rows) {
  const target = targetFor[key] ? `≤ ${targetFor[key]} ms` : '-'
  const cells = results.map((result) => `${result[key]} ms${check ? ` ${mark(result.checks[check])}` : ''}`)
  lines.push(`| ${label} | ${target} | ${cells.join(' | ')} |`)
}
lines.push(`| JS heap | - | ${results.map((result) => `${result.heapMB} MB`).join(' | ')} |`)
lines.push(`| DOM nodes | - | ${results.map((result) => result.domNodes.toLocaleString('en-US')).join(' | ')} |`)
console.log(lines.join('\n'))
console.log(`\nMeasured on: ${results[0]?.environment ?? 'unknown'}`)
