/// <reference lib="webworker" />
import { markdownToHast } from './markdownToHast'

// Parses long notes' Markdown off the main thread, so typing never waits for the preview.
self.onmessage = (event: MessageEvent<{ id: number; markdown: string }>) => {
  const { id, markdown } = event.data
  try {
    self.postMessage({ id, tree: markdownToHast(markdown) })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
