import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser } from 'playwright-core'
import { detect, launchBrowser, type Mode, openPage, type SceneInfo } from './driver.js'
import { findFfmpeg } from './env.js'
import { PagereelError } from './errors.js'
import { encodeFinal, killAll, segmentWriter } from './ffmpeg.js'
import { precheck, type RenderOptions, resolveOptions, splitSlices } from './options.js'
import { resolveSource } from './serve.js'

export interface RenderResult {
  output: string
  frames: number
  fps: number
  /** Output pixels: the viewport × scale. */
  width: number
  height: number
  /** Wall-clock seconds the render took. */
  seconds: number
}

/** Finds the mode and scene defaults, honouring a forced `mode`. */
export async function detectMode(
  browser: Browser,
  url: string,
  mode: RenderOptions['mode'] = 'auto',
): Promise<{ mode: Mode; scene: SceneInfo }> {
  if (mode === 'clock') return { mode, scene: {} }
  const found = await detect(browser, url)
  if (mode === 'scene' && found.mode !== 'scene') {
    throw new PagereelError(
      'No window.pagereel.seek found on the page, so scene mode is not possible.',
    )
  }
  return found
}

export async function render(input: RenderOptions): Promise<RenderResult> {
  const started = Date.now()
  const format = precheck(input)
  const ffmpeg = format === 'png' ? '' : await findFfmpeg()
  const source = await resolveSource(input.source, input.root)

  // One controller for the whole render: the caller's signal or the first
  // failing worker stops every other worker.
  const stop = new AbortController()
  const onCallerAbort = () => stop.abort()
  input.signal?.addEventListener('abort', onCallerAbort, { once: true })

  let browser: Browser | undefined
  let tmp: string | undefined
  let output: string | undefined
  let finished = false
  try {
    if (input.signal?.aborted) throw new PagereelError('Render cancelled')
    browser = await launchBrowser()
    const { mode, scene } = await detectMode(browser, source.url, input.mode)
    const o = resolveOptions(input, mode, scene)

    const first = Math.round(o.from * o.fps)
    const last = Math.round(o.to * o.fps)
    const total = last - first
    const slices = splitSlices(first, last, o.workers)
    if (o.format === 'png') await mkdir(o.output, { recursive: true })
    else tmp = await mkdtemp(join(tmpdir(), 'pagereel-'))

    let done = 0
    const b = browser
    await Promise.all(
      slices.map(async ([a, z], i) => {
        const segment = tmp ? join(tmp, `${String(i).padStart(3, '0')}.mkv`) : ''
        const writer = tmp ? segmentWriter(ffmpeg, segment, o.fps, stop.signal) : undefined
        const driver = await openPage(b, source.url, o)
        try {
          for (let f = a; f < z; f++) {
            if (stop.signal.aborted) throw new PagereelError('Render cancelled')
            await driver.goto(f / o.fps, f)
            const png = await driver.capture()
            if (writer) await writer.write(png)
            else await writeFile(join(o.output, `${String(f - first).padStart(5, '0')}.png`), png)
            done++
            input.onProgress?.({ frame: done, total })
          }
          await writer?.end()
        } catch (err) {
          writer?.kill()
          stop.abort()
          throw err
        } finally {
          await driver.close().catch(() => {})
        }
      }),
    )

    if (tmp && o.format !== 'png') {
      const segments = slices.map((_, i) =>
        join(tmp as string, `${String(i).padStart(3, '0')}.mkv`),
      )
      // From here on ffmpeg writes the output, so a failure leaves a partial file.
      output = o.output
      await encodeFinal(ffmpeg, segments, { ...o, format: o.format, signal: stop.signal })
    }
    finished = true
    return {
      output: o.output,
      frames: total,
      fps: o.fps,
      width: Math.round(o.width * o.scale),
      height: Math.round(o.height * o.scale),
      seconds: (Date.now() - started) / 1000,
    }
  } catch (err) {
    if (input.signal?.aborted) throw new PagereelError('Render cancelled')
    throw err
  } finally {
    input.signal?.removeEventListener('abort', onCallerAbort)
    stop.abort()
    killAll()
    await browser?.close().catch(() => {})
    await source.close()
    if (tmp) await rm(tmp, { recursive: true, force: true })
    // Only a partial file from our own encode is removed; an earlier render at
    // the same path survives a failure before encoding.
    if (!finished && output) await rm(output, { force: true })
  }
}
