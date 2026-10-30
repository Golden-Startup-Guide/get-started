import { describe, expect, it } from 'vitest'
import { getChecklistProgress, getChecklistTaskLines, toggleChecklistItem } from './checklists'

describe('Markdown checklists', () => {
  it('counts completed and incomplete tasks across GFM list markers', () => {
    const markdown = '- [x] Done\n* [ ] Next\n  1. [X] Also done\nOrdinary text'
    expect(getChecklistProgress(markdown)).toEqual({ completed: 2, total: 3 })
    expect(getChecklistTaskLines(markdown)).toEqual([1, 2, 3])
  })

  it('toggles only the requested task line and preserves its formatting', () => {
    const markdown = '## Steps\n  - [ ] First\n  2) [x] Second'
    expect(toggleChecklistItem(markdown, 2)).toBe('## Steps\n  - [x] First\n  2) [x] Second')
    expect(toggleChecklistItem(markdown, 3)).toBe('## Steps\n  - [ ] First\n  2) [ ] Second')
  })

  it('preserves CRLF newlines and leaves non-task lines unchanged', () => {
    const markdown = '- [ ] One\r\nNotes\r\n- [x] Two'
    expect(toggleChecklistItem(markdown, 2)).toBe(markdown)
    expect(toggleChecklistItem(markdown, 3)).toBe('- [ ] One\r\nNotes\r\n- [ ] Two')
    expect(toggleChecklistItem(markdown, 20)).toBe(markdown)
  })

  it('ignores checkbox-like text that is not a Markdown task list item', () => {
    expect(getChecklistProgress('Use [ ] in your explanation\n- not a task')).toEqual({
      completed: 0,
      total: 0,
    })
  })
})
