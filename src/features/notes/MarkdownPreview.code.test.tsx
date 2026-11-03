import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadHighlighter, MAX_HIGHLIGHT_LENGTH } from './codeHighlight'
import { MarkdownPreview } from './MarkdownPreview'

describe('MarkdownPreview code highlighting', () => {
  afterEach(cleanup)

  it('colours fenced code with a known language once the highlighter loads', async () => {
    const { container } = render(<MarkdownPreview markdown={'```js\nconst total = 1 // sum\n```'} />)
    const code = container.querySelector('pre code')!
    expect(code.textContent).toBe('const total = 1 // sum\n')
    await waitFor(() => expect(code.querySelector('.hljs-keyword')?.textContent).toBe('const'))
    expect(code).toHaveClass('language-js', 'hljs')
    expect(code.querySelector('.hljs-comment')?.textContent).toBe('// sum')
    // Colouring never changes the text.
    expect(code.textContent).toBe('const total = 1 // sum\n')
  })

  it('leaves inline code, unknown languages, code without a language, and very long code plain', async () => {
    const long = 'x = 1\n'.repeat(MAX_HIGHLIGHT_LENGTH / 6 + 1)
    const { container } = render(
      <MarkdownPreview markdown={`Use \`const a\` here.\n\n\`\`\`klingon\nqapla\n\`\`\`\n\n\`\`\`\nconst plain = 1\n\`\`\`\n\n\`\`\`python\n${long}\`\`\``} />,
    )
    await loadHighlighter()
    // Give any highlighting a chance to land before checking that none did.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(container.querySelectorAll('.hljs, [class^="hljs-"]')).toHaveLength(0)
    expect(container.querySelector('p code')?.textContent).toBe('const a')
  })
})
