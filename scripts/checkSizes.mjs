// Fails the build when the app grows past its size budgets (run after `npm run build`):
//   - the install download (everything the service worker precaches), which every user pays,
//     counting the app and the built-in handbooks (content/) separately;
//   - the start-up script and styles, gzipped, which every visit waits for.
// Chunks loaded on demand (maths, diagrams, the graph, imports) are not limited: nobody pays
// for them until they use them. Raise a budget only on purpose, with the reason in the PR.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGETS = {
  installKiB: 1500,
  // Text compresses well and is cheap. Every handbook page has a picture, so pictures must stay
  // small: simple drawings (SVG) of a few kilobytes each.
  handbooksKiB: 600,
  startupScriptGzipKiB: 125,
  startupStylesGzipKiB: 15,
}

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const kib = (bytes) => bytes / 1024

// The precache list, as written into the service worker.
const serviceWorker = readFileSync(join(dist, 'sw.js'), 'utf8')
const precached = [...serviceWorker.matchAll(/url:"([^"]+)"/g)].map((match) => decodeURIComponent(match[1]))
const isHandbook = (file) => /^assets\/(?:core-[^/]+\.js|picture-[^/]+)$/.test(file)
const sizeOf = (files) => files.reduce((sum, file) => sum + statSync(join(dist, file)).size, 0)
const appFiles = precached.filter((file) => !isHandbook(file))
const handbookFiles = precached.filter(isHandbook)
const install = sizeOf(appFiles)

const assets = readdirSync(join(dist, 'assets'))
const entry = (extension) => {
  const file = assets.find((name) => name.startsWith('index-') && name.endsWith(extension))
  if (!file) throw new Error(`No start-up ${extension} file in dist/assets`)
  return gzipSync(readFileSync(join(dist, 'assets', file))).length
}

const rows = [
  ['Install download (precached)', kib(install), BUDGETS.installKiB, `${appFiles.length} files`],
  ['Built-in handbooks (precached)', kib(sizeOf(handbookFiles)), BUDGETS.handbooksKiB, `${handbookFiles.filter((file) => file.endsWith('.js')).length} libraries, ${handbookFiles.filter((file) => !file.endsWith('.js')).length} pictures`],
  ['Start-up script, gzipped', kib(entry('.js')), BUDGETS.startupScriptGzipKiB, ''],
  ['Start-up styles, gzipped', kib(entry('.css')), BUDGETS.startupStylesGzipKiB, ''],
]
let over = false
for (const [name, size, budget, note] of rows) {
  const ok = size <= budget
  over ||= !ok
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name}: ${size.toFixed(1)} KiB of ${budget} KiB${note ? ` (${note})` : ''}`)
}
if (over) {
  console.error('\nThe app is over a size budget (scripts/checkSizes.mjs). Load the new code on demand, or raise the budget on purpose.')
  process.exit(1)
}
