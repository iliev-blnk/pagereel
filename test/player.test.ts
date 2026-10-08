import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser } from '../src/driver'
import { CLOCK_JS, PLAYER_JS } from '../src/page/generated'
import { resolveSource } from '../src/serve'

let browser: Browser
beforeAll(async () => {
  browser = await launchBrowser()
})
afterAll(async () => {
  await browser?.close()
})

async function open(file: string, mode: 'clock' | 'scene') {
  const src = await resolveSource(`test/fixtures/${file}`)
  const ctx = await browser.newContext({ viewport: { width: 480, height: 200 } })
  let script = `window.__pagereelPreview=${JSON.stringify({ mode, duration: 2, fps: 30, loop: false })};`
  if (mode === 'clock') script += `window.__pagereelConfig={"seed":1,"epoch":0};${CLOCK_JS};`
  await ctx.addInitScript({ content: script + PLAYER_JS })
  const page = await ctx.newPage()
  await page.goto(src.url)
  await page.locator('code').waitFor()
  return {
    page,
    close: async () => {
      await ctx.close()
      await src.close()
    },
  }
}

describe('preview player', () => {
  for (const [file, mode] of [
    ['css.html', 'clock'],
    ['scene.html', 'scene'],
  ] as const) {
    it(`steps one frame per key press in ${mode} mode, even when pressed quickly`, async () => {
      const { page, close } = await open(file, mode)
      try {
        for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight')
        await expect.poll(() => page.locator('code').textContent()).toBe('0.50s  f15')
      } finally {
        await close()
      }
    })
  }
})
