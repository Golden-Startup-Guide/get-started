import { describe, expect, it } from 'vitest'
import { cardPreview, plainInline } from './previewBlocks'

describe('plainInline', () => {
  it('removes formatting marks and keeps the words', () => {
    expect(plainInline('Some **bold**, *italic*, _also_, ~~old~~, ==marked== and `code`.')).toBe('Some bold, italic, also, old, marked and code.')
    expect(plainInline('[Seeds](https://example.com "Shop") and [[Weekly plan|the plan]] and [[Garden#Beds]]')).toBe('Seeds and the plan and Garden › Beds')
    expect(plainInline('![Photo](a.png) ![[Recipe]] note[^1] <b>x</b> \\*star\\*')).toBe('Photo Recipe note x *star*')
  })

  it('leaves ordinary punctuation alone', () => {
    expect(plainInline('2 * 3 = 6, snake_case_name, 5 - 2')).toBe('2 * 3 = 6, snake_case_name, 5 - 2')
  })
})

describe('cardPreview', () => {
  it('turns the start of a note into headings, lists, checklist items and paragraphs', () => {
    expect(cardPreview('## This week\'s **focus**\n- [ ] Review\n- [x] Plan\n  - Nested\n1. First\n> Quoted\nA line\njoined')).toEqual([
      { kind: 'heading', text: 'This week\'s focus' },
      { kind: 'task', done: false, text: 'Review', depth: 0 },
      { kind: 'task', done: true, text: 'Plan', depth: 0 },
      { kind: 'bullet', text: 'Nested', depth: 1 },
      { kind: 'numbered', number: '1', text: 'First', depth: 0 },
      { kind: 'quote', text: 'Quoted' },
    ])
  })

  it('shows tables, code, formulas, diagrams and images as one word each', () => {
    const content = '| Who | Phone |\n|---|---|\n| Doctor | 1 |\n\n```js\nlet a = 1\n```\n```mermaid\ngraph TD\n```\n$$\nx^2\n$$\n![Photo](a.png)'
    expect(cardPreview(content)).toEqual(['table', 'code', 'diagram', 'formula', 'image'].map((object) => ({ kind: 'object', object })))
  })

  it('skips empty list items, separators, and blank lines', () => {
    expect(cardPreview('## Focus\n-\n\n---\n## Tasks\n- ')).toEqual([{ kind: 'heading', text: 'Focus' }, { kind: 'heading', text: 'Tasks' }])
    expect(cardPreview('')).toEqual([])
  })

  it('shows what a callout says, without its marker', () => {
    expect(cardPreview('> [!NOTE]\n> Ask a nurse.')).toEqual([{ kind: 'quote', text: 'Ask a nurse.' }])
  })

  it('stops after a few blocks', () => {
    expect(cardPreview(Array.from({ length: 20 }, (_, index) => `- Item ${index}`).join('\n'))).toHaveLength(6)
  })
})
