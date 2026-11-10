/**
 * WCAG contrast check for every theme.
 *
 * Themes are plain data, so they are easy to get subtly wrong: a colour that
 * reads well on a dark surface usually fails on a light one. This walks the
 * pairs the UI actually renders and reports anything under its target.
 *
 *   npm run themes:check
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'out/themes')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'themes.mjs')

await build({
  entryPoints: [join(root, 'src/shared/themes.ts')],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  outfile: outFile,
  logLevel: 'warning'
})

const { THEMES } = await import(pathToFileURL(outFile).href)

/* ---------------- colour maths ---------------- */

function parse(colour) {
  const hex = colour.trim()
  if (hex.startsWith('#')) {
    const v = hex.slice(1)
    const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
    ]
  }
  const m = hex.match(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  throw new Error(`cannot parse colour: ${colour}`)
}

/** flatten a translucent colour onto an opaque backdrop */
function over(fg, bg) {
  const [r, g, b, a] = parse(fg)
  if (a >= 1) return [r, g, b]
  const [br, bg_, bb] = parse(bg)
  return [r * a + br * (1 - a), g * a + bg_ * (1 - a), b * a + bb * (1 - a)]
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(fg, bg) {
  const a = luminance(over(fg, bg))
  const b = luminance(over(bg, bg))
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/* ---------------- the pairs the UI renders ---------------- */

function pairsFor(t) {
  const surfaces = [
    ['base', t.base],
    ['surface', t.surface],
    ['raised', t.raised]
  ]
  const pairs = []

  for (const [name, bg] of surfaces) {
    pairs.push(['ink', t.ink, name, bg, 4.5])
    pairs.push(['inkDim', t.inkDim, name, bg, 4.5])
    // small meta labels; AA large-text threshold
    pairs.push(['inkFaint', t.inkFaint, name, bg, 3])
  }

  // coloured text sits on panels
  for (const key of ['accentBright', 'runBright', 'info', 'warn', 'danger', 'root']) {
    pairs.push([key, t[key], 'surface', t.surface, 4.5])
  }

  // filled primary button
  pairs.push(['onAccent', t.onAccent, 'accent', t.accent, 4.5])

  // Hairlines are deliberately quiet. What matters for telling controls apart
  // is that the surface steps are perceptible, so check those as well.
  pairs.push(['line', t.line, 'surface', t.surface, 1.12])
  pairs.push(['edge', t.edge, 'surface', t.surface, 1.35])
  pairs.push(['surface', t.surface, 'base', t.base, 1.04])
  pairs.push(['void (input fill)', t.void, 'surface', t.surface, 1.04])
  pairs.push(['hover', t.hover, 'surface', t.surface, 1.08])

  // the terminal
  pairs.push(['term fg', t.__termFg, 'term bg', t.__termBg, 7])

  return pairs
}

/* ---------------- run ---------------- */

let failures = 0
let warnings = 0

for (const theme of THEMES) {
  const t = { ...theme.tokens, __termFg: theme.terminal.foreground, __termBg: theme.terminal.background }
  const rows = []

  for (const [fgName, fg, bgName, bg, target] of pairsFor(t)) {
    const r = ratio(fg, bg)
    const ok = r >= target
    if (!ok) {
      if (target >= 4.5) failures++
      else warnings++
    }
    rows.push({ fgName, bgName, r, target, ok })
  }

  const bad = rows.filter((row) => !row.ok)
  const flag = bad.length === 0 ? 'ok  ' : 'FAIL'
  console.log(`\n${flag} ${theme.label.padEnd(16)} (${theme.mode})`)
  if (bad.length === 0) {
    const worst = rows.reduce((a, b) => (a.r < b.r ? a : b))
    console.log(`     all ${rows.length} pairs pass; tightest is ${worst.fgName} on ${worst.bgName} at ${worst.r.toFixed(2)}:1`)
  } else {
    for (const row of bad) {
      console.log(
        `     ${row.fgName} on ${row.bgName}: ${row.r.toFixed(2)}:1, wants ${row.target}:1`
      )
    }
  }
}

console.log(`\n${failures} contrast failures, ${warnings} soft warnings`)
process.exit(failures > 0 ? 1 : 0)
