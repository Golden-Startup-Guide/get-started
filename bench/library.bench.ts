import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { seedLibrary } from './seedLibrary'

// Targets from docs/ARCHITECTURE_VISION.md, section 3E. Results are reported against them,
// not enforced: these runs establish baselines. Set BENCH_ENFORCE=1 to fail on a miss.
const TARGETS = { coldStartMs: 1000, openNoteMs: 50, searchMs: 50, typingP95Ms: 16 }
// 100,000 is left out by default until the editor's quadratic link labels are fixed: at that
// size a single "open a note" would take hours (see docs/PERFORMANCE.md).
const sizes = (process.env.BENCH_SIZES ?? '1000,10000').split(',').map((value) => Number(value.trim())).filter(Boolean)
const enforce = process.env.BENCH_ENFORCE === '1'

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] : 0
}

const now = (page: Page) => page.evaluate(() => performance.now())
const round = (value: number) => Math.round(value * 10) / 10

/** Waits for the note count to read exactly "N note(s)", checking every animation frame. */
async function waitForCount(page: Page, count: number) {
  await page.waitForFunction(
    (expected) => document.getElementById('note-count')?.textContent?.trim() === expected,
    `${count} ${count === 1 ? 'note' : 'notes'}`,
    { polling: 'raf', timeout: 10 * 60_000 },
  )
}

for (const size of sizes) {
  test(`library with ${size.toLocaleString('en-US')} notes`, async ({ page, browser }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
    await waitForCount(page, 0)

    const seedStarted = Date.now()
    const library = await page.evaluate(seedLibrary, { notes: size, largeNoteBytes: 1_000_000 })
    const seedMs = Date.now() - seedStarted

    // Cold start: a fresh page load until the full note list has rendered. performance.now()
    // counts from the start of navigation.
    await page.reload()
    await waitForCount(page, library.notes)
    const coldStartMs = await now(page)
    const heapBytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)
    const domNodes = await page.evaluate(() => document.getElementsByTagName('*').length)

    // Search: type a term planted in a known number of notes, until the count updates.
    const search = page.getByRole('searchbox', { name: /Search notes/ })
    let started = await now(page)
    await search.fill(library.searchTerm)
    await waitForCount(page, library.searchMatches)
    const searchMs = (await now(page)) - started
    await search.fill('')
    await waitForCount(page, library.notes)

    // Open note: from clicking a card until the editor shows the note's title field.
    started = await now(page)
    await page.getByRole('button', { name: /^Open note / }).first().click()
    await expect(page.getByRole('textbox', { name: 'Note title' })).toBeVisible()
    const openNoteMs = (await now(page)) - started
    await page.getByRole('button', { name: 'Close editor' }).first().click()
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveCount(0)

    // Typing: in the 1 MB note, time from each keydown until the frame after it renders.
    await search.fill(library.largeNoteTitle)
    await waitForCount(page, 1)
    started = await now(page)
    await page.getByRole('button', { name: `Open note ${library.largeNoteTitle}` }).click()
    const editor = page.getByRole('textbox', { name: 'Markdown' })
    await expect(editor).toBeVisible()
    const openLargeNoteMs = (await now(page)) - started
    await editor.click()
    await editor.press('End')
    await page.evaluate(() => {
      const samples: number[] = []
      ;(window as Window & { __typingSamples?: number[] }).__typingSamples = samples
      document.addEventListener('keydown', (event) => {
        const start = event.timeStamp
        requestAnimationFrame(() => setTimeout(() => samples.push(performance.now() - start), 0))
      }, true)
    })
    await page.keyboard.type(' benchmark typing sample', { delay: 40 })
    await page.waitForFunction(() => ((window as Window & { __typingSamples?: number[] }).__typingSamples?.length ?? 0) >= 24)
    const typing = await page.evaluate(() => (window as Window & { __typingSamples?: number[] }).__typingSamples ?? [])

    const result = {
      size,
      library,
      seedMs,
      coldStartMs: round(coldStartMs),
      searchMs: round(searchMs),
      openNoteMs: round(openNoteMs),
      openLargeNoteMs: round(openLargeNoteMs),
      typingP50Ms: round(percentile(typing, 0.5)),
      typingP95Ms: round(percentile(typing, 0.95)),
      typingMaxMs: round(Math.max(...typing)),
      heapMB: round(heapBytes / 1024 / 1024),
      domNodes,
      // Not navigator.userAgent: Playwright's device profile reports Windows on every OS.
      environment: `${process.platform} ${process.arch}, ${process.env.CI ? 'CI' : 'local'}, Chromium ${browser.version()}`,
      measuredAt: new Date().toISOString(),
    }
    const checks = {
      coldStart: result.coldStartMs <= TARGETS.coldStartMs,
      openNote: result.openNoteMs <= TARGETS.openNoteMs,
      search: result.searchMs <= TARGETS.searchMs,
      typing: result.typingP95Ms <= TARGETS.typingP95Ms,
    }

    mkdirSync('bench/results', { recursive: true })
    writeFileSync(`bench/results/library-${size}.json`, JSON.stringify({ ...result, targets: TARGETS, checks }, null, 2))
    await testInfo.attach(`library-${size}.json`, { body: JSON.stringify({ ...result, targets: TARGETS, checks }, null, 2), contentType: 'application/json' })
    console.log(`\n${size.toLocaleString('en-US')} notes`)
    console.table({
      'Cold start (ms)': { value: result.coldStartMs, target: TARGETS.coldStartMs, met: checks.coldStart },
      'Search (ms)': { value: result.searchMs, target: TARGETS.searchMs, met: checks.search },
      'Open note (ms)': { value: result.openNoteMs, target: TARGETS.openNoteMs, met: checks.openNote },
      'Open 1 MB note (ms)': { value: result.openLargeNoteMs, target: '-', met: '-' },
      'Typing p95, 1 MB note (ms)': { value: result.typingP95Ms, target: TARGETS.typingP95Ms, met: checks.typing },
      'JS heap (MB)': { value: result.heapMB, target: '-', met: '-' },
      'DOM nodes': { value: result.domNodes, target: '-', met: '-' },
    })

    if (enforce) expect(checks).toEqual({ coldStart: true, openNote: true, search: true, typing: true })
  })
}
