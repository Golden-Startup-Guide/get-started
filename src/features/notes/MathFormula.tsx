import { useLayoutEffect, useRef, useState } from 'react'

type RenderMath = (tex: string, element: HTMLElement, displayMode: boolean) => void

let loading: Promise<RenderMath> | undefined

function loadMath(): Promise<RenderMath> {
  loading ??= import('./mathRenderer').then(
    (module) => module.renderMath,
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading
}

/**
 * Maths written as $$…$$ or in a ```math block. KaTeX (with its fonts) is downloaded the first
 * time a note shows maths; until then, or if it cannot load, the TeX source is shown as code.
 */
export function MathFormula({ tex, display }: { tex: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  // Which formula KaTeX last typeset, so an edited formula shows its source until it is redone.
  const [renderedKey, setRenderedKey] = useState<string>()
  const key = `${display ? 'display' : 'inline'}:${tex}`
  const rendered = renderedKey === key

  useLayoutEffect(() => {
    let active = true
    loadMath().then(
      (renderMath) => {
        if (!active || !ref.current) return
        renderMath(tex, ref.current, display)
        setRenderedKey(key)
      },
      () => undefined,
    )
    return () => { active = false }
  }, [tex, display, key])

  const Tag = display ? 'div' : 'span'
  return (
    <Tag className={display ? 'math math-display' : 'math math-inline'}>
      {/* KaTeX writes into this element itself, so React gives it no children of its own. */}
      <span ref={ref} hidden={!rendered} />
      {!rendered && <code>{tex}</code>}
    </Tag>
  )
}
