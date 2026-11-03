import katex from 'katex'
import 'katex/dist/katex.min.css'

// Its own chunk, with KaTeX's styles and fonts, loaded by mathFormula.ts only when a note has maths.

/**
 * Typesets TeX into the element. Untrusted commands (\href, \url, \includegraphics, \html…) are
 * refused (KaTeX's `trust: false`), and mistakes show as an error message rather than throwing.
 * The output includes MathML, which screen readers read aloud.
 */
export function renderMath(tex: string, element: HTMLElement, displayMode: boolean) {
  katex.render(tex, element, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
    maxSize: 50,
    maxExpand: 1000,
  })
}
