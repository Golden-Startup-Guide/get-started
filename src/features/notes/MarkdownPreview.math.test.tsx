import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview'

describe('MarkdownPreview maths', () => {
  afterEach(cleanup)

  it('typesets $$…$$ inside a line and as a block, and ```math blocks', async () => {
    const { container } = render(<MarkdownPreview markdown={'Area is $$\\pi r^2$$ here.\n\n$$\nE = mc^2\n$$\n\n```math\n\\frac{a}{b}\n```'} />)
    // Before KaTeX loads, the TeX source shows as code.
    expect(container.querySelector('.math-inline code')?.textContent).toBe('\\pi r^2')
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(3))
    expect(container.querySelector('.math-inline .katex-display')).toBeNull()
    expect(container.querySelectorAll('.math-display .katex-display')).toHaveLength(2)
    // MathML for screen readers, carrying the original TeX.
    expect(container.querySelector('.math-inline annotation')?.textContent).toBe('\\pi r^2')
    expect(container.querySelector('pre')).toBeNull()
    expect(screen.getByText(/Area is/)).toBeInTheDocument()
  })

  it('leaves prices, single dollar signs, and $$ in inline code alone', () => {
    const { container } = render(<MarkdownPreview markdown={'Seeds cost $5 and compost $10. Code: `$$x$$`'} />)
    expect(container.querySelector('.math')).toBeNull()
    expect(container.textContent).toBe('Seeds cost $5 and compost $10. Code: $$x$$')
  })

  it('shows mistakes as an error rather than failing, and refuses links and HTML in TeX', async () => {
    const { container } = render(<MarkdownPreview markdown={'$$\\frac{1}{$$ and $$\\href{javascript:alert(1)}{x}$$'} />)
    await waitFor(() => expect(container.querySelectorAll('.math-inline .katex, .math-inline .katex-error')).toHaveLength(2))
    // \href is refused (shown in red as an untrusted command); its text survives only as the
    // formula's source in the MathML annotation, never as a link.
    expect(container.querySelector('a, [href]')).toBeNull()
    expect(container.querySelector('annotation')?.textContent).toBe('\\href{javascript:alert(1)}{x}')
  })
})
