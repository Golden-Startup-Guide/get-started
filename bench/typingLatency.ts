import type { Browser, Page } from '@playwright/test'

/** Keystrokes per measurement: enough that p95 is not just the second-slowest key. */
export const TYPING_KEYS = 60
export const TYPING_DELAY_MS = 40

export interface TraceEvent {
  name: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: { data?: { type?: string } }
}

/**
 * Main-thread work caused by each keystroke, in milliseconds, from a Chromium performance trace:
 * the time the page's main thread spends running tasks (scripts, style, layout, paint) from one
 * keydown until the next. Idle time waiting for the next display frame is not counted, so a
 * bare <input> measures a few milliseconds rather than up to one frame (16.7 ms).
 */
export function workPerKeystroke(events: TraceEvent[], intervalMs = TYPING_DELAY_MS): number[] {
  const keydowns = events
    .filter((event) => event.name === 'EventDispatch' && event.args?.data?.type === 'keydown')
    .sort((a, b) => a.ts - b.ts)
  if (!keydowns.length) return []
  const { pid, tid } = keydowns[0]
  const tasks = events.filter((event) =>
    event.ph === 'X' && event.name === 'ThreadControllerImpl::RunTask' && event.pid === pid && event.tid === tid,
  )
  return keydowns.map((key, index) => {
    const windowEnd = keydowns[index + 1]?.ts ?? key.ts + intervalMs * 1000
    let busy = 0
    for (const task of tasks) {
      const start = Math.max(task.ts, key.ts)
      const end = Math.min(task.ts + (task.dur ?? 0), windowEnd)
      if (end > start) busy += end - start
    }
    return busy / 1000
  })
}

/**
 * Types into whatever has focus and returns, per keystroke, both the main-thread work (the
 * target metric) and the time until the frame after the key rendered (includes waiting for
 * the display's next frame, so it cannot go below about 16 ms wherever frames are vsync-aligned).
 */
export async function measureTyping(page: Page, browser: Browser): Promise<{ work: number[]; toFrame: number[] }> {
  await page.evaluate(() => {
    const samples: number[] = []
    ;(window as Window & { __typingSamples?: number[] }).__typingSamples = samples
    document.addEventListener('keydown', (event) => {
      const start = event.timeStamp
      requestAnimationFrame(() => setTimeout(() => samples.push(performance.now() - start), 0))
    }, true)
  })
  await browser.startTracing(page, { categories: ['toplevel', 'devtools.timeline'] })
  await page.keyboard.type('the quick brown fox jumps over the lazy dog '.repeat(2).slice(0, TYPING_KEYS), { delay: TYPING_DELAY_MS })
  await page.waitForFunction(
    (keys) => ((window as Window & { __typingSamples?: number[] }).__typingSamples?.length ?? 0) >= keys,
    TYPING_KEYS,
  )
  const trace = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: TraceEvent[] }
  const toFrame = await page.evaluate(() => (window as Window & { __typingSamples?: number[] }).__typingSamples ?? [])
  return { work: workPerKeystroke(trace.traceEvents), toFrame }
}

/** The same measurement on a page holding only an <input>: what the browser costs by itself. */
export async function measureTypingFloor(browser: Browser): Promise<{ work: number[]; toFrame: number[] }> {
  const page = await browser.newPage()
  try {
    await page.setContent('<input id="floor" aria-label="Floor">')
    await page.click('#floor')
    return await measureTyping(page, browser)
  } finally {
    await page.close()
  }
}
