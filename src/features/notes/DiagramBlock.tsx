import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n/i18n'

type RenderDiagram = (source: string, theme: 'light' | 'dark') => Promise<{ svg: string } | { error: string }>

let loading: Promise<RenderDiagram> | undefined

function loadDiagrams(): Promise<RenderDiagram> {
  loading ??= import('./diagramRenderer').then(
    (module) => module.renderDiagram,
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading
}

/** Follows the app's light or dark theme, which is set on the .workspace element. */
function useWorkspaceTheme(element: React.RefObject<HTMLElement | null>): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const workspace = element.current?.closest<HTMLElement>('.workspace')
    if (!workspace) return
    const read = () => setTheme(workspace.dataset.theme === 'dark' ? 'dark' : 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(workspace, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [element])
  return theme
}

type Result = { key: string } & ({ svg: string } | { error: string })

/**
 * A ```mermaid block, drawn as a diagram. Mermaid is a large download, so it is fetched the first
 * time a note has a diagram; until it has drawn one (or if it cannot load), the source is shown.
 */
export function DiagramBlock({ source }: { source: string }) {
  const ref = useRef<HTMLElement>(null)
  const theme = useWorkspaceTheme(ref)
  const key = `${theme}:${source}`
  const [result, setResult] = useState<Result>()

  useEffect(() => {
    let active = true
    loadDiagrams()
      .then((render) => render(source, theme))
      .then(
        (drawn) => { if (active) setResult({ key, ...drawn }) },
        () => undefined,
      )
    return () => { active = false }
  }, [source, theme, key])

  // Keep the last drawing while an edited diagram is redrawn, rather than flashing its source.
  const current = result && (result.key === key || 'svg' in result) ? result : undefined
  return (
    <figure ref={ref} className="diagram">
      {current && 'svg' in current ? (
        // Mermaid's own SVG output, drawn with securityLevel 'strict' and sanitized by Mermaid.
        <div className="diagram-drawing" dangerouslySetInnerHTML={{ __html: current.svg }} />
      ) : (
        <pre className="diagram-source"><code>{source}</code></pre>
      )}
      {current && 'error' in current && <figcaption className="diagram-error" role="note">{t("Diagram error:")} {current.error}</figcaption>}
    </figure>
  )
}
