import { describe, expect, it } from 'vitest'
import { readingMinutes } from './readingTime'

describe('reading time', () => {
  it('counts words at 200 a minute, rounded', () => {
    expect(readingMinutes('')).toBe(0)
    expect(readingMinutes('word '.repeat(250))).toBe(1)
    expect(readingMinutes('word\n'.repeat(500))).toBe(3)
  })
})
