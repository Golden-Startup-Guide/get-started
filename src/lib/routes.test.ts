import { describe, expect, it } from 'vitest'
import { hashToRoute, isNewHistoryStep, routeToHash, type Route } from './routes'

describe('page addresses', () => {
  it('round-trips every kind of page, with an open note and a search', () => {
    const routes: Route[] = [
      { view: 'home' },
      { view: 'all' },
      { view: 'search', query: 'water' },
      { view: 'favorites' },
      { view: 'trash' },
      { view: 'graph', query: 'tag:health' },
      { view: 'library:starter-library' },
      { view: 'shelf:a b/c' },
      { view: 'notebook:nb-1', note: 'note-1' },
      { view: 'tag:home & garden', note: 'n2', query: '"a phrase" -word' },
    ]
    for (const route of routes) expect(hashToRoute(routeToHash(route))).toEqual(route)
  })

  it('writes short, readable addresses', () => {
    expect(routeToHash({ view: 'home' })).toBe('#/')
    expect(routeToHash({ view: 'all' })).toBe('#/notes')
    expect(routeToHash({ view: 'notebook:nb-1', note: 'n1' })).toBe('#/notebook/nb-1?note=n1')
    expect(routeToHash({ view: 'all', query: 'basil' })).toBe('#/notes?q=basil')
  })

  it('treats no hash as Home and leaves other hashes alone', () => {
    expect(hashToRoute('')).toEqual({ view: 'home' })
    expect(hashToRoute('#')).toEqual({ view: 'home' })
    // A link to a heading inside a note.
    expect(hashToRoute('#watering')).toBeNull()
    expect(hashToRoute('#/unknown')).toBeNull()
    expect(hashToRoute('#/notebook')).toBeNull()
    expect(hashToRoute('#/notebook/%E0%A4%A')).toBeNull()
  })

  it('makes a history step for a new page or note, not for typing a search', () => {
    expect(isNewHistoryStep({ view: 'all' }, { view: 'favorites' })).toBe(true)
    expect(isNewHistoryStep({ view: 'all' }, { view: 'all', note: 'a' })).toBe(true)
    expect(isNewHistoryStep({ view: 'all', note: 'a' }, { view: 'all' })).toBe(true)
    expect(isNewHistoryStep({ view: 'all', note: 'a' }, { view: 'all', note: 'b' })).toBe(true)
    expect(isNewHistoryStep({ view: 'all', query: 'b' }, { view: 'all', query: 'ba' })).toBe(false)
    expect(isNewHistoryStep({ view: 'all', note: 'a', query: 'b' }, { view: 'all', note: 'a' })).toBe(false)
  })
})
