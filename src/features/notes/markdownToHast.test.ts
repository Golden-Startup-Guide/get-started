import { toHtml } from 'hast-util-to-html'
import { describe, expect, it } from 'vitest'
import { markdownToHast } from './markdownToHast'

const html = (markdown: string) => toHtml(markdownToHast(markdown))

describe('markdownToHast', () => {
  it('blanks unsafe link and image URLs and keeps safe ones', () => {
    expect(html('[bad](javascript:alert(1)) [data](data:text/html,x) [ok](https://example.com) [mail](mailto:a@b.c)')).toBe(
      '<p><a href="">bad</a> <a href="">data</a> <a href="https://example.com">ok</a> <a href="mailto:a@b.c">mail</a></p>',
    )
    expect(html('![x](javascript:alert(1))')).toBe('<p><img src="" alt="x"></p>')
    expect(html('[relative](./notes.md) [anchor](#top)')).toBe('<p><a href="./notes.md">relative</a> <a href="#top">anchor</a></p>')
  })

  it('shows raw HTML as text instead of rendering it', () => {
    expect(html('<script>alert(1)</script>')).toBe('&#x3C;script>alert(1)&#x3C;/script>')
    expect(html('Hi <img src=x onerror=alert(1)>')).toBe('<p>Hi &#x3C;img src=x onerror=alert(1)></p>')
  })

  it('supports GitHub-flavoured Markdown and wikilinks, with source positions for checkboxes', () => {
    const tree = markdownToHast('- [x] Done\n\n| a |\n|---|\n| b |\n\n~~old~~ [[Garden plan|the plan]]')
    const output = toHtml(tree)
    expect(output).toContain('<input type="checkbox" checked disabled>')
    expect(output).toContain('<table>')
    expect(output).toContain('<del>old</del>')
    expect(output).toContain('<a href="#" data-wikilink="Garden plan">the plan</a>')
    const list = tree.children.find((node) => node.type === 'element' && node.tagName === 'ul')
    expect(list?.position?.start.line).toBe(1)
  })

  it('survives being copied to and from a worker (structured clone)', () => {
    const tree = markdownToHast('# Title\n\nText with [[Link]]')
    expect(toHtml(structuredClone(tree))).toBe(toHtml(tree))
  })
})
