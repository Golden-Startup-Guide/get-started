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
      <p id="label">Note text</p>
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
    const field = screen.getByRole('textbox', { name: 'Note text' })
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
    const view = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Note text' }))!
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    fireEvent.click(screen.getByRole('button', { name: 'Tick first task' }))
    expect(getMarkdown()).toBe('- [x] Water\nSecond line')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })
  it('keeps the newest typing when its own earlier text arrives late (a dropped keystroke)', () => {
    // React can hand the editor the text from one keystroke after the next keystroke has already
    // happened. That stale text must be recognised as the editor's own, not applied as a change.
    const onChange = vi.fn()
    const { rerender } = render(<MarkdownEditor value="" onChange={onChange} labelledBy="label" placeholder="" />)
    const field = screen.getByRole('textbox')
    const view = EditorView.findFromDOM(field)!
    view.dispatch({ changes: { from: 0, insert: 'a' } })
    view.dispatch({ changes: { from: 1, insert: 'b' } })
    expect(onChange).toHaveBeenNthCalledWith(1, 'a')
    expect(onChange).toHaveBeenNthCalledWith(2, 'ab')

    rerender(<MarkdownEditor value="a" onChange={onChange} labelledBy="label" placeholder="" />)
    expect(getMarkdown(field)).toBe('ab')
    rerender(<MarkdownEditor value="ab" onChange={onChange} labelledBy="label" placeholder="" />)
    expect(getMarkdown(field)).toBe('ab')

    // A real change from outside still applies, even back to text typed earlier.
    rerender(<MarkdownEditor value="a" onChange={onChange} labelledBy="label" placeholder="" />)
    expect(getMarkdown(field)).toBe('a')
  })
})
