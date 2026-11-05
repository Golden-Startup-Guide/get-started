import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseFrontMatter, serializeFrontMatter } from './frontMatter'
import { htmlToMarkdown } from './htmlToMarkdown'
import { fromEvernote, fromKeep, fromMarkdownFiles, fromNotion } from './importers'
import { readInputFiles, type InputFile } from './inputFiles'
import { buildMarkdownZip, safeFileName } from './markdownExport'

const file = (path: string, content: string | Uint8Array): InputFile => ({ path, data: typeof content === 'string' ? strToU8(content) : content })
const PNG = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 255])

describe('front matter', () => {
  it('reads values, inline lists, and dashed lists, and writes them back', () => {
    const { data, body } = parseFrontMatter('---\ntitle: "Plan: 2026"\ntags: [garden, "plans"]\naliases:\n  - Plot\n  - Beds\ncreated: 2026-01-02T03:04:05.000Z\n---\n# Body\n')
    expect(data).toEqual({ title: 'Plan: 2026', tags: ['garden', 'plans'], aliases: ['Plot', 'Beds'], created: '2026-01-02T03:04:05.000Z' })
    expect(body).toBe('# Body\n')
    expect(parseFrontMatter('No front matter')).toEqual({ data: {}, body: 'No front matter' })
    const written = serializeFrontMatter({ title: 'A "quoted" title', tags: ['a b', 'c'], pinned: true, skipped: undefined, empty: [] })
    expect(parseFrontMatter(`${written}text`)).toEqual({ data: { title: 'A "quoted" title', tags: ['a b', 'c'], pinned: 'true' }, body: 'text' })
  })
})

describe('HTML to Markdown', () => {
  it('converts Evernote-style lines, checklists, formatting, links, lists, and tables', () => {
    const markdown = htmlToMarkdown(`<en-note>
      <div>First <b>bold</b> and <i>italic</i> line</div>
      <div><en-todo checked="true"/>Buy milk</div>
      <div><en-todo/>Water plants</div>
      <h2>Heading</h2>
      <p>See <a href="https://example.com">the site</a> and <s>old</s> <code>x*y</code>.</p>
      <ul><li>One<ul><li>Nested</li></ul></li><li><input type="checkbox" checked>Done</li></ul>
      <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2|3</td></tr></table>
      <div><en-media hash="abc" type="image/png"/></div>
    </en-note>`, { attachmentName: () => 'photo.png' })
    expect(markdown).toBe([
      'First **bold** and *italic* line',
      '- [x] Buy milk',
      '- [ ] Water plants',
      '',
      '## Heading',
      '',
      'See [the site](https://example.com) and ~~old~~ `x*y`.',
      '',
      '- One',
      '  - Nested',
      '- [x] Done',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2\\|3 |',
      '',
      '*(attachment: photo.png)*',
    ].join('\n'))
  })
})

describe('importers', () => {
  it('reads an Obsidian vault: folders as notebooks, front matter and #tags, embedded files', () => {
    const notes = fromMarkdownFiles([
      file('Vault/Ideas/Garden plan.md', '---\ntags: [garden]\ncreated: 2026-01-02T00:00:00.000Z\npinned: true\n---\nSow #basil soon, not `#code`.\n\n![[photo.png]]\n![[Other note]]\n[Report](files/report.pdf) and [web](https://example.com)\n'),
      file('Vault/Inbox.md', '# Inbox\nNothing yet'),
      file('Vault/attachments/photo.png', PNG),
      file('Vault/Ideas/files/report.pdf', strToU8('%PDF')),
      file('Vault/.obsidian/app.json', '{}'),
    ], 'Imported')
    expect(notes).toHaveLength(2)
    const [plan, inbox] = notes
    expect(plan).toEqual(expect.objectContaining({
      title: 'Garden plan',
      notebook: 'Ideas',
      tags: ['garden', 'basil'],
      createdAt: Date.UTC(2026, 0, 2),
      pinned: true,
    }))
    expect(plan.content).toBe('Sow #basil soon, not `#code`.\n\n*(attachment: photo.png)*\n![[Other note]]\n*(attachment: Report)* and [web](https://example.com)\n')
    expect(plan.attachments.map((item) => [item.name, item.type, item.data.length])).toEqual([['photo.png', 'image/png', 8], ['report.pdf', 'application/pdf', 4]])
    expect(inbox).toEqual(expect.objectContaining({ title: 'Inbox', notebook: 'Vault', tags: [] }))
  })

  it('reads HTML files, as Apple Notes exporters write them', () => {
    const [note] = fromMarkdownFiles([file('Notes/Trip.html', '<html><head><title>Trip ideas</title></head><body><h1>Trip ideas</h1><p>Pack <b>light</b></p><img src="map.png"></body></html>'), file('Notes/map.png', PNG)], 'Apple Notes')
    expect(note).toEqual(expect.objectContaining({ title: 'Trip ideas', notebook: 'Notes', content: '# Trip ideas\n\nPack **light**\n\n*(attachment: map.png)*' }))
    expect(note.attachments).toHaveLength(1)
  })

  it('reads a Notion export: IDs dropped from titles, the repeated title removed, page links as [[links]]', () => {
    const id = (seed: string) => seed.repeat(32).slice(0, 32)
    const notes = fromNotion([
      file(`Export/Garden plan ${id('a')}.md`, `# Garden plan\n\nSee [Recipes](Garden%20plan%20${id('a')}/Recipes%20${id('b')}.md) and [the list](Garden%20plan%20${id('a')}/Recipes%20${id('b')}.md).\n`),
      file(`Export/Garden plan ${id('a')}/Recipes ${id('b')}.md`, '# Recipes\n\nPesto\n'),
      file(`Export/Garden plan ${id('a')}/Untitled.csv`, 'a,b'),
    ])
    expect(notes.map((note) => [note.title, note.notebook, note.content])).toEqual([
      ['Garden plan', 'Notion', 'See [[Recipes]] and [[Recipes|the list]].\n'],
      ['Recipes', 'Notion', 'Pesto\n'],
    ])
  })

  it('reads Evernote .enex files: notebook from the file name, tags, dates, to-dos, and attachments', () => {
    const enex = `<?xml version="1.0" encoding="UTF-8"?>
<en-export><note><title>Shopping</title>
<content><![CDATA[<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div><en-todo checked="true"/>Milk</div><div><en-todo/>Bread</div><en-media hash="00" type="image/png"/></en-note>]]></content>
<created>20240131T094500Z</created><updated>20240201T100000Z</updated><tag>home</tag><tag>errands</tag>
<resource><data encoding="base64">iVBORwABAv8=</data><mime>image/png</mime><resource-attributes><file-name>receipt.png</file-name></resource-attributes></resource>
</note></en-export>`
    const [note] = fromEvernote([file('Exports/Home.enex', enex)])
    expect(note).toEqual(expect.objectContaining({
      title: 'Shopping', notebook: 'Home', tags: ['home', 'errands'],
      createdAt: Date.UTC(2024, 0, 31, 9, 45), updatedAt: Date.UTC(2024, 1, 1, 10),
      content: '- [x] Milk\n- [ ] Bread\n*(attachment: receipt.png)*',
    }))
    expect(note.attachments.map((item) => [item.name, [...item.data]])).toEqual([['receipt.png', [...PNG]]])
  })

  it('reads Google Keep from Takeout: text, checklists, labels, pins, trash, archive, and images', () => {
    const notes = fromKeep([
      file('Takeout/Keep/Groceries.json', JSON.stringify({
        title: 'Groceries', textContent: '', listContent: [{ text: 'Eggs', isChecked: true }, { text: 'Rice', isChecked: false }],
        labels: [{ name: 'Home' }], isPinned: true, isArchived: true, createdTimestampUsec: 1_700_000_000_000_000, userEditedTimestampUsec: 1_700_000_100_000_000,
        attachments: [{ filePath: 'list.png', mimetype: 'image/png' }],
      })),
      file('Takeout/Keep/Old idea.json', JSON.stringify({ title: '', textContent: 'Thrown away', isTrashed: true })),
      file('Takeout/Keep/list.png', PNG),
      file('Takeout/Keep/Labels.json', '{"labels": []}'),
    ])
    expect(notes).toEqual([
      expect.objectContaining({
        title: 'Groceries', content: '- [x] Eggs\n- [ ] Rice', tags: ['Home', 'archived'], notebook: 'Google Keep',
        pinned: true, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_100_000,
      }),
      expect.objectContaining({ title: 'Old idea', content: 'Thrown away', trashed: true }),
    ])
    expect(notes[0].attachments).toHaveLength(1)
  })
})

describe('Markdown export', () => {
  it('makes safe, unique file names', () => {
    expect(safeFileName('Plans: 2026/27?')).toBe('Plans- 2026-27-')
    expect(safeFileName('  ...  ')).toBe('Untitled')
    expect(safeFileName('CON')).toBe('Untitled')
  })

  it('round-trips through the Markdown importer: titles, text, notebooks, tags, flags, Trash, and attachments', async () => {
    const at = Date.UTC(2026, 0, 5)
    const zip = buildMarkdownZip({
      format: 'my-notes-backup', version: 4, exportedAt: at,
      libraries: [{ id: 'l', name: 'Home', createdAt: at, updatedAt: at }],
      shelves: [{ id: 's', libraryId: 'l', name: 'Desk', createdAt: at, updatedAt: at }],
      notebooks: [{ id: 'n', name: 'Work/Life', shelfId: 's', createdAt: at, updatedAt: at }],
      notes: [
        { id: 'a', title: 'Plan: phase 1', content: '# Plan\n\n- [ ] Start [[Same name]]', tags: ['work', 'two words'], notebookId: 'n', createdAt: at, updatedAt: at + 1000, pinned: true, favorite: false },
        { id: 'b', title: 'Same name', content: 'First', tags: [], notebookId: 'n', createdAt: at, updatedAt: at },
        { id: 'c', title: 'Same name', content: 'Second', tags: [], notebookId: 'n', createdAt: at, updatedAt: at },
        { id: 'd', title: 'Gone', content: 'In Trash', tags: [], notebookId: 'n', createdAt: at, updatedAt: at, deletedAt: at + 5 },
      ],
      attachments: [{ id: 'x', noteId: 'a', name: 'chart.png', type: 'image/png', size: PNG.length, createdAt: at, data: 'iVBORwABAv8=' }],
      tags: [], history: [], links: [], settings: { id: 'preferences', theme: 'system' },
    })
    const paths = Object.keys(unzipSync(zip)).sort()
    expect(paths).toEqual([
      'Home/Desk/Work-Life/Plan- phase 1 files/chart.png',
      'Home/Desk/Work-Life/Plan- phase 1.md',
      'Home/Desk/Work-Life/Same name (2).md',
      'Home/Desk/Work-Life/Same name.md',
      'Trash/Gone.md',
    ])
    expect(strFromU8(unzipSync(zip)['Home/Desk/Work-Life/Plan- phase 1.md'])).toContain('## Attachments\n\n- [chart.png](<Plan- phase 1 files/chart.png>)')

    const zipFile = new File([zipSync(unzipSync(zip))], 'export.zip', { type: 'application/zip' })
    const imported = fromMarkdownFiles(await readInputFiles([zipFile]), 'Imported')
    const byTitle = (title: string) => imported.filter((note) => note.title === title)
    expect(byTitle('Plan: phase 1')[0]).toEqual(expect.objectContaining({
      content: '# Plan\n\n- [ ] Start [[Same name]]\n', notebook: 'Work/Life', tags: ['work', 'two words'],
      createdAt: at, updatedAt: at + 1000, pinned: true, favorite: false, trashed: false,
    }))
    expect(byTitle('Plan: phase 1')[0].attachments.map((item) => [item.name, [...item.data]])).toEqual([['chart.png', [...PNG]]])
    expect(byTitle('Same name').map((note) => note.content).sort()).toEqual(['First', 'Second'])
    expect(byTitle('Gone')[0]).toEqual(expect.objectContaining({ trashed: true, notebook: 'Work/Life', content: 'In Trash' }))
  })
})
