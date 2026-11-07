import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compileContent, parseFile } from '../../scripts/coreContent'
import { catalog, loaders } from 'virtual:core-content'

let root: string | undefined
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** A content folder in a temporary directory, from paths and their text. */
function folder(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'content-'))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  return root
}

const header = (fields: Record<string, string | number | boolean>) => `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n`
const levels = {
  'lib/library.md': header({ id: 'core-lib', name: 'Library', description: 'About.', order: 1 }),
  'lib/shelf/shelf.md': header({ id: 'core-shelf', name: 'Shelf', description: 'About.', order: 1 }),
  'lib/shelf/book/notebook.md': header({ id: 'core-book', name: 'Book', description: 'About.', order: 1 }),
  'lib/shelf/book/picture.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
}
const note = (fields: Record<string, string | number | boolean> = {}, body = 'Text.\n\n![A picture](picture.svg)') =>
  header({ id: 'core-note', title: 'A note', summary: 'One line.', type: 'Guide', order: 1, added: '2026-11-06', ...fields }) + body

describe('handbook content', () => {
  it('reads headers: text, quoted text, whole numbers, and true or false', () => {
    expect(parseFile('---\nid: core-a\nname: "12"\norder: 3\ndraft: true\n---\n\nBody\n')).toEqual({
      header: { id: 'core-a', name: '12', order: 3, draft: true },
      body: 'Body',
    })
    expect(() => parseFile('No header')).toThrow('no header')
  })

  it('compiles libraries, shelves, notebooks, and notes, in order', () => {
    const content = compileContent(folder({
      ...levels,
      'lib/shelf/book/b.md': note({ id: 'core-second', title: 'Second', order: 2, draft: true }, 'See [[First#Part]].\n\n![A picture](picture.svg)'),
      'lib/shelf/book/a.md': note({ id: 'core-first', title: 'First', order: 1 }),
    }))
    expect(content.catalog.libraries).toEqual([expect.objectContaining({ id: 'core-lib', name: 'Library', source: 'core' })])
    expect(content.catalog.notebooks).toEqual([expect.objectContaining({ id: 'core-book', shelfId: 'core-shelf' })])
    expect(content.notes['core-lib'].map((item) => [item.title, item.notebookId, item.draft ?? false])).toEqual([['First', 'core-book', false], ['Second', 'core-book', true]])
    expect(content.catalog.version).toMatch(/^[0-9a-f]{12}$/)
    expect(content.notes['core-lib'][0].content).toBe('Text.\n\n![A picture](core-picture:lib/shelf/book/picture.svg)')
    expect(Object.keys(content.pictures)).toEqual(['core-picture:lib/shelf/book/picture.svg'])
  })

  it('needs a picture on every page, described, and stored next to the note', () => {
    let message = ''
    try {
      compileContent(folder({
        ...levels,
        'lib/shelf/book/a.md': note({ id: 'core-a', title: 'A' }, 'No picture.'),
        'lib/shelf/book/b.md': note({ id: 'core-b', title: 'B' }, '![](picture.svg)'),
        'lib/shelf/book/c.md': note({ id: 'core-c', title: 'C' }, '![Remote](https://example.com/x.svg)'),
        'lib/shelf/book/d.md': note({ id: 'core-d', title: 'D' }, '![Missing](gone.svg)'),
        'lib/shelf/book/e.md': note({ id: 'core-e', title: 'E' }, '![Odd](picture.gif)'),
      }))
    } catch (error) {
      message = (error as Error).message
    }
    for (const problem of [
      'a.md: every page needs at least one picture',
      'b.md: the picture picture.svg needs words saying what it shows',
      'c.md: the picture https://example.com/x.svg must be a file in content/',
      'd.md: the picture gone.svg is not in lib/shelf/book/',
      'e.md: the picture picture.gif must be .svg, .png, .jpg, or .webp',
    ]) expect(message).toContain(problem)
  })

  it('stops with every problem: bad ids, missing fields, duplicates, and links to nowhere', () => {
    let message = ''
    try {
      compileContent(folder({
        ...levels,
        'lib/shelf/book/a.md': note({ id: 'Core Bad', type: 'Poem', added: '6 November' }),
        'lib/shelf/book/b.md': note({ id: 'core-b', summary: '' }, 'See [[Nowhere]].'),
        'lib/shelf/book/c.md': note({ id: 'core-lib', title: 'C', order: 'first' }, ''),
      }))
    } catch (error) {
      message = (error as Error).message
    }
    for (const problem of [
      'a.md: id "Core Bad" must start with "core-"',
      'a.md: type "Poem" must be one of',
      'a.md: added "6 November" must be a date',
      'b.md: "summary" is missing',
      'b.md: title "A note" is also used by lib/shelf/book/a.md',
      'b.md: [[Nowhere]] is not a handbook note',
      'c.md: id "core-lib" is already used by lib/library.md',
      'c.md: "order" must be a whole number',
      'c.md: the note has no text',
    ]) expect(message).toContain(problem)
  })

  it('ships the handbooks in content/, each library loadable on its own', async () => {
    expect(catalog.libraries.length).toBeGreaterThan(0)
    for (const library of catalog.libraries) {
      const notes = await loaders[library.id]()
      expect(notes.length).toBeGreaterThan(0)
      expect(notes.every((item) => item.source === 'core' && item.id.startsWith('core-'))).toBe(true)
      // Pictures are served from the app, never left as core-picture: addresses.
      expect(notes.every((item) => /!\[[^\]]+\]\(\/[^)]+\.svg\)/.test(item.content) && !item.content.includes('core-picture:'))).toBe(true)
    }
  })
})
