import { describe, expect, it } from 'vitest'
import { MAX_PALETTE_RESULTS, searchPalette, type PaletteItem } from './paletteSearch'

const item = (id: string, group: PaletteItem['group'], label: string, keywords?: string): PaletteItem =>
  ({ id, group, label, keywords, run: () => undefined })

const items = [
  item('new', 'Actions', 'New note', 'create add'),
  item('dark', 'Actions', 'Use dark theme', 'appearance night'),
  item('fav', 'Places', 'Favorites'),
  item('work', 'Places', 'Work'),
  item('plan', 'Notes', 'Weekly plan'),
  item('garden', 'Notes', 'Garden plan'),
  item('planning', 'Notes', 'Planning notes'),
  item('note', 'Notes', 'Note'),
]
const ids = (results: PaletteItem[]) => results.map((result) => result.id)

describe('searchPalette', () => {
  it('ranks an exact label, then a label start, then a word start, then anything containing it', () => {
    expect(ids(searchPalette(items, 'plan'))).toEqual(['planning', 'plan', 'garden'])
    expect(ids(searchPalette(items, 'note'))).toEqual(['note', 'new', 'planning'])
  })

  it('needs every word, in any order, and ignores case and spacing', () => {
    expect(ids(searchPalette(items, '  PLAN   garden '))).toEqual(['garden'])
    expect(ids(searchPalette(items, 'plan garden'))).toEqual(['garden'])
    expect(searchPalette(items, 'plan zebra')).toEqual([])
  })

  it('finds actions by their keywords', () => {
    expect(ids(searchPalette(items, 'night'))).toEqual(['dark'])
    expect(ids(searchPalette(items, 'create'))).toEqual(['new'])
  })

  it('puts actions before places before notes when they match equally', () => {
    const tied = [item('n', 'Notes', 'Work log'), item('p', 'Places', 'Work log'), item('a', 'Actions', 'Work log')]
    expect(ids(searchPalette(tied, 'work'))).toEqual(['a', 'p', 'n'])
  })

  it('shows actions and then recent notes when the query is empty', () => {
    expect(ids(searchPalette(items, '', [items[4]]))).toEqual(['new', 'dark', 'plan'])
  })

  it('caps the results', () => {
    const many = Array.from({ length: 200 }, (_, index) => item(`n${index}`, 'Notes', `Note ${index}`))
    expect(searchPalette(many, 'note')).toHaveLength(MAX_PALETTE_RESULTS)
  })
})
