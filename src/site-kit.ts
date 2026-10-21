import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { launchBrowser } from './driver.js'
import { SITEKIT_JS } from './page/generated.js'
import type { PageKit } from './page/sitekit.js'
import { resolveSource } from './serve.js'

export interface SiteKit {
  /** The page read: a local file as given, a URL after any redirects. */
  url: string
  title: string
  description: string
  /** The h1s, then the h2s, at most 10. */
  headings: string[]
  /** At most 12, each cut to 200 characters. */
  paragraphs: string[]
  /** At most 6 colours, by the area each paints; `share` is of all the area measured. */
  palette: Array<{ hex: string; share: number }>
  /** At most 4 font stacks, as CSS gives them, by the area of their text. */
  fonts: Array<{ family: string; share: number }>
  /** Absolute paths: the viewport, the page down to 6000 px, and the logo and og:image if found. */
  files: { fold: string; full: string; logo?: string; og?: string }
}

const WIDTH = 1280
const HEIGHT = 800
/** How far down the full-page screenshot goes. */
const MAX_HEIGHT = 6000
const EXTENSIONS: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

/**
 * What a reel about a page can borrow from it: copy, palette, fonts and logo, with screenshots
 * of the fold and the full page saved in `outDir`.
 */
export async function siteKit(url: string, outDir: string): Promise<SiteKit> {
  const dir = resolve(outDir)
  const source = await resolveSource(url)
  let browser: Browser | undefined
  try {
    browser = await launchBrowser()
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    await page.goto(source.url, { waitUntil: 'load' })
    await page.evaluate('document.fonts.ready.then(() => {})')
    await page.evaluate(SITEKIT_JS)
    const { logo, og, ...kit } = await page.evaluate<PageKit>('window.__pagereelSiteKit()')

    await mkdir(dir, { recursive: true })
    const files: SiteKit['files'] = { fold: join(dir, 'fold.png'), full: join(dir, 'full.png') }
    await page.screenshot({ path: files.fold })
    const height = await page.evaluate<number>('document.documentElement.scrollHeight')
    await page.screenshot({
      path: files.full,
      fullPage: true,
      clip: { x: 0, y: 0, width: WIDTH, height: Math.min(height, MAX_HEIGHT) },
    })
    if (logo.svg) {
      files.logo = join(dir, 'logo.svg')
      await writeFile(files.logo, logo.svg)
    } else if (logo.src) {
      files.logo = await download(page, logo.src, join(dir, 'logo'))
    }
    if (og) files.og = await download(page, og, join(dir, 'og'))
    return { url: source.url === url ? page.url() : url, ...kit, files }
  } finally {
    await browser?.close()
    await source.close()
  }
}

/** Saves an image the page links to as `<base>.<ext>`; undefined if it can't be had. */
async function download(page: Page, src: string, base: string) {
  try {
    const res = await page.request.get(src)
    const type = res.headers()['content-type']?.split(';')[0]?.trim().toLowerCase() ?? ''
    // A server that doesn't say what it sent leaves the URL's extension to say it.
    const unsaid = type === '' || type.endsWith('octet-stream')
    const named = /\.(svg|png|jpe?g|webp|gif|avif|ico)$/i.exec(new URL(src).pathname)?.[1]
    const ext = EXTENSIONS[type] ?? (unsaid ? named?.toLowerCase() : undefined)
    if (!res.ok() || !ext) return undefined
    const file = `${base}.${ext}`
    await writeFile(file, await res.body())
    return file
  } catch {
    return undefined
  }
}
