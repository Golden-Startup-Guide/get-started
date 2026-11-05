import type { Root } from 'hast'
import { startTransition, useEffect, useState } from 'react'
import { markdownToHast } from './markdownToHast'
import { t } from '../../i18n/i18n'

export interface ParsedPreview {
  tree: Root
  /** The Markdown the tree was parsed from (checkbox line numbers refer to it). */
  source: string
}

let worker: Worker | undefined
let busyWith: number | undefined
let nextId = 0
const waiting = new Map<number, (result: { tree?: Root; error?: string }) => void>()

function startWorker(): Worker {
  const created = new Worker(new URL('./markdownPreview.worker.ts', import.meta.url), { type: 'module' })
  created.onmessage = (event: MessageEvent<{ id: number; tree?: Root; error?: string }>) => {
    if (event.data.id === busyWith) busyWith = undefined
    waiting.get(event.data.id)?.(event.data)
    waiting.delete(event.data.id)
  }
  created.onerror = () => {
    // A worker that failed to start or crashed: answer everything still waiting with an error.
    for (const [, reply] of waiting) reply({ error: t('The preview worker stopped.') })
    waiting.clear()
    busyWith = undefined
    worker = undefined
  }
  return created
}

/** Parses in the worker. Starting a new parse abandons any parse still running, which is stale. */
function parseInWorker(markdown: string): { promise: Promise<Root>; cancel: () => void } {
  if (worker && busyWith !== undefined) {
    // Parsing a large note can take seconds; a parse of older text is not worth finishing.
    worker.terminate()
    worker = undefined
    for (const [, reply] of waiting) reply({})
    waiting.clear()
  }
  worker ??= startWorker()
  const id = ++nextId
  busyWith = id
  const promise = new Promise<Root>((resolve, reject) => {
    waiting.set(id, ({ tree, error }) => {
      if (tree) resolve(tree)
      else reject(new Error(error ?? 'cancelled'))
    })
  })
  worker.postMessage({ id, markdown })
  return { promise, cancel: () => waiting.delete(id) }
}

/**
 * The preview's parsed Markdown for a long note, parsed in a Web Worker so the main thread stays
 * free for typing. React renders the result as a transition, so even a very large preview is
 * rendered in small slices that keystrokes can interrupt.
 *
 * Returns undefined until the first parse finishes. Without Worker support (or if the worker
 * fails), it parses on the main thread instead.
 */
export function useMarkdownTree(markdown: string, enabled: boolean): ParsedPreview | undefined {
  const [parsed, setParsed] = useState<ParsedPreview>()

  useEffect(() => {
    if (!enabled) return
    let active = true
    const show = (tree: Root) => {
      if (active) startTransition(() => setParsed({ tree, source: markdown }))
    }
    const parseHere = () => show(markdownToHast(markdown))
    if (typeof Worker === 'undefined') {
      parseHere()
      return () => { active = false }
    }
    const { promise, cancel } = parseInWorker(markdown)
    promise.then(show, (error: Error) => {
      if (active && error.message !== 'cancelled') parseHere()
    })
    return () => {
      active = false
      cancel()
    }
  }, [markdown, enabled])

  return enabled ? parsed : undefined
}
