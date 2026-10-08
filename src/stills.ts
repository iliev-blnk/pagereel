import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Browser } from 'playwright-core'
import { launchBrowser, openPage } from './driver.js'
import { findFfmpeg } from './env.js'
import { contactSheet, psnr } from './ffmpeg.js'
import { type RenderOptions, resolveOptions } from './options.js'
import { detectMode } from './render.js'
import { resolveSource } from './serve.js'

export interface StillsOptions
  extends Omit<RenderOptions, 'output' | 'format' | 'from' | 'to' | 'workers' | 'audio'> {
  /** Folder for the PNGs and contact sheet. Default `pagereel-stills`. */
  outDir?: string
  /** Evenly spaced frames over the duration. Default 16. Ignored when `at` is set. */
  count?: number
  /** Exact times in seconds. */
  at?: number[]
}

export interface StillsResult {
  files: string[]
  contactSheet: string
  /** Only for scenes that declare `loop: true`. */
  loop?: { psnr: number; seamless: boolean }
}

/** Frames at chosen times plus a contact sheet, for checking a film without rendering it. */
export async function stills(input: StillsOptions): Promise<StillsResult> {
  const ffmpeg = await findFfmpeg()
  const outDir = resolve(input.outDir ?? 'pagereel-stills')
  const source = await resolveSource(input.source, input.root)
  let browser: Browser | undefined
  try {
    browser = await launchBrowser()
    const { mode, scene } = await detectMode(browser, source.url, input.mode)
    const o = resolveOptions({ ...input, format: 'png', output: outDir }, mode, scene)
    const duration = o.to
    const count = input.count ?? 16
    let times = input.at ?? Array.from({ length: count }, (_, i) => (i * duration) / count)
    if (mode === 'clock') times = [...times].sort((a, b) => a - b)

    await mkdir(outDir, { recursive: true })
    const driver = await openPage(browser, source.url, o)
    const files: string[] = []
    try {
      for (const [i, t] of times.entries()) {
        await driver.goto(t)
        const file = join(outDir, `${String(i).padStart(3, '0')}_${t.toFixed(2)}s.png`)
        await writeFile(file, await driver.capture())
        files.push(file)
      }
      const sheet = join(outDir, 'contact.png')
      await contactSheet(ffmpeg, files, sheet)

      let loop: StillsResult['loop']
      if (mode === 'scene' && scene.loop) {
        const a = join(outDir, 'loop-start.png')
        const b = join(outDir, 'loop-end.png')
        await driver.goto(0)
        await writeFile(a, await driver.capture())
        await driver.goto(duration)
        await writeFile(b, await driver.capture())
        const value = await psnr(ffmpeg, a, b)
        loop = { psnr: value, seamless: value > 40 }
      }
      return loop ? { files, contactSheet: sheet, loop } : { files, contactSheet: sheet }
    } finally {
      await driver.close()
    }
  } finally {
    await browser?.close().catch(() => {})
    await source.close()
  }
}
