import { describe, expect, it } from 'vitest'
import { quickNoteTitle } from './actions'

describe('quick note titles', () => {
  it('uses the first line with text, without heading, list, task, or quote markers', () => {
    expect(quickNoteTitle('\n\n  Call the plumber  \nabout the leak')).toBe('Call the plumber')
    expect(quickNoteTitle('## Ideas for the garden')).toBe('Ideas for the garden')
    expect(quickNoteTitle('- [ ] Buy compost')).toBe('Buy compost')
    expect(quickNoteTitle('* milk')).toBe('milk')
    expect(quickNoteTitle('> A quote I liked')).toBe('A quote I liked')
    expect(quickNoteTitle('   ')).toBe('')
  })

  it('shortens long first lines at a word boundary', () => {
    const title = quickNoteTitle('A very long first line that keeps going and going well past the point where a title would still be comfortable to read')
    expect(title.length).toBeLessThanOrEqual(81)
    expect(title.endsWith('…')).toBe(true)
    expect(title).not.toMatch(/\s…$/)
  })
})
