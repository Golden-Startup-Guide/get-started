import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Note, Notebook } from '../../types'
import { buildNoteLinkLabels, formatBytes, highlight } from './noteDisplay'

describe('note display helpers', () => {
  it('highlights every case-insensitive match', () => {
    const { container } = render(<p>{highlight('Seeds, more seeds, SEEDS', ['seeds'])}</p>)
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Seeds', 'seeds', 'SEEDS'])
    expect(container.textContent).toBe('Seeds, more seeds, SEEDS')
  })

  it('handles many matches without recursing', () => {
    // The old recursive version overflowed the stack inside highlight() itself, so checking
    // the returned parts catches it without the cost of rendering 20,000 elements.
    const result = highlight('a '.repeat(20000), ['a']) as ReactElement<{ children: ReactNode[] }>
    const marks = result.props.children.filter((part) => isValidElement(part) && part.type === 'mark')
    expect(marks).toHaveLength(20000)
  })

  it('returns the text unchanged without a query or match', () => {
    expect(highlight('Plain text', ['  '])).toBe('Plain text')
    expect(highlight('Plain text', ['missing'])).toBe('Plain text')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 bytes')
    expect(formatBytes(2048)).toBe('2.0 KiB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB')
  })

  // The original one-label-at-a-time implementation, kept as the reference behaviour.
  function referenceLabel(note: Note, records: Note[], notebooks: Notebook[]): string {
    const title = note.title || 'Untitled note'
    const duplicates = records.filter((item) => (item.title || 'Untitled note').toLocaleLowerCase() === title.toLocaleLowerCase())
    const notebook = notebooks.find((item) => item.id === note.notebookId)?.name ?? 'Personal'
    const maxIdLength = Math.max(0, ...duplicates.map((item) => item.id.length))
    let suffixLength = Math.min(8, maxIdLength)
    while (suffixLength < maxIdLength && duplicates.some((item) =>
      item.id !== note.id && item.id.slice(-suffixLength) === note.id.slice(-suffixLength),
    )) {
      suffixLength += 1
    }
    return `${title} — ${notebook}${duplicates.length > 1 ? ` · ${note.id.slice(-suffixLength)}` : ''}`
  }

  function randomLibrary(seed: number, count: number) {
    let state = seed
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
    const notebooks: Notebook[] = [
      { id: 'a', name: 'Work', createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'Home', createdAt: 1, updatedAt: 1 },
    ]
    const titles = ['Plan', 'plan', 'PLAN', 'Notes', '', 'Ideas', 'Unique one', 'Untitled note']
    const notes: Note[] = Array.from({ length: count }, (_, index) => {
      // IDs that share long endings force longer suffixes; some are shorter than 8 characters.
      const id = random() < 0.2 ? `n${index}` : random() < 0.5 ? `${index}-shared-ending-1234567890` : crypto.randomUUID()
      return {
        id,
        title: titles[Math.floor(random() * titles.length)],
        content: '',
        createdAt: 1,
        updatedAt: 1,
        notebookId: random() < 0.1 ? undefined : random() < 0.5 ? 'a' : 'b',
      }
    })
    return { notes, notebooks }
  }

  it('builds exactly the labels the one-at-a-time implementation produced', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { notes, notebooks } = randomLibrary(seed, 300)
      const labels = buildNoteLinkLabels(notes, notebooks)
      for (const note of notes) expect(labels.get(note.id)).toBe(referenceLabel(note, notes, notebooks))
    }
  })

  it('leaves unique titles without a suffix', () => {
    const notebooks: Notebook[] = [{ id: 'nb', name: 'Garden', createdAt: 1, updatedAt: 1 }]
    const labels = buildNoteLinkLabels([
      { id: 'one', title: 'Seeds', content: '', createdAt: 1, updatedAt: 1, notebookId: 'nb' },
      { id: 'two', title: '', content: '', createdAt: 1, updatedAt: 1 },
    ], notebooks)
    expect(labels.get('one')).toBe('Seeds — Garden')
    expect(labels.get('two')).toBe('Untitled note — Personal')
  })

  it('labels a 20,000-note library in linear time', () => {
    const notebooks: Notebook[] = [{ id: 'nb', name: 'Inbox', createdAt: 1, updatedAt: 1 }]
    const notes: Note[] = Array.from({ length: 20_000 }, (_, index) => ({
      id: crypto.randomUUID(),
      // Half the notes share 100 titles, so duplicate groups are large.
      title: index % 2 ? `Shared title ${index % 100}` : `Note ${index}`,
      content: '',
      createdAt: 1,
      updatedAt: 1,
      notebookId: 'nb',
    }))
    const started = performance.now()
    const labels = buildNoteLinkLabels(notes, notebooks)
    // The old approach needed about 400 million comparisons here; this should take milliseconds.
    expect(performance.now() - started).toBeLessThan(2000)
    expect(labels.size).toBe(20_000)
    expect(new Set(labels.values()).size).toBe(20_000)
  })
})
