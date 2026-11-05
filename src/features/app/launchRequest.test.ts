import { describe, expect, it } from 'vitest'
import { clipperBookmarklet, clipToNote, readLaunchRequest } from './launchRequest'

describe('launch requests', () => {
  it('reads app shortcuts', () => {
    expect(readLaunchRequest('?action=new')).toEqual({ kind: 'new' })
    expect(readLaunchRequest('?action=quick')).toEqual({ kind: 'quick' })
    expect(readLaunchRequest('?action=today')).toEqual({ kind: 'today' })
    expect(readLaunchRequest('?action=delete-everything')).toBeUndefined()
    expect(readLaunchRequest('')).toBeUndefined()
  })

  it('reads clips and shares, taking a shared link from the text and refusing other schemes', () => {
    expect(readLaunchRequest('?clip-title=Tips&clip-url=https%3A%2F%2Fexample.com%2Fa&clip-text=Water%0Aearly')).toEqual({
      kind: 'clip', title: 'Tips', url: 'https://example.com/a', text: 'Water\nearly',
    })
    expect(readLaunchRequest('?share-title=&share-text=https%3A%2F%2Fexample.com%2Fb')).toEqual({ kind: 'clip', title: '', url: 'https://example.com/b', text: '' })
    expect(readLaunchRequest('?share-text=Just%20a%20thought')).toEqual({ kind: 'clip', title: '', url: '', text: 'Just a thought' })
    expect(readLaunchRequest('?clip-title=Evil&clip-url=javascript%3Aalert(1)')).toEqual({ kind: 'clip', title: 'Evil', url: '', text: '' })
    expect(readLaunchRequest('?share-title=&share-text=&share-url=')).toBeUndefined()
  })

  it('makes a note of a clip: a link to the page and the selection quoted', () => {
    expect(clipToNote({ kind: 'clip', title: 'Garden [tips]', url: 'https://example.com/a b', text: 'Water early\nMulch' })).toEqual({
      title: 'Garden [tips]',
      content: '[Garden \\[tips\\]](<https://example.com/a b>)\n\n> Water early\n> Mulch',
    })
    expect(clipToNote({ kind: 'clip', title: '', url: 'https://example.com/x', text: '' })).toEqual({ title: 'example.com', content: '[example.com](<https://example.com/x>)' })
    expect(clipToNote({ kind: 'clip', title: '', url: '', text: 'A thought\nmore' }).title).toBe('A thought')
  })

  it('builds a bookmarklet that opens the app with the page', () => {
    const bookmarklet = clipperBookmarklet('https://notes.example/app/')
    expect(bookmarklet.startsWith('javascript:')).toBe(true)
    expect(bookmarklet).toContain('"https://notes.example/app/"+\'?clip-title=\'')
    expect(bookmarklet).toContain("'noopener'")
  })
})
