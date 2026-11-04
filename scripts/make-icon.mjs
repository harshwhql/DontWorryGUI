/**
 * Draws the DontWorryGUI app mark and writes resources/icon.ico.
 *
 * Pure Node, no image libraries. Each size is rendered from the same vector
 * description with 4×4 supersampling, encoded as PNG, and packed into an ICO
 * container (PNG-compressed entries, which Windows has supported since Vista).
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const SIZES = [256, 128, 64, 48, 32, 16]

/* ------------------------------------------------------------------ *
 * colours (match the app's design tokens)
 * ------------------------------------------------------------------ */
const BG_TOP = [18, 26, 43] // #121a2b
const BG_BOTTOM = [8, 11, 20] // #080b14
const EDGE = [42, 55, 84] // #2a3754
const GREEN = [52, 211, 153] // #34d399
const GREEN_DIM = [16, 185, 129] // #10b981

/* ------------------------------------------------------------------ *
 * signed distance helpers, all in a 0..1 unit square
 * ------------------------------------------------------------------ */

function sdRoundedBox(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r
  const qy = Math.abs(py) - halfH + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h)
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ]
}

/**
 * Colour at a point in the unit square, or null for transparent.
 * The mark: a rounded dark tile, a green ">" prompt chevron and a caret bar.
 */
function sample(x, y) {
  const px = x - 0.5
  const py = y - 0.5

  const tile = sdRoundedBox(px, py, 0.5, 0.5, 0.215)
  if (tile > 0) return null

  // background gradient, lighter at the top
  let rgb = mix(BG_TOP, BG_BOTTOM, Math.min(1, Math.max(0, y * 1.15)))

  // inner edge highlight
  if (tile > -0.018) rgb = mix(rgb, EDGE, 0.75)

  // ">" chevron
  const stroke = 0.062
  const chevron = Math.min(
    sdSegment(x, y, 0.3, 0.285, 0.545, 0.5),
    sdSegment(x, y, 0.545, 0.5, 0.3, 0.715)
  )
  if (chevron < stroke) {
    const glow = Math.min(1, Math.max(0, (stroke - chevron) / stroke))
    return mix(GREEN_DIM, GREEN, 0.35 + glow * 0.65)
  }

  // caret / underscore bar
  const bar = sdRoundedBox(x - 0.685, y - 0.69, 0.115, 0.03, 0.03)
  if (bar < 0) return GREEN

  // soft glow around the glyph so it reads at small sizes
  if (chevron < stroke * 1.55) {
    const t = 1 - (chevron - stroke) / (stroke * 0.55)
    return mix(rgb, GREEN_DIM, t * 0.28)
  }

  return rgb
}

/* ------------------------------------------------------------------ *
 * rasteriser
 * ------------------------------------------------------------------ */

function render(size) {
  const samples = 4
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size
          const v = (y + (sy + 0.5) / samples) / size
          const colour = sample(u, v)
          if (!colour) continue
          r += colour[0]
          g += colour[1]
          b += colour[2]
          hits++
        }
      }

      const total = samples * samples
      const offset = (y * size + x) * 4
      if (hits === 0) continue
      pixels[offset] = Math.round(r / hits)
      pixels[offset + 1] = Math.round(g / hits)
      pixels[offset + 2] = Math.round(b / hits)
      pixels[offset + 3] = Math.round((hits / total) * 255)
    }
  }

  return pixels
}

/* ------------------------------------------------------------------ *
 * PNG encoding
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // one filter byte (none) per scanline
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ------------------------------------------------------------------ *
 * ICO container
 * ------------------------------------------------------------------ */

function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const entry = index * 16
    directory[entry] = image.size >= 256 ? 0 : image.size
    directory[entry + 1] = image.size >= 256 ? 0 : image.size
    directory[entry + 2] = 0 // palette size
    directory[entry + 3] = 0 // reserved
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32BE(0, entry + 8)
    directory.writeUInt32LE(image.png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.png.length
  })

  return Buffer.concat([header, directory, ...images.map((image) => image.png)])
}

/* ------------------------------------------------------------------ *
 * go
 * ------------------------------------------------------------------ */

const images = SIZES.map((size) => ({ size, png: encodePng(render(size), size) }))

const resources = join(root, 'resources')
mkdirSync(resources, { recursive: true })

const icoPath = join(resources, 'icon.ico')
writeFileSync(icoPath, encodeIco(images))

// a standalone PNG is handy for Linux packaging and documentation
const pngPath = join(resources, 'icon.png')
writeFileSync(pngPath, images[0].png)

mkdirSync(dirname(icoPath), { recursive: true })
console.log(`wrote ${icoPath} (${SIZES.join(', ')} px)`)
console.log(`wrote ${pngPath} (256 px)`)
