import type { Browser, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser } from '../src/driver'
import { PROBE_JS } from '../src/page/generated'
import type { ProbedBox } from '../src/page/probe'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await launchBrowser()
  page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
})
afterAll(async () => {
  await browser?.close()
})

/** The probe's boxes for a page made of `html`. */
async function probe(html: string): Promise<ProbedBox[]> {
  await page.setContent(`<!doctype html><body style="margin:0">${html}`)
  await page.addScriptTag({ content: PROBE_JS })
  return page.evaluate(() => window.__pagereelProbe?.() ?? [])
}

describe('probe', () => {
  it('reads the font size of text whose line box is a fractional height', async () => {
    const [box] = await probe('<p style="margin:0;font:13px/1.2 sans-serif">Small print</p>')
    expect(box?.fontPx).toBeCloseTo(13, 5)
  })

  it('scales the font size by the transforms above the text', async () => {
    const [box] = await probe(
      '<div style="transform:scale(2);transform-origin:0 0"><p style="margin:0;font:20px/1 sans-serif">Zoomed</p></div>',
    )
    expect(box?.fontPx).toBeCloseTo(40, 5)
  })
})
