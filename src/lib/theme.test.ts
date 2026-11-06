import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { themeChoice, themeSettings } from './theme'

const css = readFileSync(join(process.cwd(), 'src/workspace.css'), 'utf8')

/** The colour tokens declared in the rule that starts with `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const rule = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...rule.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]))
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const THEMES = {
  light: tokens('.workspace {'),
  paper: tokens(".workspace[data-theme='paper'] {"),
  dark: tokens(".workspace[data-theme='dark'],"),
}

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for focus rings and other meaningful non-text marks.
const PAIRS: Array<[foreground: string, background: string, minimum: number]> = [
  ...['text', 'muted', 'accent'].flatMap((foreground) => ['canvas', 'surface', 'surface-alt'].map((background): [string, string, number] => [foreground, background, 4.5])),
  ['text', 'accent-soft', 4.5],
  ['accent', 'accent-soft', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-hover', 4.5],
  ...['focus', 'ochre'].flatMap((foreground) => ['canvas', 'surface', 'surface-alt'].map((background): [string, string, number] => [foreground, background, 3])),
]

describe('theme colours', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    it(`meet WCAG AA contrast in the ${name} theme`, () => {
      const failures = PAIRS.filter(([foreground, background, minimum]) => contrast(theme[foreground], theme[background]) < minimum)
        .map(([foreground, background]) => `${foreground} on ${background}: ${contrast(theme[foreground], theme[background]).toFixed(2)}`)
      expect(failures).toEqual([])
    })
  }

  it('declare every token in every theme', () => {
    const names = Object.keys(THEMES.light).sort()
    expect(Object.keys(THEMES.paper).sort()).toEqual(names)
    expect(Object.keys(THEMES.dark).sort()).toEqual(names)
  })
})

describe('theme choice', () => {
  it('stores soft paper as the light theme with paper colours, so older versions can read it', () => {
    expect(themeSettings('paper')).toEqual({ theme: 'light', paper: true })
    expect(themeSettings('dark')).toEqual({ theme: 'dark', paper: false })
    expect(themeChoice({ theme: 'light', paper: true })).toBe('paper')
    expect(themeChoice({ theme: 'light' })).toBe('light')
    expect(themeChoice({ theme: 'system', paper: true })).toBe('system')
  })
})
