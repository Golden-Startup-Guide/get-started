import { describe, expect, it } from 'vitest'
import { isWordsOnly, placeMatches, snippet, titleMatches } from './librarySearch'
import { parseSearchQuery } from './search'

describe('searching the whole library', () => {
  it('matches places by every word in their name and description, and never by note filters', () => {
    expect(placeMatches('Nutrition Everyday food, water, and healthy choices.', parseSearchQuery('water food'))).toBe(true)
    expect(placeMatches('Nutrition Everyday food, water, and healthy choices.', parseSearchQuery('water -food'))).toBe(false)
    expect(placeMatches('Nutrition', parseSearchQuery('nutrition tag:health'))).toBe(false)
    expect(isWordsOnly(parseSearchQuery('"healthy choices"'))).toBe(true)
    expect(isWordsOnly(parseSearchQuery('has:task'))).toBe(false)
  })

  it('knows when a title holds every searched word', () => {
    expect(titleMatches('Water through the day', parseSearchQuery('day water'))).toBe(true)
    expect(titleMatches('Staying hydrated', parseSearchQuery('water'))).toBe(false)
  })

  it('shows a short plain passage around the first searched word', () => {
    const content = `## Keep water close\n\n${'Filler words. '.repeat(30)}Boil **the water** first, then let it cool.${' More text.'.repeat(20)}`
    const passage = snippet(content, ['boil'], 60)
    expect(passage).toMatch(/^….*Boil the water first.*…$/)
    expect(passage).not.toContain('**')
    expect(snippet('# Short\n\nA short note.', ['missing'])).toBe('Short A short note.')
  })
})
