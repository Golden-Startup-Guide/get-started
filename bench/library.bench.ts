import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { seedLibrary } from './seedLibrary'
import { measureTyping, measureTypingFloor } from './typingLatency'

// Targets from docs/ARCHITECTURE_VISION.md, section 3E. Results are reported against them,
// not enforced: these runs establish baselines. Set BENCH_ENFORCE=1 to fail on a miss.
// The typing target applies to main-thread work per keystroke (see bench/typingLatency.ts).
const TARGETS = { coldStartMs: 1000, openNoteMs: 50, searchMs: 50, typingWorkP95Ms: 16 }
const sizes = (process.env.BENCH_SIZES ?? '1000,10000,100000').split(',').map((value) => Number(value.trim())).filter(Boolean)
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
    // Counts are shown with thousands separators (10,000 notes).
    `${count.toLocaleString('en-US')} ${count === 1 ? 'note' : 'notes'}`,
    { polling: 'raf', timeout: 10 * 60_000 },
  )
}

for (const size of sizes) {
  test(`library with ${size.toLocaleString('en-US')} notes`, async ({ page, browser }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
    // Wait for the first load (a new library has starter notes); seeding replaces every note.
    await expect(page.locator('#note-count')).toHaveText(/^[\d,]+ notes?$/)

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

    // Typing in the 1 MB note: main-thread work per keystroke (the target), plus the time until
    // the next frame and the same measurements on a bare <input> for comparison.
    await search.fill(library.largeNoteTitle)
    await waitForCount(page, 1)
    started = await now(page)
    await page.getByRole('button', { name: `Open note ${library.largeNoteTitle}` }).click()
    const editor = page.getByRole('textbox', { name: 'Note text' })
    await expect(editor).toBeVisible()
    const openLargeNoteMs = (await now(page)) - started
    await editor.click()
    await editor.press('End')
    // Let opening finish (layout, the first preview) so it is not counted as typing. Long notes'
    // previews are parsed in a worker and rendered in the background after the editor appears,
    // so wait for the preview itself before the usual settling time.
    await expect(page.locator('.prose-notes p').first()).toBeAttached({ timeout: 120_000 })
    await page.waitForTimeout(1500)
    const typing = await measureTyping(page, browser)
    const floor = await measureTypingFloor(browser)

    const result = {
      size,
      library,
      seedMs,
      coldStartMs: round(coldStartMs),
      searchMs: round(searchMs),
      openNoteMs: round(openNoteMs),
      openLargeNoteMs: round(openLargeNoteMs),
      typingWorkP50Ms: round(percentile(typing.work, 0.5)),
      typingWorkP95Ms: round(percentile(typing.work, 0.95)),
      typingWorkMaxMs: round(Math.max(...typing.work)),
      typingToFrameP50Ms: round(percentile(typing.toFrame, 0.5)),
      typingToFrameP95Ms: round(percentile(typing.toFrame, 0.95)),
      floorWorkP95Ms: round(percentile(floor.work, 0.95)),
      floorToFrameP95Ms: round(percentile(floor.toFrame, 0.95)),
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
      typing: result.typingWorkP95Ms <= TARGETS.typingWorkP95Ms,
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
      'Typing work p95, 1 MB note (ms)': { value: result.typingWorkP95Ms, target: TARGETS.typingWorkP95Ms, met: checks.typing },
      'Typing to next frame p95 (ms)': { value: result.typingToFrameP95Ms, target: '-', met: '-' },
      'Bare input: work / to frame p95 (ms)': { value: `${result.floorWorkP95Ms} / ${result.floorToFrameP95Ms}`, target: '-', met: '-' },
      'JS heap (MB)': { value: result.heapMB, target: '-', met: '-' },
      'DOM nodes': { value: result.domNodes, target: '-', met: '-' },
    })

    if (enforce) expect(checks).toEqual({ coldStart: true, openNote: true, search: true, typing: true })
  })
}
