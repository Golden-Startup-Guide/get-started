import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatBytes, highlight } from './noteDisplay'

describe('note display helpers', () => {
  it('highlights every case-insensitive match', () => {
    const { container } = render(<p>{highlight('Seeds, more seeds, SEEDS', 'seeds')}</p>)
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Seeds', 'seeds', 'SEEDS'])
    expect(container.textContent).toBe('Seeds, more seeds, SEEDS')
  })

  it('handles many matches without recursing', () => {
    // The old recursive version overflowed the stack inside highlight() itself, so checking
    // the returned parts catches it without the cost of rendering 20,000 elements.
    const result = highlight('a '.repeat(20000), 'a') as ReactElement<{ children: ReactNode[] }>
    const marks = result.props.children.filter((part) => isValidElement(part) && part.type === 'mark')
    expect(marks).toHaveLength(20000)
  })

  it('returns the text unchanged without a query or match', () => {
    expect(highlight('Plain text', '  ')).toBe('Plain text')
    expect(highlight('Plain text', 'missing')).toBe('Plain text')
  })

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 bytes')
    expect(formatBytes(2048)).toBe('2.0 KiB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB')
  })
})
