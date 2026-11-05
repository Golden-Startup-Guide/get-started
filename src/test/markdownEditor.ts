import { act, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'

// The Markdown field is a CodeMirror editor (a contenteditable region), not a <textarea>, so
// tests set and read its text through CodeMirror instead of fireEvent.change and .value.

export function markdownField(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Note text' })
}

function viewFor(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element)
  if (!view) throw new Error('The Markdown field is not a CodeMirror editor')
  return view
}

/** Replaces the whole Markdown text, as typing or pasting would. */
export function setMarkdown(text: string, element: HTMLElement = markdownField()) {
  const view = viewFor(element)
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  })
}

export function getMarkdown(element: HTMLElement = markdownField()): string {
  return viewFor(element).state.doc.toString()
}
