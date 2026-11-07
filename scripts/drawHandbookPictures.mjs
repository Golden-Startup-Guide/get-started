// Draws the handbook pictures (content/README.md, "Pictures"): flat illustrations, 640 × 360, with
// no words in them, since the app is translated. Each page below gets <name>.svg next to its note,
// and the note gets the picture, with its description, after its first paragraph (or has it
// updated). To add a page's picture, add it to PAGES and run:  node scripts/drawHandbookPictures.mjs
// (or with part of a page's path, to redraw only the pages that match).
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTENT = fileURLToPath(new URL('../content', import.meta.url))
const C = {
  ink: '#24312b', green: '#2f6b4f', leaf: '#6aa56f', mint: '#cfe5d3', ochre: '#c98a2b', gold: '#e8b54a',
  sand: '#f3e6cc', cream: '#fffaf0', sky: '#d4e8f2', water: '#3b82b8', waterLight: '#9cc8e6', red: '#c0392b',
  rose: '#f2c9c0', white: '#ffffff', grey: '#9aa5a0', light: '#e4e8e5', soil: '#7a5230', brown: '#a0673a',
  plum: '#7d4e8f', blue: '#2f5f8f', teal: '#2a8a87', coral: '#e07a5f',
}
const SKIN = ['#8d5524', '#a8693b', '#c68642', '#5c3a1e', '#e0ac69']
const r1 = (n) => Math.round(n * 10) / 10
const darken = (hex, k = 0.72) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')

function svg(bg, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><clipPath id="c"><rect width="640" height="360" rx="24"/></clipPath><g clip-path="url(#c)"><rect width="640" height="360" fill="${bg}"/>${body}</g></svg>\n`
}
const ground = (y, fill) => `<rect y="${y}" width="640" height="${360 - y}" fill="${fill}"/>`

const POSES = {
  down: [[-30, -66], [30, -66]],
  up: [[-40, -186], [40, -186]],
  wave: [[-30, -66], [42, -176]],
  hold: [[-3, -96], [3, -96]],
  point: [[-30, -66], [64, -122]],
  pointL: [[-64, -122], [30, -66]],
  raise: [[-30, -66], [26, -192]],
  holdR: [[-30, -66], [34, -100]],
  holdL: [[-34, -100], [30, -66]],
  chin: [[-30, -66], [10, -138]],
  heart: [[-2, -106], [2, -106]],
}

function person(x, fy, o = {}) {
  const s = o.s ?? 1
  const skin = o.skin ?? SKIN[0], shirt = o.shirt ?? C.green, pants = o.pants ?? C.ink, hair = o.hair ?? C.ink
  const X = (d) => r1(x + d * s), Y = (d) => r1(fy + d * s), L = (d) => r1(d * s)
  const hands = o.hands ?? POSES[o.pose ?? 'down']
  let out = '<g>'
  if (!o.seated) {
    out += `<rect x="${X(-17)}" y="${Y(-68)}" width="${L(14)}" height="${L(68)}" rx="${L(6)}" fill="${pants}"/>`
    out += `<rect x="${X(3)}" y="${Y(-68)}" width="${L(14)}" height="${L(68)}" rx="${L(6)}" fill="${pants}"/>`
  } else {
    out += `<path d="M${X(-14)} ${Y(-62)}h${L(52)}v${L(62)}" stroke="${pants}" stroke-width="${L(14)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
  }
  out += o.dress
    ? `<path d="M${X(-20)} ${Y(-132)}h${L(40)}l${L(14)} ${L(84)}h${L(-68)}z" fill="${shirt}" stroke="${shirt}" stroke-width="${L(8)}" stroke-linejoin="round"/>`
    : `<rect x="${X(-24)}" y="${Y(-132)}" width="${L(48)}" height="${L(76)}" rx="${L(16)}" fill="${shirt}"/>`
  // Arms over the body, a shade darker, so hands held in front read as arms, not dots.
  for (const [i, [hx, hy]] of hands.entries()) {
    const sx = i === 0 ? -16 : 16
    out += `<path d="M${X(sx)} ${Y(-118)}L${X(hx)} ${Y(hy)}" stroke="${o.sleeve ?? darken(shirt)}" stroke-width="${L(12)}" stroke-linecap="round"/>`
  }
  for (const [hx, hy] of hands) out += `<circle cx="${X(hx)}" cy="${Y(hy)}" r="${L(6.5)}" fill="${skin}"/>`
  out += `<rect x="${X(-6)}" y="${Y(-142)}" width="${L(12)}" height="${L(14)}" fill="${skin}"/>`
  out += `<circle cx="${X(0)}" cy="${Y(-156)}" r="${L(19)}" fill="${skin}"/>`
  if (o.headwrap) out += `<path d="M${X(-21)} ${Y(-160)}q${L(0)} ${L(-34)} ${L(21)} ${L(-34)}q${L(24)} 0 ${L(21)} ${L(34)}z" fill="${o.headwrap}"/>`
  else if (o.long) out += `<path d="M${X(-20)} ${Y(-140)}v${L(-18)}a${L(20)} ${L(20)} 0 0 1 ${L(40)} 0v${L(18)}l${L(-8)} ${L(-14)}h${L(-24)}z" fill="${hair}"/>`
  else if (!o.bald) out += `<path d="M${X(-19)} ${Y(-158)}a${L(19)} ${L(19)} 0 0 1 ${L(38)} 0q${L(-19)} ${L(-10)} ${L(-38)} 0z" fill="${hair}"/>`
  if (o.face !== false) {
    out += `<circle cx="${X(-7)}" cy="${Y(-156)}" r="${L(2.2)}" fill="${C.ink}"/><circle cx="${X(7)}" cy="${Y(-156)}" r="${L(2.2)}" fill="${C.ink}"/>`
    out += o.sad
      ? `<path d="M${X(-6)} ${Y(-145)}q${L(6)} ${L(-5)} ${L(12)} 0" stroke="${C.ink}" stroke-width="${L(2)}" fill="none" stroke-linecap="round"/>`
      : `<path d="M${X(-6)} ${Y(-148)}q${L(6)} ${L(5)} ${L(12)} 0" stroke="${C.ink}" stroke-width="${L(2)}" fill="none" stroke-linecap="round"/>`
  }
  return out + '</g>'
}
const child = (x, fy, o = {}) => person(x, fy, { s: 0.62, ...o })

// Things.
const glass = (x, y, s = 1, level = 0.6) => {
  const h = 56 * s, w = 20 * s
  return `<path d="M${x - w} ${y - h}h${2 * w}l${-4 * s} ${h}h${-2 * w + 8 * s}z" fill="${C.waterLight}" opacity=".35"/><path d="M${x - w + (1 - level) * 4 * s} ${y - h * level}h${2 * w - (1 - level) * 8 * s}l${-4 * s * level} ${h * level}h${-2 * w + 8 * s + (1 - level) * 8 * s - 8 * s * (1 - level)}z" fill="${C.water}" opacity=".8"/><path d="M${x - w} ${y - h}h${2 * w}l${-4 * s} ${h}h${-2 * w + 8 * s}z" fill="none" stroke="${C.ink}" stroke-width="${3 * s}" stroke-linejoin="round"/>`
}
const bottle = (x, y, s = 1, fill = C.water) => `<rect x="${x - 14 * s}" y="${y - 74 * s}" width="${28 * s}" height="${74 * s}" rx="${9 * s}" fill="${fill}" opacity=".85"/><rect x="${x - 8 * s}" y="${y - 88 * s}" width="${16 * s}" height="${16 * s}" rx="${3 * s}" fill="${C.ink}"/><rect x="${x - 14 * s}" y="${y - 50 * s}" width="${28 * s}" height="${18 * s}" fill="${C.white}" opacity=".7"/>`
const jug = (x, y, s = 1) => `<path d="M${x + 30 * s} ${y - 70 * s}q${26 * s} ${4 * s} ${12 * s} ${40 * s}" stroke="${C.ink}" stroke-width="${6 * s}" fill="none"/><path d="M${x - 32 * s} ${y - 92 * s}h${64 * s}l${-6 * s} ${92 * s}h${-52 * s}z" fill="${C.waterLight}" opacity=".5" stroke="${C.ink}" stroke-width="${3 * s}" stroke-linejoin="round"/><path d="M${x - 29 * s} ${y - 62 * s}h${58 * s}l${-4 * s} ${62 * s}h${-50 * s}z" fill="${C.water}" opacity=".75"/><path d="M${x - 32 * s} ${y - 92 * s}l${-10 * s} ${-6 * s}" stroke="${C.ink}" stroke-width="${3 * s}"/>`
const spoon = (x, y, s = 1, fill = C.white, part = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="12" y="-3" width="34" height="6" rx="3" fill="${C.grey}"/><ellipse cx="0" cy="0" rx="16" ry="11" fill="${C.light}" stroke="${C.ink}" stroke-width="2.5"/><path d="M${-13 + 26 * (1 - part)} -7h${26 * part - 4}a4 7 0 0 1 0 14h${-(26 * part - 4)}a4 7 0 0 1 0 -14z" fill="${fill === C.light ? C.grey : fill}" stroke="${C.ink}" stroke-width="1" opacity=".95"/></g>`
const baby = (x, y, skin) => `<rect x="${x - 36}" y="${y - 16}" width="64" height="32" rx="16" fill="${C.sky}" stroke="${C.ink}" stroke-width="2.5"/><circle cx="${x + 30}" cy="${y - 4}" r="14" fill="${skin}" stroke="${C.sky}" stroke-width="4"/><path d="M${x + 26} ${y - 1}q4 3 8 0" stroke="${C.ink}" stroke-width="1.6" fill="none"/>`
const plate = (x, y, r = 80) => `<circle cx="${x}" cy="${y}" r="${r + 14}" fill="${C.white}" stroke="${C.light}" stroke-width="4"/><path d="M${x} ${y}L${x} ${y - r}A${r} ${r} 0 0 0 ${x} ${y + r}z" fill="${C.leaf}"/><path d="M${x} ${y}L${x} ${y - r}A${r} ${r} 0 0 1 ${x + r} ${y}z" fill="${C.gold}"/><path d="M${x} ${y}L${x + r} ${y}A${r} ${r} 0 0 1 ${x} ${y + r}z" fill="${C.coral}"/><circle cx="${x - r * 0.45}" cy="${y - r * 0.35}" r="${r * 0.13}" fill="${C.green}"/><circle cx="${x - r * 0.55}" cy="${y + r * 0.2}" r="${r * 0.13}" fill="${C.green}"/><circle cx="${x - r * 0.25}" cy="${y + r * 0.5}" r="${r * 0.11}" fill="${C.coral}"/><path d="M${x} ${y - r}v${2 * r}M${x} ${y}h${r}" stroke="${C.white}" stroke-width="4"/>`
const plant = (x, y, s = 1, leaf = C.leaf) => `<path d="M${x} ${y}v${-44 * s}" stroke="${C.green}" stroke-width="${5 * s}" stroke-linecap="round"/><path d="M${x} ${y - 20 * s}q${-30 * s} ${-6 * s} ${-30 * s} ${-30 * s}q${26 * s} 0 ${30 * s} ${30 * s}z" fill="${leaf}"/><path d="M${x} ${y - 34 * s}q${30 * s} ${-4 * s} ${30 * s} ${-28 * s}q${-26 * s} 0 ${-30 * s} ${28 * s}z" fill="${leaf}"/>`
const cabbage = (x, y, s = 1) => `<circle cx="${x}" cy="${y - 22 * s}" r="${26 * s}" fill="${C.leaf}"/><circle cx="${x}" cy="${y - 24 * s}" r="${15 * s}" fill="#a9d18e"/><path d="M${x - 26 * s} ${y - 22 * s}q${26 * s} ${-14 * s} ${52 * s} 0" stroke="${C.green}" stroke-width="${3 * s}" fill="none"/>`
const carrot = (x, y, s = 1) => `<path d="M${x - 9 * s} ${y - 40 * s}h${18 * s}l${-9 * s} ${46 * s}z" fill="${C.coral}"/><path d="M${x} ${y - 40 * s}l${-10 * s} ${-18 * s}M${x} ${y - 40 * s}v${-22 * s}M${x} ${y - 40 * s}l${10 * s} ${-18 * s}" stroke="${C.leaf}" stroke-width="${5 * s}" stroke-linecap="round"/>`
const tomato = (x, y, s = 1) => `<circle cx="${x}" cy="${y}" r="${14 * s}" fill="${C.red}"/><path d="M${x - 8 * s} ${y - 12 * s}l${8 * s} ${4 * s}l${8 * s} ${-4 * s}" stroke="${C.green}" stroke-width="${4 * s}" fill="none" stroke-linecap="round"/>`
const chicken = (x, y, s = 1, body = C.white, flip = false) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M-6 -4v18M8 -4v18" stroke="${C.ochre}" stroke-width="4" stroke-linecap="round"/><path d="M-6 14h-8M8 14h-8" stroke="${C.ochre}" stroke-width="3" stroke-linecap="round"/><path d="M-40 -40q-6 34 20 40h30q24-2 28-30z" fill="${body}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/><path d="M-38 -34q-16 -26 -2 -40q10 16 20 34z" fill="${body}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="30" cy="-38" r="14" fill="${body}" stroke="${C.ink}" stroke-width="2.5"/><path d="M22 -50q2-12 8-6q4-10 8 0q6-4 4 6z" fill="${C.red}"/><path d="M43 -40l12 4l-12 4z" fill="${C.ochre}"/><circle cx="33" cy="-40" r="2.5" fill="${C.ink}"/><path d="M38 -28q2 8-4 10q-4-6 4-10z" fill="${C.red}"/><path d="M-18 -24q14 8 26 -2" stroke="${C.ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`
const egg = (x, y, s = 1) => `<ellipse cx="${x}" cy="${y}" rx="${10 * s}" ry="${13 * s}" fill="${C.cream}" stroke="${C.ochre}" stroke-width="2"/>`
const coin = (x, y, r = 18) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}" stroke="${C.ochre}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${r * 0.6}" fill="none" stroke="${C.ochre}" stroke-width="2"/>`
const coins = (x, y, n = 3, r = 18) => Array.from({ length: n }, (_, i) => `<ellipse cx="${x}" cy="${y - i * 8}" rx="${r}" ry="${r * 0.4}" fill="${C.gold}" stroke="${C.ochre}" stroke-width="2.5"/>`).join('')
const note$ = (x, y, w = 70, h = 36, fill = C.leaf) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${C.green}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="${h * 0.28}" fill="none" stroke="${C.white}" stroke-width="2.5"/>`
const phone = (x, y, s = 1, screen = C.sky) => `<rect x="${x - 22 * s}" y="${y - 40 * s}" width="${44 * s}" height="${80 * s}" rx="${8 * s}" fill="${C.ink}"/><rect x="${x - 17 * s}" y="${y - 32 * s}" width="${34 * s}" height="${60 * s}" rx="${3 * s}" fill="${screen}"/>`
const doc = (x, y, w = 90, h = 120, lines = 5, extra = '') => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/>${Array.from({ length: lines }, (_, i) => `<rect x="${x - w / 2 + 12}" y="${y - h / 2 + 18 + i * ((h - 30) / lines)}" width="${(w - 24) * (i % 3 === 2 ? 0.6 : 1)}" height="5" rx="2.5" fill="${C.light}"/>`).join('')}${extra}`
const house = (x, y, s = 1, wall = C.cream, roof = C.coral) => `<rect x="${x - 60 * s}" y="${y - 80 * s}" width="${120 * s}" height="${80 * s}" fill="${wall}" stroke="${C.ink}" stroke-width="3"/><path d="M${x - 74 * s} ${y - 76 * s}L${x} ${y - 132 * s}L${x + 74 * s} ${y - 76 * s}z" fill="${roof}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><rect x="${x - 14 * s}" y="${y - 46 * s}" width="${28 * s}" height="${46 * s}" fill="${C.brown}"/><rect x="${x - 48 * s}" y="${y - 62 * s}" width="${24 * s}" height="${22 * s}" fill="${C.sky}" stroke="${C.ink}" stroke-width="2"/><rect x="${x + 24 * s}" y="${y - 62 * s}" width="${24 * s}" height="${22 * s}" fill="${C.sky}" stroke="${C.ink}" stroke-width="2"/>`
const book = (x, y, w = 120, h = 80, fill = C.blue) => `<path d="M${x} ${y - h / 2 + 6}q${-w / 4} ${-12} ${-w / 2} ${-6}v${h}q${w / 4} ${-6} ${w / 2} ${6}z" fill="${C.white}" stroke="${fill}" stroke-width="4" stroke-linejoin="round"/><path d="M${x} ${y - h / 2 + 6}q${w / 4} ${-12} ${w / 2} ${-6}v${h}q${-w / 4} ${-6} ${-w / 2} ${6}z" fill="${C.white}" stroke="${fill}" stroke-width="4" stroke-linejoin="round"/><path d="M${x - w / 2 + 12} ${y - h / 4}h${w / 2 - 22}M${x - w / 2 + 12} ${y - h / 4 + 14}h${w / 2 - 22}M${x + 10} ${y - h / 4}h${w / 2 - 22}M${x + 10} ${y - h / 4 + 14}h${w / 2 - 22}" stroke="${C.light}" stroke-width="4" stroke-linecap="round"/>`
const closedBook = (x, y, w, h, fill) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="3" fill="${fill}"/><rect x="${x + 4}" y="${y - h + 10}" width="${w - 8}" height="4" fill="${C.white}" opacity=".6"/>`
const heart = (x, y, s = 1, fill = C.coral) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 14C-30-6-24-30-8-30C-2-30 0-24 0-22C0-24 2-30 8-30C24-30 30-6 0 14z" fill="${fill}"/>`
const tick = (x, y, r = 22, fill = C.green) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><path d="M${x - r * 0.45} ${y}l${r * 0.3} ${r * 0.3}l${r * 0.55} ${-r * 0.6}" stroke="${C.white}" stroke-width="${r * 0.22}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
const cross = (x, y, r = 22, fill = C.red) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><path d="M${x - r * 0.38} ${y - r * 0.38}l${r * 0.76} ${r * 0.76}M${x + r * 0.38} ${y - r * 0.38}l${-r * 0.76} ${r * 0.76}" stroke="${C.white}" stroke-width="${r * 0.22}" stroke-linecap="round"/>`
const warn = (x, y, s = 1) => `<path d="M${x} ${y - 30 * s}L${x + 32 * s} ${y + 24 * s}H${x - 32 * s}z" fill="${C.gold}" stroke="${C.ink}" stroke-width="${3 * s}" stroke-linejoin="round"/><path d="M${x} ${y - 10 * s}v${18 * s}" stroke="${C.ink}" stroke-width="${5 * s}" stroke-linecap="round"/><circle cx="${x}" cy="${y + 15 * s}" r="${3 * s}" fill="${C.ink}"/>`
const flame = (x, y, s = 1) => `<path d="M${x} ${y}c${-22 * s} 0 ${-30 * s} ${-18 * s} ${-22 * s} ${-36 * s}c${4 * s} ${8 * s} ${10 * s} ${10 * s} ${12 * s} ${8 * s}c${-6 * s} ${-14 * s} ${2 * s} ${-28 * s} ${12 * s} ${-36 * s}c${0} ${14 * s} ${22 * s} ${26 * s} ${22 * s} ${44 * s}c0 ${12 * s} ${-10 * s} ${20 * s} ${-24 * s} ${20 * s}z" fill="${C.coral}"/><path d="M${x} ${y}c${-10 * s} 0 ${-12 * s} ${-12 * s} ${-4 * s} ${-22 * s}c${4 * s} ${8 * s} ${12 * s} ${8 * s} ${12 * s} ${16 * s}c0 ${4 * s} ${-4 * s} ${6 * s} ${-8 * s} ${6 * s}z" fill="${C.gold}"/>`
const bolt = (x, y, s = 1, fill = C.gold) => `<path transform="translate(${x} ${y}) scale(${s})" d="M6 -34L-18 4H0L-6 34L18 -4H0z" fill="${fill}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>`
const bubble = (x, y, w, h, fill = C.white, tail = 'left', inner = '') => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${Math.min(18, h / 2)}" fill="${fill}" stroke="${C.ink}" stroke-width="3"/><path d="M${x + (tail === 'left' ? -w / 4 : w / 4)} ${y + h / 2 - 2}l${tail === 'left' ? -14 : 14} 20l${tail === 'left' ? 2 : -2} -20z" fill="${fill}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><rect x="${x + (tail === 'left' ? -w / 4 - 1 : w / 4 - 1) - 8}" y="${y + h / 2 - 5}" width="22" height="5" fill="${fill}"/>${inner}`
const dots = (x, y, fill = C.grey) => `<circle cx="${x - 16}" cy="${y}" r="5" fill="${fill}"/><circle cx="${x}" cy="${y}" r="5" fill="${fill}"/><circle cx="${x + 16}" cy="${y}" r="5" fill="${fill}"/>`
const table = (x, y, w = 260, fill = C.brown) => `<rect x="${x - w / 2}" y="${y}" width="${w}" height="12" rx="4" fill="${fill}"/><rect x="${x - w / 2 + 14}" y="${y + 12}" width="10" height="${360 - y}" fill="${fill}"/><rect x="${x + w / 2 - 24}" y="${y + 12}" width="10" height="${360 - y}" fill="${fill}"/>`
const board = (x, y, w, h, inner = '') => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" fill="${C.green}" stroke="${C.brown}" stroke-width="8"/>${inner}`
const clock = (x, y, r = 30, hh = -60, mm = 90) => {
  const hand = (deg, len) => `L${r1(x + Math.cos((deg - 90) * Math.PI / 180) * len)} ${r1(y + Math.sin((deg - 90) * Math.PI / 180) * len)}`
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.white}" stroke="${C.ink}" stroke-width="4"/><path d="M${x} ${y}${hand(hh, r * 0.5)}M${x} ${y}${hand(mm, r * 0.75)}" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>`
}
const sun = (x, y, r = 30) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}"/>${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M${r1(x + Math.cos(a) * (r + 8))} ${r1(y + Math.sin(a) * (r + 8))}L${r1(x + Math.cos(a) * (r + 20))} ${r1(y + Math.sin(a) * (r + 20))}" stroke="${C.gold}" stroke-width="5" stroke-linecap="round"/>` }).join('')}`
const cloud = (x, y, s = 1, fill = C.white) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="-24" cy="0" r="18" fill="${fill}"/><circle cx="0" cy="-10" r="24" fill="${fill}"/><circle cx="26" cy="0" r="18" fill="${fill}"/><rect x="-42" y="0" width="86" height="18" rx="9" fill="${fill}"/></g>`
const drop = (x, y, s = 1, fill = C.water) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -24C8 -12 16 -2 16 8A16 16 0 0 1 -16 8C-16 -2 -8 -12 0 -24z" fill="${fill}"/>`
const calendar = (x, y, s = 1, mark = []) => {
  let out = `<rect x="${x - 60 * s}" y="${y - 50 * s}" width="${120 * s}" height="${104 * s}" rx="${8 * s}" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/><rect x="${x - 60 * s}" y="${y - 50 * s}" width="${120 * s}" height="${24 * s}" rx="${8 * s}" fill="${C.red}"/><rect x="${x - 60 * s}" y="${y - 36 * s}" width="${120 * s}" height="${10 * s}" fill="${C.red}"/>`
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const i = row * 4 + col
    out += `<rect x="${x - 50 * s + col * 26 * s}" y="${y - 18 * s + row * 22 * s}" width="${18 * s}" height="${14 * s}" rx="${3 * s}" fill="${mark.includes(i) ? C.leaf : C.light}"/>`
  }
  return out
}
const magnifier = (x, y, s = 1) => `<circle cx="${x}" cy="${y}" r="${26 * s}" fill="${C.sky}" fill-opacity=".5" stroke="${C.ink}" stroke-width="${7 * s}"/><path d="M${x + 19 * s} ${y + 19 * s}l${26 * s} ${26 * s}" stroke="${C.ink}" stroke-width="${10 * s}" stroke-linecap="round"/>`
const shield = (x, y, s = 1, fill = C.green) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -40L34 -28V0C34 22 18 36 0 44C-18 36 -34 22 -34 0V-28z" fill="${fill}"/>`
const lockbox = (x, y, s = 1) => `<rect x="${x - 50 * s}" y="${y - 50 * s}" width="${100 * s}" height="${70 * s}" rx="${8 * s}" fill="${C.blue}" stroke="${C.ink}" stroke-width="3"/><path d="M${x - 16 * s} ${y - 10 * s}v${-14 * s}a${16 * s} ${16 * s} 0 0 1 ${32 * s} 0v${14 * s}" stroke="${C.ink}" stroke-width="${6 * s}" fill="none"/><rect x="${x - 22 * s}" y="${y - 12 * s}" width="${44 * s}" height="${30 * s}" rx="${4 * s}" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x}" cy="${y + 2 * s}" r="${4 * s}" fill="${C.ink}"/>`
const building = (x, y, s = 1, fill = C.cream) => `<path d="M${x - 90 * s} ${y - 110 * s}L${x} ${y - 150 * s}L${x + 90 * s} ${y - 110 * s}z" fill="${C.light}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><rect x="${x - 84 * s}" y="${y - 110 * s}" width="${168 * s}" height="${14 * s}" fill="${fill}" stroke="${C.ink}" stroke-width="3"/>${[-60, -20, 20, 60].map((d) => `<rect x="${x + (d - 8) * s}" y="${y - 96 * s}" width="${16 * s}" height="${82 * s}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.5"/>`).join('')}<rect x="${x - 94 * s}" y="${y - 14 * s}" width="${188 * s}" height="${14 * s}" fill="${fill}" stroke="${C.ink}" stroke-width="3"/>`
const card = (x, y, w, h, fill = C.white, extra = '') => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${C.ink}" stroke-width="3"/>${extra}`
const idCard = (x, y, s = 1, fill = C.mint) => card(x, y, 150 * s, 96 * s, fill, `<rect x="${x - 62 * s}" y="${y - 32 * s}" width="${40 * s}" height="${52 * s}" rx="${4 * s}" fill="${C.white}" stroke="${C.ink}" stroke-width="2"/><circle cx="${x - 42 * s}" cy="${y - 14 * s}" r="${9 * s}" fill="${SKIN[1]}"/><path d="M${x - 56 * s} ${y + 18 * s}q${14 * s} ${-22 * s} ${28 * s} 0z" fill="${C.green}"/><rect x="${x - 8 * s}" y="${y - 26 * s}" width="${60 * s}" height="${7 * s}" rx="3" fill="${C.ink}" opacity=".5"/><rect x="${x - 8 * s}" y="${y - 10 * s}" width="${48 * s}" height="${6 * s}" rx="3" fill="${C.ink}" opacity=".3"/><rect x="${x - 8 * s}" y="${y + 4 * s}" width="${54 * s}" height="${6 * s}" rx="3" fill="${C.ink}" opacity=".3"/><path d="M${x - 8 * s} ${y + 26 * s}h${4 * s}m${4 * s} 0h${2 * s}m${4 * s} 0h${6 * s}m${3 * s} 0h${2 * s}m${4 * s} 0h${5 * s}m${3 * s} 0h${3 * s}m${4 * s} 0h${6 * s}" stroke="${C.ink}" stroke-width="${8 * s}"/>`)
const ballotBox = (x, y, s = 1) => `<rect x="${x - 60 * s}" y="${y - 80 * s}" width="${120 * s}" height="${80 * s}" rx="${6 * s}" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/><rect x="${x - 66 * s}" y="${y - 92 * s}" width="${132 * s}" height="${16 * s}" rx="${4 * s}" fill="${C.blue}" stroke="${C.ink}" stroke-width="3"/><rect x="${x - 26 * s}" y="${y - 87 * s}" width="${52 * s}" height="${6 * s}" fill="${C.ink}"/><path d="M${x - 20 * s} ${y - 46 * s}l${12 * s} ${12 * s}l${24 * s} ${-26 * s}" stroke="${C.green}" stroke-width="${8 * s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
const thermometer = (x, y, s = 1) => `<rect x="${x - 8 * s}" y="${y - 70 * s}" width="${16 * s}" height="${70 * s}" rx="${8 * s}" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x}" cy="${y + 6 * s}" r="${14 * s}" fill="${C.red}" stroke="${C.ink}" stroke-width="3"/><rect x="${x - 3 * s}" y="${y - 50 * s}" width="${6 * s}" height="${50 * s}" fill="${C.red}"/>`
const syringe = (x, y, s = 1) => `<g transform="translate(${x} ${y}) rotate(-35) scale(${s})"><rect x="-40" y="-10" width="64" height="20" rx="3" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/><rect x="-36" y="-6" width="30" height="12" fill="${C.waterLight}"/><path d="M24 0h26" stroke="${C.ink}" stroke-width="3"/><path d="M-40 0h-18M-58 -12v24" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/></g>`
const bin = (x, y, s = 1) => `<path d="M${x - 50 * s} ${y - 90 * s}h${100 * s}l${-8 * s} ${90 * s}h${-84 * s}z" fill="${C.brown}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>${[0, 1, 2].map((i) => `<path d="M${x - 46 * s} ${y - 66 * s + i * 24 * s}h${92 * s}" stroke="${C.soil}" stroke-width="3"/>`).join('')}`
const wateringCan = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 -60h60v60h-60z" fill="${C.teal}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="M30 -40l44 -30" stroke="${C.teal}" stroke-width="10" stroke-linecap="round"/><path d="M-30 -50q-26 6-12 34" stroke="${C.ink}" stroke-width="5" fill="none"/><rect x="68" y="-80" width="16" height="12" rx="3" transform="rotate(-34 76 -74)" fill="${C.ink}"/></g>`
const bucket = (x, y, s = 1, fill = C.blue) => `<path d="M${x - 34 * s} ${y - 60 * s}h${68 * s}l${-8 * s} ${60 * s}h${-52 * s}z" fill="${fill}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="M${x - 34 * s} ${y - 60 * s}q${34 * s} ${-44 * s} ${68 * s} 0" stroke="${C.ink}" stroke-width="3" fill="none"/>`
const bar = (x, y, w, h, fill) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="4" fill="${fill}"/>`
const lamp = (x, y, s = 1) => `<rect x="${x - 26 * s}" y="${y - 22 * s}" width="${52 * s}" height="${22 * s}" rx="${6 * s}" fill="${C.ochre}" stroke="${C.ink}" stroke-width="3"/><path d="M${x - 16 * s} ${y - 22 * s}q${-6 * s} ${-30 * s} ${16 * s} ${-44 * s}q${22 * s} ${14 * s} ${16 * s} ${44 * s}z" fill="${C.white}" fill-opacity=".6" stroke="${C.ink}" stroke-width="3"/>${flame(x, y - 30 * s, 0.5 * s)}`
const socket = (x, y, s = 1) => `<rect x="${x - 40 * s}" y="${y - 40 * s}" width="${80 * s}" height="${80 * s}" rx="${10 * s}" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/><rect x="${x - 18 * s}" y="${y - 18 * s}" width="${8 * s}" height="${18 * s}" rx="2" fill="${C.ink}"/><rect x="${x + 10 * s}" y="${y - 18 * s}" width="${8 * s}" height="${18 * s}" rx="2" fill="${C.ink}"/><circle cx="${x}" cy="${y + 16 * s}" r="${6 * s}" fill="${C.ink}"/>`
const tap = (x, y, s = 1) => `<path d="M${x - 40 * s} ${y}h${50 * s}q${16 * s} 0 ${16 * s} ${16 * s}v${10 * s}" stroke="${C.grey}" stroke-width="${14 * s}" fill="none" stroke-linecap="round"/><rect x="${x - 6 * s}" y="${y - 22 * s}" width="${12 * s}" height="${16 * s}" fill="${C.grey}"/><rect x="${x - 18 * s}" y="${y - 28 * s}" width="${36 * s}" height="${8 * s}" rx="4" fill="${C.ink}"/>`
const flag = (x, y, s = 1) => `<path d="M${x} ${y}v${-110 * s}" stroke="${C.ink}" stroke-width="4"/><g transform="translate(${x} ${y - 110 * s}) scale(${s})"><rect width="90" height="60" fill="${C.white}"/><rect width="90" height="20" fill="#e03c31"/><rect y="40" width="90" height="20" fill="#001489"/><path d="M0 0L36 30L0 60z" fill="${C.ink}"/><path d="M0 0l40 30l-40 30" fill="none" stroke="#ffb612" stroke-width="5"/><path d="M8 0l42 30l-42 30h-8" fill="none" stroke="${C.white}" stroke-width="3"/><path d="M0 30h90" stroke="#007749" stroke-width="12"/><path d="M0 4l36 26l-36 26" fill="none" stroke="#007749" stroke-width="12"/><path d="M0 12l24 18l-24 18z" fill="${C.ink}"/><path d="M0 7l31 23l-31 23" fill="none" stroke="#ffb612" stroke-width="4"/></g>`
const scale = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -100v100M-30 0h60M-70 -86h140" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/><path d="M-70 -86l-24 50h48zM70 -86l-24 50h48z" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="M-94 -36a24 12 0 0 0 48 0zM46 -36a24 12 0 0 0 48 0z" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="0" cy="-100" r="8" fill="${C.gold}"/></g>`
const laptop = (x, y, s = 1) => `<rect x="${x - 60 * s}" y="${y - 76 * s}" width="${120 * s}" height="${76 * s}" rx="${6 * s}" fill="${C.ink}"/><rect x="${x - 52 * s}" y="${y - 68 * s}" width="${104 * s}" height="${60 * s}" fill="${C.sky}"/><path d="M${x - 76 * s} ${y}h${152 * s}l${-10 * s} ${10 * s}h${-132 * s}z" fill="${C.grey}"/>`
const chair = (x, y, s = 1, fill = C.brown) => `<path d="M${x - 24 * s} ${y - 60 * s}h${48 * s}M${x - 24 * s} ${y - 60 * s}v${60 * s}M${x + 24 * s} ${y - 60 * s}v${60 * s}M${x + 24 * s} ${y - 60 * s}v${-56 * s}" stroke="${fill}" stroke-width="${8 * s}" stroke-linecap="round"/>`
const people = (positions) => positions.map(([x, y, o]) => person(x, y, o)).join('')
const pencil = (x, y, s = 1) => `<g transform="translate(${x} ${y}) rotate(-40) scale(${s})"><rect x="-6" y="-50" width="12" height="80" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.5"/><path d="M-6 30l6 14l6 -14z" fill="${C.sand}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/><rect x="-6" y="-58" width="12" height="10" fill="${C.coral}" stroke="${C.ink}" stroke-width="2.5"/></g>`
const bed = (x, y, w = 260) => `<rect x="${x - w / 2}" y="${y - 30}" width="${w}" height="30" rx="8" fill="${C.brown}"/><rect x="${x - w / 2}" y="${y - 90}" width="16" height="90" rx="6" fill="${C.brown}"/><rect x="${x - w / 2 + 10}" y="${y - 52}" width="${w - 10}" height="24" rx="10" fill="${C.white}"/>`
const shop = (x, y, s = 1) => `<rect x="${x - 90 * s}" y="${y - 100 * s}" width="${180 * s}" height="${100 * s}" fill="${C.cream}" stroke="${C.ink}" stroke-width="3"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${x - 100 * s + i * 33.3 * s} ${y - 126 * s}h${33.3 * s}v${26 * s}a${16.6 * s} ${12 * s} 0 0 1 ${-33.3 * s} 0z" fill="${i % 2 ? C.white : C.coral}" stroke="${C.ink}" stroke-width="2.5"/>`).join('')}<rect x="${x - 70 * s}" y="${y - 70 * s}" width="${80 * s}" height="${50 * s}" fill="${C.sky}" stroke="${C.ink}" stroke-width="2.5"/><rect x="${x + 28 * s}" y="${y - 72 * s}" width="${40 * s}" height="${72 * s}" fill="${C.brown}"/>`
const arrowRight = (x, y, w = 60, fill = C.green) => `<path d="M${x} ${y}h${w}m-16 -14l16 14l-16 14" stroke="${fill}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
const hearts = (x, y) => heart(x, y, 0.7) + heart(x + 30, y - 24, 0.5, C.rose)

const BG = {
  health: '#e3f0e8', farm: '#dcecf5', money: '#f6ecd8', community: '#e5edf6', education: '#f5ecdf',
  skills: '#ece8f4', home: '#f8e9e1', sa: '#e4efe8',
}

// Each page: [file under content/, alt text, picture].
const PAGES = [
  // Health & Wellbeing
  ['health-and-wellbeing/nutrition/everyday-nutrition/01-staying-hydrated', 'A woman drinking a glass of water on a sunny day, with a full water bottle beside her.', svg(BG.health,
    sun(560, 70) + ground(300, '#cde3d3') + person(250, 300, { pose: 'hold', hands: [[-30, -66], [12, -150]], skin: SKIN[1], shirt: C.teal, dress: true, headwrap: C.coral })
    + glass(268, 186, 0.6, 0.7) + bottle(380, 300, 1.2) + drop(470, 200, 1.4) + drop(510, 240, 1) + drop(450, 260, 0.8))],
  ['health-and-wellbeing/nutrition/everyday-nutrition/02-water-through-the-day', 'Glasses of water through the day: one at sunrise, one at midday, and one in the evening.', svg(BG.health,
    ground(290, '#cde3d3') + [[140, '#f6d6a8', 0.6], [320, '#fbe9b0', 0.85], [500, '#c9d4ea', 0.5]].map(([x, sky, lvl], i) => card(x, 160, 150, 220, sky, (i === 2 ? `<circle cx="${x + 34}" cy="${92}" r="18" fill="${C.cream}"/><circle cx="${x + 42}" cy="${86}" r="16" fill="${sky}"/>` : sun(x + (i === 0 ? -30 : 30), i === 0 ? 112 : 92, i === 0 ? 14 : 16)) + glass(x, 240, 1.1, lvl))).join(''))],
  ['health-and-wellbeing/nutrition/everyday-nutrition/03-signs-of-dehydration', 'A tired man holding his head on a hot day, next to a glass of water and warning signs of thirst.', svg(BG.health,
    sun(90, 70, 26) + ground(300, '#cde3d3') + person(300, 300, { sad: true, hands: [[-30, -66], [20, -168]], skin: SKIN[3], shirt: C.ochre, pants: C.blue })
    + warn(420, 120) + drop(470, 190, 1.2, C.waterLight) + glass(470, 290, 1, 0.8) + `<path d="M248 140q-10 10 0 20" stroke="${C.water}" stroke-width="4" fill="none" stroke-linecap="round"/>`)],
  ['health-and-wellbeing/nutrition/everyday-nutrition/04-a-balanced-plate', 'A plate divided into vegetables (half), starch (a quarter), and protein (a quarter), with a glass of water.', svg(BG.health,
    table(320, 290, 520, C.sand) + plate(300, 180, 96) + glass(470, 288, 1.1, 0.75) + carrot(140, 285, 0.9) + tomato(160, 278, 0.9))],
  ['health-and-wellbeing/family-health/caring-for-a-sick-child/01-when-a-child-has-diarrhoea', 'A litre jug of clean water with eight level teaspoons of sugar and half a teaspoon of salt, to make a sugar-salt drink.', svg(BG.health,
    table(320, 290, 560, C.sand) + jug(150, 290, 1.4) + card(400, 150, 300, 150, C.white, Array.from({ length: 8 }, (_, i) => spoon(300 + (i % 4) * 66, 112 + Math.floor(i / 4) * 44, 1, C.white)).join('') + spoon(300, 202, 1, C.light, 0.5))
    + glass(430, 288, 0.9, 0.7))],
  ['health-and-wellbeing/family-health/caring-for-a-sick-child/02-danger-signs-in-a-sick-child', 'A mother carrying her sick child to the clinic, with a thermometer and a warning sign.', svg(BG.health,
    ground(300, '#cde3d3') + `<rect x="410" y="110" width="190" height="190" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/><path d="M490 140h30v24h24v30h-24v24h-30v-24h-24v-30h24z" fill="${C.red}"/><rect x="480" y="240" width="50" height="60" fill="${C.light}"/>`
    + person(250, 300, { pose: 'hold', hands: [[-14, -108], [22, -104]], skin: SKIN[0], shirt: C.plum, dress: true, headwrap: C.gold })
    + child(256, 222, { seated: true, sad: true, skin: SKIN[0], shirt: C.waterLight, pants: C.blue, hands: [[-28, -80], [28, -80]] })
    + thermometer(110, 200, 1.1) + warn(120, 90, 0.8) + arrowRight(320, 250, 60))],
  ['health-and-wellbeing/family-health/caring-for-a-sick-child/03-keeping-vaccinations-up-to-date', 'A nurse vaccinating a baby held by a parent, with a clinic card showing the dates.', svg(BG.health,
    ground(300, '#cde3d3') + person(200, 300, { pose: 'hold', skin: SKIN[2], shirt: C.blue, hands: [[-10, -102], [26, -100]] })
    + baby(214, 196, SKIN[2])
    + person(350, 300, { pose: 'holdL', skin: SKIN[1], shirt: C.white, pants: C.teal, long: true, hair: C.ink }) + syringe(300, 196, 0.6)
    + doc(510, 190, 110, 150, 0, calendar(510, 196, 0.72, [0, 1, 2, 5, 6])))],
  ['health-and-wellbeing/mental-health/looking-after-your-mind/01-coping-with-stress', 'A woman sitting calmly and breathing slowly, with a cup of tea, a plant, and a friend to talk to.', svg(BG.health,
    ground(300, '#cde3d3') + chair(200, 300, 1.4, C.brown) + person(200, 300, { seated: true, pose: 'heart', skin: SKIN[3], shirt: C.leaf, long: true })
    + `<path d="M120 110q20 -20 40 0M260 110q20 -20 40 0" stroke="${C.green}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/>`
    + plant(80, 300, 1.4) + person(450, 300, { pose: 'wave', skin: SKIN[2], shirt: C.coral, pants: C.blue })
    + bubble(560, 90, 90, 56, C.white, 'left', heart(560, 92, 0.6)))],
  ['health-and-wellbeing/mental-health/looking-after-your-mind/02-where-to-find-support', 'A person phoning a free helpline and talking to a counsellor who listens.', svg(BG.health,
    ground(300, '#cde3d3') + person(170, 300, { hands: [[-30, -66], [18, -150]], skin: SKIN[0], shirt: C.blue, pants: C.ink }) + phone(186, 146, 0.45)
    + `<path d="M260 150q60 -50 120 0" stroke="${C.green}" stroke-width="5" fill="none" stroke-dasharray="10 10" stroke-linecap="round"/>`
    + person(470, 300, { hands: [[-18, -150], [30, -66]], skin: SKIN[2], shirt: C.teal, long: true }) + phone(454, 146, 0.45)
    + heart(320, 90, 1.1))],
  // Agriculture
  ['agriculture/growing-food/kitchen-garden/01-starting-a-kitchen-garden', 'A sunny backyard vegetable garden with beds of spinach, carrots, and tomatoes, and a gardener with a spade.', svg(BG.farm,
    sun(560, 70) + ground(230, '#b9d79c') + `<rect x="60" y="250" width="300" height="34" rx="10" fill="${C.soil}"/><rect x="60" y="300" width="300" height="34" rx="10" fill="${C.soil}"/>`
    + [90, 150, 210, 270, 330].map((x) => cabbage(x, 262, 0.7)).join('') + [90, 150, 210, 270, 330].map((x) => carrot(x, 318, 0.7)).join('')
    + person(470, 330, { hands: [[-30, -66], [30, -100]], skin: SKIN[1], shirt: C.ochre, headwrap: C.green, dress: true })
    + `<path d="M500 230v100" stroke="${C.brown}" stroke-width="6"/><path d="M490 330h20l-4 20h-12z" fill="${C.grey}"/>`)],
  ['agriculture/growing-food/kitchen-garden/02-making-compost', 'A compost heap with layers of green kitchen scraps, dry leaves, and soil, and a spade.', svg(BG.farm,
    ground(270, '#b9d79c') + `<path d="M120 300l60 -170h280l60 170z" fill="${C.soil}"/>`
    + [[150, 270, C.leaf], [170, 230, C.gold], [190, 190, C.leaf], [210, 150, C.gold]].map(([x, y, f]) => `<path d="M${x} ${y}h${640 - 2 * x}" stroke="${f}" stroke-width="14" stroke-linecap="round"/>`).join('')
    + carrot(260, 150, 0.6) + `<circle cx="380" cy="186" r="8" fill="${C.coral}"/><path d="M300 228l8 -10l8 10" fill="${C.leaf}"/>`
    + `<path d="M540 140v150" stroke="${C.brown}" stroke-width="7"/><path d="M526 290h28l-6 30h-16z" fill="${C.grey}"/>` + bucket(90, 300, 0.8, C.leaf))],
  ['agriculture/growing-food/kitchen-garden/03-what-to-plant-when', 'A calendar with seasons: seedlings in spring, tomatoes in summer, and cabbages in winter.', svg(BG.farm,
    ground(300, '#b9d79c') + calendar(320, 150, 1.4, [0, 1, 2, 3])
    + card(110, 220, 120, 120, C.white, plant(110, 260, 0.9) + sun(110, 186, 10)) + card(530, 220, 120, 120, C.white, cabbage(530, 266, 0.9) + cloud(530, 186, 0.4, C.light))
    + tomato(300, 290, 1) + tomato(330, 296, 0.9) + tomato(360, 290, 1))],
  ['agriculture/growing-food/kitchen-garden/04-watering-wisely', 'A gardener watering the soil at the base of plants in the early morning, next to mulch.', svg(BG.farm,
    sun(80, 80, 22) + ground(260, '#b9d79c') + `<rect x="250" y="276" width="340" height="40" rx="12" fill="${C.soil}"/><path d="M260 280h320" stroke="${C.gold}" stroke-width="8" stroke-dasharray="14 8"/>`
    + [300, 380, 460, 540].map((x) => plant(x, 290, 1.2)).join('') + person(170, 330, { hands: [[-30, -66], [40, -120]], skin: SKIN[3], shirt: C.blue, pants: C.ink })
    + wateringCan(220, 230, 0.8) + drop(290, 262, 0.4) + drop(300, 276, 0.4))],
  ['agriculture/keeping-animals/backyard-chickens/01-starting-with-chickens', 'A small wooden chicken coop with three hens in a fenced yard.', svg(BG.farm,
    ground(250, '#b9d79c') + `<rect x="60" y="120" width="190" height="140" fill="${C.brown}" stroke="${C.ink}" stroke-width="3"/><path d="M44 126L155 66L266 126z" fill="${C.coral}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><rect x="130" y="190" width="50" height="70" fill="${C.soil}"/><path d="M180 260l50 40" stroke="${C.brown}" stroke-width="10"/>`
    + `<path d="M0 230h640M0 260h640" stroke="${C.cream}" stroke-width="5"/>` + [20, 120, 220, 320, 420, 520, 620].map((x) => `<rect x="${x}" y="214" width="10" height="60" fill="${C.cream}"/>`).join('')
    + chicken(330, 320, 1.2) + chicken(450, 300, 1, C.ochre, true) + chicken(560, 330, 1.1, C.brown))],
  ['agriculture/keeping-animals/backyard-chickens/02-feeding-chickens', 'A woman scattering feed for hens, with a water container and fresh eggs.', svg(BG.farm,
    ground(240, '#b9d79c') + person(170, 300, { hands: [[-30, -66], [60, -110]], skin: SKIN[0], shirt: C.coral, dress: true, headwrap: C.blue })
    + Array.from({ length: 14 }, (_, i) => `<circle cx="${250 + (i * 37) % 200}" cy="${250 + (i * 23) % 70}" r="4" fill="${C.ochre}"/>`).join('')
    + chicken(320, 320, 1.1, C.white) + chicken(430, 300, 1, C.ochre, true) + bucket(560, 320, 1, C.waterLight) + egg(520, 330) + egg(545, 334))],
  ['agriculture/keeping-animals/backyard-chickens/03-keeping-chickens-healthy', 'A healthy hen next to a clean coop, a vaccine, and a check mark.', svg(BG.farm,
    ground(250, '#b9d79c') + chicken(260, 300, 2) + shield(470, 160, 1.6) + `<path d="M450 160l14 14l26 -28" stroke="${C.white}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + syringe(540, 270, 0.8) + bucket(110, 320, 0.8, C.waterLight))],
  // Financial literacy
  ['financial-literacy/household-money/budgeting-basics/01-understanding-household-budgets', 'A family at a table writing their monthly budget: money in, and money for food, transport, and saving.', svg(BG.money,
    person(140, 330, { pose: 'hold', skin: SKIN[1], shirt: C.green, headwrap: C.ochre, dress: true }) + person(500, 330, { pose: 'hold', skin: SKIN[3], shirt: C.blue })
    + table(320, 250, 420, C.brown) + doc(300, 190, 150, 110, 0, bar(250, 230, 22, 70, C.green) + bar(280, 230, 22, 40, C.coral) + bar(310, 230, 22, 28, C.gold) + bar(340, 230, 22, 18, C.blue)) + coins(420, 240, 4) + note$(220, 236, 60, 28) + pencil(380, 200, 0.6))],
  ['financial-literacy/household-money/budgeting-basics/02-building-an-emergency-fund', 'A savings jar filling up with coins, ready for an emergency.', svg(BG.money,
    table(320, 290, 500, C.brown) + `<path d="M230 120h180v20q20 10 20 40v100q0 10-10 10h-200q-10 0-10-10v-100q0-30 20-40z" fill="${C.white}" fill-opacity=".6" stroke="${C.ink}" stroke-width="4"/><rect x="226" y="100" width="188" height="24" rx="6" fill="${C.ochre}" stroke="${C.ink}" stroke-width="3"/>`
    + coins(320, 278, 6, 60) + coin(290, 210, 20) + coin(350, 200, 20) + coin(320, 160, 18) + shield(510, 170, 1.2, C.green) + `<path d="M494 170l12 12l20 -22" stroke="${C.white}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + coin(130, 230, 22) + arrowRight(160, 230, 50))],
  ['financial-literacy/household-money/budgeting-basics/03-saving-with-a-stokvel', 'Members of a stokvel sitting in a circle, each putting money into a shared box.', svg(BG.money,
    lockbox(320, 250, 1.2) + person(110, 340, { hands: [[-30, -66], [70, -110]], skin: SKIN[0], shirt: C.coral, dress: true, headwrap: C.green }) + person(230, 300, { pose: 'hold', s: 0.85, skin: SKIN[2], shirt: C.blue })
    + person(410, 300, { pose: 'hold', s: 0.85, skin: SKIN[3], shirt: C.leaf, long: true }) + person(530, 340, { hands: [[-70, -110], [30, -66]], skin: SKIN[1], shirt: C.plum, dress: true, headwrap: C.gold })
    + coin(200, 220, 14) + coin(440, 220, 14) + coin(320, 150, 16))],
  ['financial-literacy/credit-and-debt/using-credit-wisely/01-how-credit-works', 'A loan with an arrow showing it grows with interest and fees before it is paid back.', svg(BG.money,
    note$(120, 180, 120, 64) + arrowRight(200, 180, 90, C.ochre) + note$(420, 150, 120, 64) + note$(430, 210, 120, 64, C.gold) + `<path d="M520 120v120" stroke="${C.ink}" stroke-width="3"/>` + calendar(570, 180, 0.6, [0, 4, 8]) + clock(320, 280, 30))],
  ['financial-literacy/credit-and-debt/using-credit-wisely/02-your-credit-report', 'A credit report on paper with a magnifying glass, checking it for mistakes.', svg(BG.money,
    doc(270, 180, 200, 250, 8) + `<path d="M190 300h160" stroke="${C.light}" stroke-width="5"/>` + tick(330, 98, 18) + cross(330, 250, 16) + magnifier(420, 230, 1.6))],
  ['financial-literacy/credit-and-debt/using-credit-wisely/03-avoiding-debt-traps', 'A person stepping back from a pit of debt, with a warning sign and a stack of unpaid bills.', svg(BG.money,
    ground(270, '#e8d6b3') + `<ellipse cx="420" cy="300" rx="150" ry="36" fill="${C.ink}" opacity=".85"/>` + doc(420, 230, 70, 90, 4) + doc(450, 250, 70, 90, 4) + cross(470, 210, 16)
    + person(160, 300, { hands: [[-40, -110], [50, -130]], skin: SKIN[1], shirt: C.green, pants: C.blue }) + warn(560, 110, 1.2))],
  // Community development
  ['community-development/working-together/community-groups/01-starting-a-community-group', 'Neighbours meeting together outdoors to plan a community project.', svg(BG.community,
    ground(290, '#cfe0c7') + people([[110, 320, { pose: 'wave', skin: SKIN[0], shirt: C.coral }], [230, 310, { skin: SKIN[2], shirt: C.blue, long: true, s: 0.95 }], [350, 316, { pose: 'raise', skin: SKIN[3], shirt: C.green, headwrap: C.gold, dress: true }], [470, 310, { skin: SKIN[1], shirt: C.ochre, s: 0.95 }], [580, 320, { pose: 'hold', skin: SKIN[4], shirt: C.teal }]]) + bubble(470, 70, 120, 60, C.white, 'left', heart(470, 72, 0.7, C.green)))],
  ['community-development/working-together/community-groups/02-running-a-good-meeting', 'A meeting with a chairperson, an agenda on the board, and members raising hands to speak.', svg(BG.community,
    board(470, 120, 220, 150, doc(470, 120, 160, 110, 5)) + person(300, 320, { pose: 'pointL', skin: SKIN[3], shirt: C.blue, long: true })
    + chair(80, 340, 1, C.brown) + person(80, 340, { seated: true, pose: 'raise', skin: SKIN[1], shirt: C.coral, s: 0.85 }) + chair(190, 340, 1) + person(190, 340, { seated: true, skin: SKIN[0], shirt: C.green, s: 0.85, headwrap: C.gold }) + clock(580, 280, 26))],
  ['community-development/working-together/community-groups/03-keeping-group-money-safe', 'Two group members signing a record book next to a bank card and a locked cash box.', svg(BG.community,
    table(320, 260, 520, C.brown) + book(320, 210, 200, 90, C.green) + pencil(380, 200, 0.6) + lockbox(520, 250, 1) + card(130, 230, 120, 70, C.blue, `<rect x="88" y="214" width="26" height="18" rx="3" fill="${C.gold}"/>`)
    + tick(260, 120, 20) + tick(380, 120, 20))],
  ['community-development/local-government/your-ward-and-municipality/01-what-ward-committees-do', 'A ward councillor listening to community members at a meeting outside the municipal offices.', svg(BG.community,
    ground(300, '#cfe0c7') + building(470, 300, 1) + person(250, 300, { pose: 'hold', skin: SKIN[2], shirt: C.ink, pants: C.ink }) + doc(250, 210, 40, 50, 3)
    + person(100, 320, { pose: 'raise', skin: SKIN[0], shirt: C.coral, dress: true, headwrap: C.green, s: 0.9 }) + person(170, 330, { skin: SKIN[3], shirt: C.ochre, s: 0.8 }) + bubble(110, 60, 100, 50, C.white, 'left', dots(110, 60)))],
  ['community-development/local-government/your-ward-and-municipality/02-having-your-say-in-the-idp', 'Residents adding their ideas, like water, roads, and a clinic, to a plan on a board.', svg(BG.community,
    board(380, 150, 340, 220, `<rect x="230" y="60" width="90" height="70" rx="8" fill="${C.sky}"/>${drop(275, 100, 1.2)}<rect x="340" y="60" width="90" height="70" rx="8" fill="${C.sand}"/><path d="M350 120l30 -50h10l30 50" fill="${C.grey}"/><path d="M385 118v-10m0 -12v-10" stroke="${C.white}" stroke-width="4"/><rect x="450" y="60" width="90" height="70" rx="8" fill="${C.white}"/><path d="M485 76h20v14h14v20h-14v14h-20v-14h-14v-20h14z" fill="${C.red}"/><rect x="230" y="150" width="90" height="70" rx="8" fill="${C.mint}"/>${plant(275, 210, 0.8)}<rect x="340" y="150" width="90" height="70" rx="8" fill="${C.gold}" opacity=".7"/>${bolt(385, 185, 0.8)}`)
    + person(110, 340, { pose: 'point', skin: SKIN[1], shirt: C.coral, long: true }) + person(560, 340, { skin: SKIN[3], shirt: C.blue, pose: 'pointL', s: 0.85 }))],
  ['community-development/local-government/your-ward-and-municipality/03-reporting-a-service-problem', 'A resident photographing a leaking water pipe and reporting it to the municipality, getting a reference number.', svg(BG.community,
    ground(270, '#d6d2c8') + `<rect x="60" y="270" width="320" height="20" fill="${C.grey}"/><rect x="200" y="262" width="30" height="36" fill="${C.ink}" opacity=".4"/>` + drop(215, 240, 1) + drop(245, 220, 0.8) + drop(190, 222, 0.7) + `<ellipse cx="215" cy="320" rx="90" ry="14" fill="${C.waterLight}"/>`
    + person(440, 330, { hands: [[-48, -136], [30, -66]], skin: SKIN[0], shirt: C.green, headwrap: C.coral, dress: true }) + phone(392, 186, 0.6) + bubble(560, 90, 110, 70, C.white, 'left', tick(560, 90, 20)))],
  // Education & learning
  ['education-and-learning/learning-at-home/supporting-childrens-learning/01-reading-with-children', 'A grandmother reading a picture book aloud with a child on the couch.', svg(BG.education,
    `<rect x="80" y="210" width="480" height="70" rx="20" fill="${C.coral}"/><rect x="60" y="180" width="40" height="130" rx="16" fill="${C.coral}"/><rect x="540" y="180" width="40" height="130" rx="16" fill="${C.coral}"/>`
    + person(240, 300, { seated: true, pose: 'hold', hands: [[0, -100], [40, -100]], skin: SKIN[3], shirt: C.plum, headwrap: C.gold }) + child(420, 262, { seated: true, hands: [[-40, -84], [20, -70]], skin: SKIN[3], shirt: C.gold, pants: C.blue })
    + book(320, 188, 130, 70, C.green) + `<circle cx="300" cy="180" r="8" fill="${C.gold}"/><path d="M332 196l12 -16l12 16z" fill="${C.leaf}"/>`)],
  ['education-and-learning/learning-at-home/supporting-childrens-learning/02-homework-routines-that-help', 'A child doing homework at a tidy table after school, with a clock and a parent nearby.', svg(BG.education,
    clock(520, 90, 34, 120, 0) + table(300, 240, 340, C.brown) + chair(230, 340, 1.1) + child(230, 340, { seated: true, pose: 'hold', hands: [[20, -92], [44, -90]], skin: SKIN[1], shirt: C.coral, pants: C.blue }) + book(320, 222, 110, 50, C.blue) + pencil(378, 214, 0.5) + closedBook(400, 240, 60, 14, C.green) + closedBook(404, 226, 52, 14, C.gold)
    + person(540, 340, { pose: 'pointL', hands: [[-80, -130], [30, -66]], skin: SKIN[1], shirt: C.teal, long: true }))],
  ['education-and-learning/learning-at-home/supporting-childrens-learning/03-talking-with-your-childs-teacher', 'A parent and a teacher talking about a child\'s progress in a classroom.', svg(BG.education,
    board(320, 100, 300, 120, `<path d="M200 80h80M200 100h60M200 120h90" stroke="${C.white}" stroke-width="5" stroke-linecap="round" opacity=".8"/><path d="M380 90l14 14l26 -28" stroke="${C.gold}" stroke-width="6" fill="none"/>`)
    + person(200, 330, { pose: 'wave', skin: SKIN[0], shirt: C.green, headwrap: C.coral, dress: true }) + person(440, 330, { pose: 'hold', skin: SKIN[2], shirt: C.blue, long: true }) + doc(440, 236, 50, 60, 3)
    + bubble(310, 200, 70, 46, C.white, 'right', dots(310, 200)))],
  ['education-and-learning/learning-as-an-adult/keep-learning/01-going-back-to-learning', 'An adult learner arriving at a community college with books in hand.', svg(BG.education,
    ground(300, '#d7d0c0') + building(420, 300, 1.15, C.sand) + person(170, 300, { pose: 'holdR', skin: SKIN[3], shirt: C.ochre, pants: C.blue }) + closedBook(196, 214, 40, 14, C.green) + closedBook(196, 200, 36, 14, C.coral) + arrowRight(220, 260, 60))],
  ['education-and-learning/learning-as-an-adult/keep-learning/02-study-habits-that-work', 'An adult studying at night with notes, a timer, and a list of goals being ticked off.', svg(BG.education,
    `<rect x="440" y="40" width="140" height="110" rx="8" fill="#2f3e57"/><circle cx="530" cy="80" r="16" fill="${C.cream}"/><circle cx="538" cy="74" r="14" fill="#2f3e57"/>`
    + table(280, 250, 380, C.brown) + person(220, 340, { seated: true, pose: 'hold', hands: [[20, -96], [50, -100]], skin: SKIN[0], shirt: C.leaf, long: true }) + book(310, 230, 110, 46, C.blue) + clock(400, 220, 24) + doc(110, 140, 100, 120, 0, tick(90, 110, 12) + tick(90, 145, 12) + `<circle cx="90" cy="180" r="12" fill="none" stroke="${C.grey}" stroke-width="3"/><path d="M110 110h40M110 145h40M110 180h40" stroke="${C.light}" stroke-width="6" stroke-linecap="round"/>`))],
  // Skills & careers
  ['skills-and-careers/finding-work/looking-for-work/01-writing-a-cv', 'A one-page CV with a photo, contact details, and sections for experience and skills, with a pen.', svg(BG.skills,
    doc(300, 180, 210, 290, 0, `<circle cx="240" cy="90" r="26" fill="${C.sky}"/><circle cx="240" cy="84" r="11" fill="${SKIN[1]}"/><path d="M220 112q20 -24 40 0z" fill="${C.blue}"/><rect x="280" y="74" width="100" height="10" rx="5" fill="${C.ink}" opacity=".6"/><rect x="280" y="94" width="70" height="7" rx="3" fill="${C.ink}" opacity=".3"/>${[140, 200, 260].map((y) => `<rect x="215" y="${y}" width="60" height="9" rx="4" fill="${C.green}"/><rect x="215" y="${y + 18}" width="170" height="6" rx="3" fill="${C.light}"/><rect x="215" y="${y + 32}" width="130" height="6" rx="3" fill="${C.light}"/>`).join('')}`)
    + pencil(450, 230, 1) + tick(480, 100, 24))],
  ['skills-and-careers/finding-work/looking-for-work/02-preparing-for-an-interview', 'A job seeker shaking hands with an interviewer across a desk.', svg(BG.skills,
    table(320, 250, 360, C.brown) + person(200, 340, { hands: [[-30, -66], [110, -150]], skin: SKIN[3], shirt: C.blue, pants: C.ink }) + person(440, 340, { hands: [[-110, -150], [30, -66]], skin: SKIN[2], shirt: C.plum, long: true })
    + doc(370, 236, 50, 30, 2) + clock(560, 80, 26) + `<circle cx="320" cy="190" r="10" fill="${SKIN[2]}"/>`)],
  ['skills-and-careers/finding-work/looking-for-work/03-spotting-job-scams', 'A phone showing a job offer that asks for money, crossed out, with a warning sign.', svg(BG.skills,
    phone(260, 180, 2.6, C.white) + note$(260, 150, 80, 40) + `<rect x="210" y="190" width="100" height="10" rx="5" fill="${C.light}"/><rect x="210" y="210" width="70" height="10" rx="5" fill="${C.light}"/>` + cross(330, 100, 30) + warn(470, 170, 1.6) + magnifier(450, 290, 0.9))],
  ['skills-and-careers/starting-a-business/small-business-basics/01-testing-a-business-idea', 'A small food stall owner asking customers what they would buy, before spending much money.', svg(BG.skills,
    ground(300, '#d8d0e6') + shop(200, 300, 1) + person(420, 320, { pose: 'hold', skin: SKIN[0], shirt: C.coral, headwrap: C.green, dress: true }) + doc(420, 220, 46, 60, 3) + person(540, 320, { skin: SKIN[2], shirt: C.blue, s: 0.95 })
    + bubble(560, 80, 90, 56, C.white, 'left', tick(560, 80, 16)))],
  ['skills-and-careers/starting-a-business/small-business-basics/02-keeping-simple-business-records', 'A notebook of daily sales and costs next to a cash box and receipts.', svg(BG.skills,
    table(320, 260, 560, C.brown) + book(270, 200, 240, 110, C.green) + `<path d="M170 210h70M300 210h70M170 230h50M300 230h60" stroke="${C.light}" stroke-width="6" stroke-linecap="round"/><path d="M170 186h20M300 186h20" stroke="${C.green}" stroke-width="6" stroke-linecap="round"/><path d="M220 180l6 -8l6 8M350 172l6 8l6 -8" stroke="${C.ochre}" stroke-width="4" fill="none"/>`
    + lockbox(500, 250, 0.9) + doc(110, 240, 50, 60, 3) + doc(90, 230, 50, 60, 3) + coins(500, 140, 3))],
  ['skills-and-careers/starting-a-business/small-business-basics/03-registering-a-business', 'A small business owner registering online, receiving an official certificate.', svg(BG.skills,
    table(320, 260, 540, C.brown) + laptop(220, 260, 1.4) + tick(220, 190, 22) + doc(450, 180, 160, 130, 3, shield(450, 200, 0.6, C.gold) + `<circle cx="490" cy="220" r="14" fill="${C.red}"/>`))],
  // Home & family
  ['home-and-family/safety-at-home/a-safer-home/01-using-paraffin-safely', 'A paraffin lamp standing on a steady table well away from the curtains, with the paraffin in a closed bottle on a high shelf, out of children\'s reach.', svg(BG.home,
    `<rect x="40" y="40" width="130" height="200" fill="${C.sky}"/><path d="M40 40q20 100 0 200M170 40q-20 100 0 200" stroke="${C.coral}" stroke-width="18" fill="none"/>` + table(330, 240, 260, C.brown) + lamp(330, 240, 1.4)
    + `<rect x="470" y="100" width="140" height="10" fill="${C.brown}"/>` + bottle(540, 100, 0.9, C.gold) + `<rect x="526" y="56" width="28" height="14" fill="${C.white}"/>` + `<path d="M190 170h90" stroke="${C.green}" stroke-width="4" stroke-dasharray="8 8"/><path d="M196 160l-10 10l10 10M274 160l10 10l-10 10" stroke="${C.green}" stroke-width="4" fill="none"/>` + child(560, 340, { skin: SKIN[1], shirt: C.leaf, pants: C.blue }))],
  ['home-and-family/safety-at-home/a-safer-home/02-first-aid-for-burns', 'Cooling a burnt hand under cool running water from a tap for twenty minutes.', svg(BG.home,
    tap(250, 80, 1.6) + `<path d="M300 130v150" stroke="${C.waterLight}" stroke-width="22" stroke-linecap="round" opacity=".9"/>` + `<rect x="60" y="222" width="190" height="44" rx="20" fill="${C.blue}"/><rect x="230" y="216" width="90" height="56" rx="24" fill="${SKIN[1]}"/>${[0, 1, 2, 3].map((i) => `<rect x="300" y="${218 + i * 13}" width="${52 - Math.abs(i - 1.2) * 6}" height="12" rx="6" fill="${SKIN[1]}" stroke="${darken(SKIN[1])}" stroke-width="1.5"/>`).join("")}<rect x="250" y="200" width="44" height="14" rx="7" fill="${SKIN[1]}" transform="rotate(-20 272 207)"/><ellipse cx="300" cy="236" rx="14" ry="10" fill="${C.coral}" opacity=".6"/>` + drop(250, 300, 0.5) + drop(350, 300, 0.5)
    + `<rect x="120" y="290" width="360" height="40" rx="10" fill="${C.light}"/>` + clock(520, 120, 46, 0, 120))],
  ['home-and-family/safety-at-home/a-safer-home/03-electrical-safety-at-home', 'A wall socket with one plug in it, and an overloaded multi-plug crossed out.', svg(BG.home,
    socket(170, 150, 1.4) + `<rect x="150" y="190" width="40" height="40" rx="6" fill="${C.ink}"/><path d="M170 230v80" stroke="${C.ink}" stroke-width="7"/>` + tick(250, 90, 22)
    + `<rect x="360" y="230" width="200" height="40" rx="8" fill="${C.white}" stroke="${C.ink}" stroke-width="3"/>` + [380, 420, 460, 500, 540].map((x) => `<rect x="${x - 8}" y="200" width="22" height="34" rx="4" fill="${C.ink}"/><path d="M${x + 3} 200v-${40 + (x % 3) * 10}" stroke="${C.ink}" stroke-width="5"/>`).join('') + flame(460, 220, 0.6) + cross(580, 110, 26) + bolt(320, 100, 0.8))],
  ['home-and-family/family-life/raising-children/01-positive-discipline', 'A father kneeling to talk calmly with his child, eye to eye.', svg(BG.home,
    ground(300, '#ead2c4') + person(260, 300, { s: 0.8, hands: [[30, -100], [60, -90]], skin: SKIN[3], shirt: C.blue, pants: C.ink }) + child(400, 300, { pose: 'down', skin: SKIN[3], shirt: C.gold, pants: C.coral, sad: false })
    + hearts(330, 80) + bubble(200, 80, 90, 50, C.white, 'right', dots(200, 80)))],
  ['home-and-family/family-life/raising-children/02-the-child-support-grant', 'A caregiver with a child applying at a SASSA office with a birth certificate and an ID.', svg(BG.home,
    ground(300, '#ead2c4') + building(470, 300, 0.95, C.cream) + person(200, 300, { pose: 'holdR', skin: SKIN[0], shirt: C.coral, headwrap: C.blue, dress: true }) + child(130, 300, { skin: SKIN[0], shirt: C.gold, pants: C.blue, pose: 'down' })
    + doc(236, 196, 40, 50, 3) + idCard(300, 80, 0.5))],
  // South Africa
  ['south-africa/documents-and-voting/your-documents/01-registering-a-birth', 'A parent with a newborn baby at a Home Affairs office, receiving a birth certificate.', svg(BG.sa,
    ground(300, '#cfdcd2') + table(420, 220, 260, C.brown) + person(500, 300, { pose: 'holdL', skin: SKIN[2], shirt: C.white, pants: C.green, long: true }) + doc(420, 186, 70, 60, 3, shield(420, 196, 0.3, C.gold))
    + person(220, 300, { pose: 'hold', hands: [[-10, -104], [26, -100]], skin: SKIN[0], shirt: C.plum, headwrap: C.gold, dress: true }) + baby(232, 200, SKIN[0]) + hearts(110, 90))],
  ['south-africa/documents-and-voting/your-documents/02-getting-your-id', 'A young person holding up their new smart ID card.', svg(BG.sa,
    ground(300, '#cfdcd2') + person(200, 300, { hands: [[-30, -66], [52, -150]], skin: SKIN[1], shirt: C.teal, pants: C.blue }) + idCard(380, 140, 1.1) + flag(560, 300, 0.8))],
  ['south-africa/documents-and-voting/your-documents/03-registering-to-vote', 'A voter putting a ballot paper into a ballot box, with the South African flag.', svg(BG.sa,
    ground(300, '#cfdcd2') + `<rect x="270" y="210" width="140" height="90" fill="${C.brown}"/>` + ballotBox(340, 210, 1) + person(180, 300, { hands: [[-30, -66], [82, -160]], skin: SKIN[3], shirt: C.coral, headwrap: C.green, dress: true }) + `<rect x="246" y="118" width="30" height="40" fill="${C.white}" stroke="${C.ink}" stroke-width="2" transform="rotate(20 261 138)"/>` + flag(540, 300, 1))],
  ['south-africa/your-rights/knowing-your-rights/01-your-rights-in-the-constitution', 'An open Constitution book with the scales of justice, above people of different ages standing together.', svg(BG.sa,
    ground(300, '#cfdcd2') + book(320, 110, 190, 110, C.green) + scale(320, 120, 0.35) + people([[120, 320, { skin: SKIN[0], shirt: C.coral, pose: 'wave', s: 0.9 }], [220, 320, { skin: SKIN[3], shirt: C.blue, long: true, s: 0.85 }], [420, 320, { skin: SKIN[4], shirt: C.gold, s: 0.9 }], [520, 320, { skin: SKIN[2], shirt: C.plum, headwrap: C.green, dress: true, s: 0.9 }]]) + child(320, 320, { skin: SKIN[1], shirt: C.leaf, pants: C.blue }))],
  ['south-africa/your-rights/knowing-your-rights/02-getting-help-with-a-rights-problem', 'A person getting free advice from a legal adviser, with the scales of justice.', svg(BG.sa,
    table(320, 250, 360, C.brown) + person(200, 340, { pose: 'hold', skin: SKIN[0], shirt: C.coral, headwrap: C.gold, dress: true }) + person(450, 340, { pose: 'pointL', hands: [[-80, -120], [30, -66]], skin: SKIN[2], shirt: C.ink, pants: C.ink })
    + doc(320, 226, 70, 40, 2) + scale(560, 230, 0.7) + bubble(320, 80, 100, 56, C.white, 'right', tick(320, 80, 18)))],
]

const only = process.argv[2]
let total = 0
for (const [page, alt, picture] of PAGES) {
  if (only && !page.includes(only)) continue
  const svgFile = join(CONTENT, `${page}.svg`)
  writeFileSync(svgFile, picture)
  total += picture.length
  const mdFile = join(CONTENT, `${page}.md`)
  const name = page.split('/').pop()
  let text = readFileSync(mdFile, 'utf8').replace(/\r\n/g, '\n')
  const line = `![${alt}](${name}.svg)`
  if (text.includes(`](${name}.svg)`)) text = text.replace(new RegExp(`!\\[[^\\]]*\\]\\(${name}\\.svg\\)`), line)
  else {
    // After the first paragraph of the text (not a heading).
    const end = text.indexOf('\n---\n', 4) + 5
    const blocks = text.slice(end).split(/\n\n/)
    const at = blocks.findIndex((block) => block.trim() && !block.startsWith('#'))
    blocks.splice(at + 1, 0, line)
    text = text.slice(0, end) + blocks.join('\n\n')
  }
  writeFileSync(mdFile, text)
}
console.log(PAGES.length, 'pages,', Math.round(total / 1024), 'KiB of pictures')
