import type { Root } from 'hast'
import { common, createLowlight } from 'lowlight'

// Its own chunk (loaded by codeHighlight.ts only when a note has a code block with a language).
const lowlight = createLowlight(common)

export function highlight(code: string, language: string): Root | undefined {
  return lowlight.registered(language) ? lowlight.highlight(language, code) : undefined
}
