import { cpus } from 'node:os'
import { extname, resolve } from 'node:path'
import type { Mode, SceneInfo } from './driver.js'
import { PagereelError } from './errors.js'

export type Format = 'mp4' | 'webm' | 'gif' | 'png'

export interface Progress {
  frame: number
  total: number
}

export interface RenderOptions {
  /** URL or path to an HTML file. */
  source: string
  /** Output file; a directory for `png`. Default `pagereel.<format>`. */
  output?: string
  /** Seconds. Required in clock mode. */
  duration?: number
  /** `'1280x720'` or `{ width, height }`. */
  size?: string | { width: number; height: number }
  fps?: number
  /** Device scale factor: output is size × scale. */
  scale?: number
  from?: number
  to?: number
  workers?: number
  /** Audio file or URL to mux in. */
  audio?: string
  transparent?: boolean
  format?: Format
  mode?: 'auto' | Mode
  /** Seed for Math.random in clock mode. */
  seed?: number
  /** Wall-clock time (ms) the page sees at t=0 in clock mode. */
  epoch?: number
  /** Folder served for a local file. Default: the file's folder. */
  root?: string
  signal?: AbortSignal
  onProgress?: (p: Progress) => void
}

export interface Resolved {
  mode: Mode
  format: Format
  output: string
  width: number
  height: number
  scale: number
  fps: number
  from: number
  to: number
  workers: number
  audio?: string
  transparent: boolean
  seed: number
  epoch: number
}

const FORMATS: Format[] = ['mp4', 'webm', 'gif', 'png']

export function parseSize(
  size: RenderOptions['size'],
): { width: number; height: number } | undefined {
  if (size === undefined) return undefined
  const [w, h] =
    typeof size === 'string' ? size.toLowerCase().split('x').map(Number) : [size.width, size.height]
  if (!Number.isInteger(w) || !Number.isInteger(h) || !w || !h || w < 1 || h < 1) {
    throw new PagereelError(`Size must look like 1280x720, got ${JSON.stringify(size)}.`)
  }
  return { width: w, height: h }
}

export function formatOf(output?: string, format?: Format): Format {
  if (format) {
    if (!FORMATS.includes(format))
      throw new PagereelError(`Unknown format ${format}. Use ${FORMATS.join(', ')}.`)
    return format
  }
  const ext = output ? extname(output).slice(1).toLowerCase() : ''
  if (!ext) return 'mp4'
  if (FORMATS.includes(ext as Format)) return ext as Format
  throw new PagereelError(
    `Cannot tell the format from ${output}. Use .mp4, .webm, .gif, or --format png.`,
  )
}

/** Checks that need no browser: run before launching anything. */
export function precheck(input: RenderOptions): Format {
  const format = formatOf(input.output, input.format)
  if (input.transparent && (format === 'mp4' || format === 'gif')) {
    throw new PagereelError(
      `${format.toUpperCase()} cannot be transparent. Use --format webm or png.`,
    )
  }
  const size = parseSize(input.size)
  if (size) checkEven(format, size.width, size.height, input.scale ?? 1)
  return format
}

export function checkEven(format: Format, width: number, height: number, scale: number) {
  if (format !== 'mp4' && format !== 'webm') return
  const w = width * scale
  const h = height * scale
  if (w % 2 || h % 2) {
    throw new PagereelError(
      `${format.toUpperCase()} needs an even width and height; ${w}x${h} is not. Try ${w + (w % 2)}x${h + (h % 2)}.`,
    )
  }
}

export function resolveOptions(input: RenderOptions, mode: Mode, scene: SceneInfo): Resolved {
  const format = precheck(input)
  const duration = input.duration ?? scene.duration
  if (duration === undefined) {
    throw new PagereelError('Clock-mode pages need --duration (seconds).')
  }
  const fps = input.fps ?? scene.fps ?? 30
  const size =
    parseSize(input.size) ??
    (scene.width && scene.height
      ? { width: scene.width, height: scene.height }
      : { width: 1280, height: 720 })
  const scale = input.scale ?? 1
  const from = input.from ?? 0
  const to = input.to ?? duration
  if (!(duration > 0)) throw new PagereelError('Duration must be more than 0 seconds.')
  if (!(fps > 0)) throw new PagereelError('fps must be more than 0.')
  if (!(scale > 0)) throw new PagereelError('Scale must be more than 0.')
  if (from < 0 || to <= from || to > duration + 1e-9) {
    throw new PagereelError(`--from and --to must satisfy 0 ≤ from < to ≤ ${duration}.`)
  }
  checkEven(format, size.width, size.height, scale)
  const frames = Math.round(to * fps) - Math.round(from * fps)
  const workers = Math.max(
    1,
    Math.min(input.workers ?? Math.min(6, Math.max(1, cpus().length - 1)), frames),
  )
  const audio = input.audio
    ? /^https?:\/\//.test(input.audio)
      ? input.audio
      : resolve(input.audio)
    : scene.audio
  return {
    mode,
    format,
    output: resolve(input.output ?? (format === 'png' ? 'pagereel-frames' : `pagereel.${format}`)),
    width: size.width,
    height: size.height,
    scale,
    fps,
    from,
    to,
    workers,
    audio,
    transparent: input.transparent ?? false,
    seed: input.seed ?? 1,
    epoch: input.epoch ?? Date.now(),
  }
}

/** Splits frames [first, last) into contiguous slices that differ in size by at most one. */
export function splitSlices(first: number, last: number, workers: number): Array<[number, number]> {
  const total = last - first
  const n = Math.max(1, Math.min(workers, total))
  const slices: Array<[number, number]> = []
  let start = first
  for (let i = 0; i < n; i++) {
    const size = Math.floor(total / n) + (i < total % n ? 1 : 0)
    slices.push([start, start + size])
    start += size
  }
  return slices
}
