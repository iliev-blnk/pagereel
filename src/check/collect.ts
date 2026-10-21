import { PNG } from 'pngjs'
import type { Driver } from '../driver.js'
import type { Progress, Resolved } from '../options.js'
import { PROBE_JS } from '../page/generated.js'
import type { ProbedBox } from '../page/probe.js'
import type { FrameStat, TextBox, TextSample } from './types.js'

/** Frame statistics come from captures this many pixels wide. */
const STAT_WIDTH = 135
/** Contrast is measured on captures this many pixels wide: half of a 1080 stage. */
const CONTRAST_WIDTH = 540
const SAMPLE_SECONDS = 0.25
/** Pixels this close (RGB distance) to the text colour are the glyphs, not what is behind them. */
const GLYPH_DISTANCE = 12
/** Below this share of non-glyph pixels the text sits on its own colour. */
const MIN_BACKGROUND = 0.25
/** Smallest box, in capture pixels, worth measuring. */
const MIN_BOX = 4
/** Fill alpha from which text counts as solid. */
const SOLID = 0.95

/** sRGB 0–255 to linear light 0–1. */
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

/** WCAG relative luminance of an sRGB colour. */
const luminance = (r: number, g: number, b: number) =>
  0.2126 * (LINEAR[r] ?? 0) + 0.7152 * (LINEAR[g] ?? 0) + 0.0722 * (LINEAR[b] ?? 0)

/** Standard deviation of one RGB channel (0 red, 1 green, 2 blue), and its mean absolute change from `prev`. */
function channel(data: Buffer, prev: Buffer | undefined, c: number): { std: number; diff: number } {
  const n = data.length / 4
  let sum = 0
  let squares = 0
  let change = 0
  for (let p = c; p < data.length; p += 4) {
    const v = data[p] ?? 0
    sum += v
    squares += v * v
    if (prev) change += Math.abs(v - (prev[p] ?? 0))
  }
  const mean = sum / n
  return { std: Math.sqrt(Math.max(0, squares / n - mean * mean)), diff: change / n }
}

/**
 * Spread and change are taken per RGB channel and the largest counts: never less than in
 * luma, the same for greys, and a colour moving over a background just as bright still moves.
 */
function frameStat(data: Buffer, t: number, prev?: Buffer): FrameStat {
  let light = 0
  for (let p = 0; p < data.length; p += 4) {
    light += luminance(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0)
  }
  const rgb = [0, 1, 2].map((c) => channel(data, prev, c))
  return {
    t,
    mean: light / (data.length / 4),
    std: Math.max(...rgb.map((x) => x.std)),
    diff: prev ? Math.max(...rgb.map((x) => x.diff)) : 0,
  }
}

/**
 * WCAG contrast between a box's text colour and the median luminance of the pixels behind
 * its glyphs, or undefined when the box is too small to measure.
 */
function contrastOf(png: PNG, box: TextBox, scale: number): number | undefined {
  const x0 = Math.max(0, Math.floor(box.x * scale))
  const y0 = Math.max(0, Math.floor(box.y * scale))
  const x1 = Math.min(png.width, Math.ceil((box.x + box.w) * scale))
  const y1 = Math.min(png.height, Math.ceil((box.y + box.h) * scale))
  if (x1 - x0 < MIN_BOX || y1 - y0 < MIN_BOX) return undefined
  const [tr, tg, tb] = box.color
  const all = new Float64Array((x1 - x0) * (y1 - y0))
  const behind = new Float64Array(all.length)
  let count = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * png.width + x) * 4
      const r = png.data[p] ?? 0
      const g = png.data[p + 1] ?? 0
      const b = png.data[p + 2] ?? 0
      const l = luminance(r, g, b)
      all[n++] = l
      if ((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2 > GLYPH_DISTANCE ** 2) behind[count++] = l
    }
  }
  const pool = count >= MIN_BACKGROUND * n ? behind.subarray(0, count) : all
  const back = pool.sort()[pool.length >> 1] ?? 0
  const text = luminance(tr, tg, tb)
  return (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05)
}

/**
 * Walks every frame of the timeline: a small capture per frame for the motion and flash
 * checks, and every `step` seconds the DOM text with its measured contrast.
 */
export async function collect(
  driver: Driver,
  o: Resolved,
  onProgress?: (p: Progress) => void,
): Promise<{ frames: FrameStat[]; samples: TextSample[]; step: number }> {
  await driver.evaluate(PROBE_JS)
  const total = Math.round(o.to * o.fps)
  const every = Math.max(1, Math.round(SAMPLE_SECONDS * o.fps))
  const statScale = STAT_WIDTH / o.width
  const contrastScale = CONTRAST_WIDTH / o.width
  const frames: FrameStat[] = []
  const samples: TextSample[] = []
  let prev: Buffer | undefined
  for (let i = 0; i < total; i++) {
    const t = i / o.fps
    await driver.goto(t, i)
    const { data } = PNG.sync.read(await driver.capture(statScale))
    frames.push(frameStat(data, t, prev))
    prev = data
    if (i % every === 0) {
      const probed = await driver.evaluate<ProbedBox[]>('window.__pagereelProbe()')
      const png = probed.length ? PNG.sync.read(await driver.capture(contrastScale)) : undefined
      samples.push({
        t,
        boxes: probed.map(({ fill, ...box }) => {
          const contrast = png && fill >= SOLID ? contrastOf(png, box, contrastScale) : undefined
          return contrast === undefined ? box : { ...box, contrast }
        }),
      })
    }
    onProgress?.({ frame: i + 1, total })
  }
  return { frames, samples, step: every / o.fps }
}
