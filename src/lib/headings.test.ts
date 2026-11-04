import { describe, expect, it } from 'vitest'
import { extractSection, findHeading, headingSlug, listHeadings, sectionOf } from './headings'

describe('headings as link targets', () => {
  it('makes anchors from heading text', () => {
    expect(headingSlug('Seed list!')).toBe('seed-list')
    expect(headingSlug('  Café & tea  ')).toBe('café-tea')
    expect(headingSlug('???')).toBe('section')
  })

  it('lists headings with their lines and levels, skipping code blocks', () => {
    const markdown = '# Plan\nText\n## Seeds ##\n```\n# Not a heading\n```\n   ### Harvest\n#No space\n#'
    expect(listHeadings(markdown)).toEqual([
      { text: 'Plan', line: 1, depth: 1 },
      { text: 'Seeds', line: 3, depth: 2 },
      { text: 'Harvest', line: 7, depth: 3 },
    ])
  })

  it('finds the first heading a section names, ignoring case and punctuation', () => {
    const markdown = '# Plan\n## Seed list!\n## Seed list'
    expect(findHeading(markdown, 'seed LIST')).toEqual({ text: 'Seed list!', line: 2, depth: 2 })
    expect(findHeading(markdown, 'Missing')).toBeUndefined()
  })

  it('reads the section part of a link target', () => {
    expect(sectionOf('Garden plan#Seeds')).toBe('Seeds')
    expect(sectionOf('#Seeds')).toBe('Seeds')
    expect(sectionOf('Garden plan')).toBeUndefined()
    expect(sectionOf('Garden plan#  ')).toBeUndefined()
  })
})

describe('sections', () => {
  it('cuts a section up to the next heading of the same or a higher level', () => {
    const markdown = '# Plan\nIntro\n## Seeds\nBuy seeds\n### Tomatoes\nTwo kinds\n## Harvest\nPick\n# Next'
    expect(extractSection(markdown, 'seeds')).toBe('## Seeds\nBuy seeds\n### Tomatoes\nTwo kinds')
    expect(extractSection(markdown, 'Tomatoes')).toBe('### Tomatoes\nTwo kinds')
    expect(extractSection(markdown, 'Next')).toBe('# Next')
    expect(extractSection(markdown, 'Missing')).toBeUndefined()
  })
})
