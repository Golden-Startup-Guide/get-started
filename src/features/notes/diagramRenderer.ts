import mermaid from 'mermaid'
import { t } from '../../i18n/i18n'

// Its own chunk (with Mermaid's own lazily loaded parts), loaded by DiagramBlock.tsx only when a
// note has a ```mermaid block.

let initializedFor: 'light' | 'dark' | undefined
let nextId = 0

/**
 * Draws a Mermaid diagram as SVG markup. securityLevel 'strict' keeps Mermaid from running click
 * handlers or rendering HTML labels, and sanitizes its output; errors are returned, not drawn
 * into the page.
 */
export async function renderDiagram(source: string, theme: 'light' | 'dark'): Promise<{ svg: string } | { error: string }> {
  if (initializedFor !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      suppressErrorRendering: true,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    })
    initializedFor = theme
  }
  try {
    const { svg } = await mermaid.render(`note-diagram-${++nextId}`, source)
    return { svg }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Mermaid's first line names the problem ("Parse error on line 3:"); the rest is a long,
    // technical list of what it expected.
    return { error: message.split('\n')[0].replace(/:\s*$/, '') || t('This diagram could not be drawn') }
  }
}
