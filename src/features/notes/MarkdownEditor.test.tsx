import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMarkdown, setMarkdown } from '../../test/markdownEditor'
import { MarkdownEditor } from './MarkdownEditor'

function Harness({ initial, onChange }: { initial: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <p id="label">Markdown</p>
      <MarkdownEditor
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
        labelledBy="label"
        placeholder="Write here"
      />
      <button onClick={() => setValue((current) => current.replace('[ ]', '[x]'))}>Tick first task</button>
    </>
  )
}

describe('MarkdownEditor', () => {
  afterEach(cleanup)

  it('is a multi-line text box named by its label', () => {
    render(<Harness initial="Hello" />)
    const field = screen.getByRole('textbox', { name: 'Markdown' })
    expect(field).toHaveAttribute('aria-multiline', 'true')
    expect(getMarkdown(field)).toBe('Hello')
  })

  it('reports edits made in the editor', () => {
    const onChange = vi.fn()
    render(<Harness initial="Hello" onChange={onChange} />)
    setMarkdown('Hello world')
    expect(onChange).toHaveBeenLastCalledWith('Hello world')
  })

  it('applies outside changes as a minimal edit, keeping the cursor', () => {
    render(<Harness initial={'- [ ] Water\nSecond line'} />)
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Markdown' }))!
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    fireEvent.click(screen.getByRole('button', { name: 'Tick first task' }))
    expect(getMarkdown()).toBe('- [x] Water\nSecond line')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })
})
