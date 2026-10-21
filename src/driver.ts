import { setTimeout as wait } from 'node:timers/promises'
import { type Browser, chromium, type Page } from 'playwright-core'
import { findChrome } from './env.js'
import { PagereelError } from './errors.js'
import { CLOCK_JS } from './page/generated.js'

export type Mode = 'scene' | 'clock'

/** What the injected clock (src/page/clock.ts) adds to the page. */
interface ClockWindow {
  __pagereel?: { advanceTo(ms: number, stepMs: number): Promise<void> }
}

export interface SceneInfo {
  duration?: number
  fps?: number
  width?: number
  height?: number
  loop?: boolean
  /** Absolute URL of the scene's audio track. */
  audio?: string
}

export interface OpenOptions {
  mode: Mode
  width: number
  height: number
  scale: number
  fps: number
  transparent: boolean
  seed: number
  epoch: number
}

export interface Driver {
  /** Show time `t` (seconds). Clock mode only moves forward. */
  goto(t: number, frame?: number): Promise<void>
  /** PNG of the viewport at width·scale × height·scale; `scale` overrides the page's own. */
  capture(scale?: number): Promise<Buffer>
  /** Runs a script in the page and returns its completion value. */
  evaluate<T>(js: string): Promise<T>
  close(): Promise<void>
}

export function launchBrowser({ headless = true }: { headless?: boolean } = {}): Promise<Browser> {
  return chromium.launch({
    executablePath: findChrome(),
    headless,
    args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--hide-scrollbars'],
  })
}

const firstLine = (err: unknown) =>
  String(err instanceof Error ? err.message : err)
    .replace(/^page\.evaluate: /, '')
    .replace(/^Error: /, '')
    .split('\n')[0] ?? ''

/**
 * Runs `fn`, and while it fails with an error `transient` accepts, runs it again after each
 * of `delays` (ms) in turn. Rethrows the last error.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  transient: (err: unknown) => boolean,
  delays: readonly number[],
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (err) {
      const delay = delays[i]
      if (delay === undefined || !transient(err)) throw err
      await wait(delay)
    }
  }
}

/** Chromium now and then fails a screenshot, most often the first one after a page loads. */
const CAPTURE_RETRIES = [50, 150, 400]
const failedCapture = (err: unknown) => firstLine(err).includes('Unable to capture screenshot')

async function load(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'load' })
  } catch (err) {
    throw new PagereelError(`Could not load ${url}: ${firstLine(err).replace(/^page\.goto: /, '')}`)
  }
  // No waitForFunction here: in clock mode its polling would use the page's
  // virtual timers, which do not run until pagereel advances them.
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images, (img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true })
              img.addEventListener('error', resolve, { once: true })
            }),
      ),
    )
  })
}

/** Opens the page once without the clock and looks for `window.pagereel.seek`. */
export async function detect(
  browser: Browser,
  url: string,
): Promise<{ mode: Mode; scene: SceneInfo }> {
  const page = await browser.newPage()
  try {
    await load(page, url)
    const scene = await page.evaluate(async () => {
      const p = (window as { pagereel?: Record<string, unknown> }).pagereel
      if (!p || typeof p.seek !== 'function') return null
      await p.ready
      const info: Record<string, unknown> = {}
      for (const k of ['duration', 'fps', 'width', 'height']) {
        if (typeof p[k] === 'number') info[k] = p[k]
      }
      if (typeof p.loop === 'boolean') info.loop = p.loop
      if (typeof p.audio === 'string') info.audio = new URL(p.audio, location.href).href
      return info
    })
    return scene ? { mode: 'scene', scene: scene as SceneInfo } : { mode: 'clock', scene: {} }
  } finally {
    await page.close()
  }
}

export async function openPage(browser: Browser, url: string, o: OpenOptions): Promise<Driver> {
  const context = await browser.newContext({
    viewport: { width: o.width, height: o.height },
    deviceScaleFactor: o.scale,
  })
  try {
    if (o.mode === 'clock') {
      await context.addInitScript({
        content: `window.__pagereelConfig=${JSON.stringify({ seed: o.seed, epoch: o.epoch })};${CLOCK_JS}`,
      })
    }
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    if (o.transparent) {
      await cdp.send('Emulation.setDefaultBackgroundColorOverride', {
        color: { r: 0, g: 0, b: 0, a: 0 },
      })
    }
    await load(page, url)

    let current = 0
    const clockStep = async (target: number) => {
      try {
        await page.evaluate(
          ([ms, step]) => (window as unknown as ClockWindow).__pagereel?.advanceTo(ms, step),
          [target * 1000, 1000 / o.fps] as const,
        )
      } catch (err) {
        throw new PagereelError(
          `The page clock failed at t=${target.toFixed(3)}s: ${firstLine(err)}`,
        )
      }
      current = target
    }

    if (o.mode === 'scene') {
      await page.evaluate(() => (window as { pagereel?: { ready?: unknown } }).pagereel?.ready)
    } else {
      await clockStep(0)
    }

    return {
      async goto(t, frame) {
        if (o.mode === 'clock') {
          if (t < current - 1e-9) {
            throw new PagereelError('Clock-mode pages can only move forward in time.')
          }
          // Already showing this time: advancing again would run the page's
          // frame callbacks twice for one frame.
          if (Math.abs(t - current) < 1e-9) return
          return clockStep(t)
        }
        try {
          await page.evaluate(
            (time) => (window as { pagereel?: { seek(t: number): unknown } }).pagereel?.seek(time),
            t,
          )
        } catch (err) {
          const n = frame ?? Math.round(t * o.fps)
          throw new PagereelError(
            `seek failed at frame ${n} (t=${t.toFixed(3)}s): ${firstLine(err)}`,
          )
        }
      },
      async capture(scale) {
        const { data } = await retry(
          () =>
            cdp.send('Page.captureScreenshot', {
              format: 'png',
              optimizeForSpeed: true,
              captureBeyondViewport: false,
              // Without an explicit clip scale, CDP captures CSS pixels and ignores
              // the context's device scale factor.
              clip: { x: 0, y: 0, width: o.width, height: o.height, scale: scale ?? o.scale },
            }),
          failedCapture,
          CAPTURE_RETRIES,
        )
        return Buffer.from(data, 'base64')
      },
      async evaluate<T>(js: string) {
        // Through CDP: unlike page.evaluate it runs a whole script (the bundled probe is one),
        // and unlike a <script> tag it cannot be blocked by the page's Content-Security-Policy.
        const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
          expression: js,
          returnByValue: true,
          awaitPromise: true,
        })
        if (exceptionDetails) {
          const detail = exceptionDetails.exception?.description ?? exceptionDetails.text
          throw new PagereelError(`A script in the page failed: ${firstLine(detail)}`)
        }
        return result.value as T
      },
      close: () => context.close(),
    }
  } catch (err) {
    await context.close().catch(() => {})
    throw err
  }
}
