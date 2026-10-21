import { tmpdir } from 'node:os'
import type { Browser } from 'playwright-core'
import { launchBrowser, openPage } from '../driver.js'
import { PagereelError } from '../errors.js'
import { type Progress, type RenderOptions, resolveOptions } from '../options.js'
import { detectMode } from '../render.js'
import { resolveSource } from '../serve.js'
import { collect } from './collect.js'
import {
  audioRule,
  clippedRule,
  contrastRule,
  deadAirRule,
  flashRule,
  formatRule,
  hookRule,
  IG_REEL,
  readingTimeRule,
  safeZoneRule,
  textSizeRule,
} from './rules.js'
import type { CheckReport, Finding, Target } from './types.js'

export interface CheckOptions {
  /** URL or path to an HTML file. */
  source: string
  /** `'ig-reel'` (default) adds the Instagram format and safe-zone checks. */
  target?: Target
  /** Audio file or URL to measure. Default: the scene's `window.pagereel.audio`. */
  audio?: string
  /** Seconds. Required in clock mode. */
  duration?: number
  /** `'1080x1920'` or `{ width, height }`: the viewport. */
  size?: RenderOptions['size']
  fps?: number
  /** Scale the reel will be rendered at, for the format check; the page is checked at 1. */
  scale?: number
  mode?: RenderOptions['mode']
  seed?: number
  epoch?: number
  /** Folder served for a local file. Default: the file's folder. */
  root?: string
  onProgress?: (p: Progress) => void
}

const TARGETS: Target[] = ['ig-reel', 'none']
/** Type is judged as if the frame's short side were this many pixels. */
const SHORT_SIDE = 1080
const NO_TEXT =
  'No DOM text found, so safe-zone, size, clipping, reading-time and contrast checks did not run.'

/** Lints a reel: walks the page's timeline and reports what would go wrong on a phone. */
export async function check(input: CheckOptions): Promise<CheckReport> {
  const started = Date.now()
  const target = input.target ?? 'ig-reel'
  if (!TARGETS.includes(target)) {
    throw new PagereelError(`Unknown target ${target}. Use ${TARGETS.join(' or ')}.`)
  }
  const scale = input.scale ?? 1
  if (!(scale > 0)) throw new PagereelError('Scale must be more than 0.')
  const source = await resolveSource(input.source, input.root)
  let browser: Browser | undefined
  try {
    browser = await launchBrowser()
    const { mode, scene } = await detectMode(browser, source.url, input.mode)
    const o = resolveOptions({ ...input, scale: 1, format: 'png', output: tmpdir() }, mode, scene)
    const driver = await openPage(browser, source.url, o)
    let collected: Awaited<ReturnType<typeof collect>>
    try {
      collected = await collect(driver, o, input.onProgress)
    } finally {
      await driver.close()
    }
    const { frames, samples, step } = collected

    const width = Math.round(o.width * scale)
    const height = Math.round(o.height * scale)
    const duration = o.to
    const notes: string[] = []
    const findings: Finding[] = formatRule({ width, height, duration, target })
    if (samples.some((s) => s.boxes.length > 0)) {
      const k = SHORT_SIDE / Math.min(o.width, o.height)
      if (target === 'ig-reel') {
        const aspect = (o.width * IG_REEL.height) / (o.height * IG_REEL.width)
        if (Math.abs(aspect - 1) <= 0.01) findings.push(...safeZoneRule(samples, step, k, duration))
        else
          notes.push(
            `The page is ${o.width}×${o.height}, not 9:16, so the safe-zone check did not run.`,
          )
      }
      findings.push(
        ...textSizeRule(samples, step, k, duration),
        ...clippedRule(samples, step, duration),
        ...readingTimeRule(samples, step, duration),
        ...contrastRule(samples, step, duration),
      )
    } else {
      notes.push(NO_TEXT)
    }
    findings.push(
      ...hookRule(frames),
      ...deadAirRule(frames, o.fps),
      ...flashRule(frames, o.fps),
      ...audioRule(null),
    )
    findings.sort((a, b) =>
      a.severity === b.severity ? a.from - b.from : a.severity === 'error' ? -1 : 1,
    )
    const errors = findings.filter((f) => f.severity === 'error').length
    return {
      source: input.source,
      target,
      width,
      height,
      duration,
      fps: o.fps,
      findings,
      errors,
      warnings: findings.length - errors,
      notes,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    }
  } finally {
    await browser?.close().catch(() => {})
    await source.close()
  }
}
