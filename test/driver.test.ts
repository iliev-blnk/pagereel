import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detect, launchBrowser, type OpenOptions, openPage } from '../src/driver'
import { PagereelError } from '../src/errors'
import { resolveSource, type Source } from '../src/serve'
import { decode, pixel, redStart, redWidth } from './support/pixels'

let browser: Browser
let server: Source
const url = (name: string, query = '') => new URL(`${name}${query}`, server.url).href

beforeAll(async () => {
  browser = await launchBrowser()
  server = await resolveSource('test/fixtures/hello.html')
})
afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const base: OpenOptions = {
  mode: 'clock',
  width: 480,
  height: 120,
  scale: 1,
  fps: 30,
  transparent: false,
  seed: 1,
  epoch: 1_700_000_000_000,
}

async function frameAt(name: string, t: number, o: Partial<OpenOptions> = {}, query = '') {
  const d = await openPage(browser, url(name, query), { ...base, ...o })
  try {
    await d.goto(t)
    return decode(await d.capture())
  } finally {
    await d.close()
  }
}

const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(4)

describe('clock mode', () => {
  it('moves CSS keyframe animations to the requested time', async () => {
    const d = await openPage(browser, url('css.html'), base)
    try {
      for (const [t, x] of [
        [0, 0],
        [1, 200],
        [2, 0],
      ] as const) {
        await d.goto(t)
        near(redStart(decode(await d.capture())), x)
      }
    } finally {
      await d.close()
    }
  })

  it('starts a transition at the virtual time JS triggered it', async () => {
    const d = await openPage(browser, url('transition.html'), base)
    try {
      await d.goto(0.5)
      near(redStart(decode(await d.capture())), 0)
      await d.goto(1.5)
      near(redStart(decode(await d.capture())), 200)
      await d.goto(2.5)
      near(redStart(decode(await d.capture())), 400)
    } finally {
      await d.close()
    }
  })

  it('drives requestAnimationFrame loops with virtual performance.now', async () => {
    near(redStart(await frameAt('raf.html', 2)), 200)
  })

  it('runs intervals on virtual time', async () => {
    expect(redWidth(await frameAt('interval.html', 1))).toBe(40)
  })

  it('makes Math.random repeat for the same seed', async () => {
    const a = await frameAt('random.html', 0.5)
    const b = await frameAt('random.html', 0.5)
    const c = await frameAt('random.html', 0.5, { seed: 2 })
    expect(Buffer.compare(a.data, b.data)).toBe(0)
    expect(Buffer.compare(a.data, c.data)).not.toBe(0)
  })

  it('runs Date from the given epoch', async () => {
    const png = await frameAt('date.html', 1, {}, `?epoch=${base.epoch}`)
    expect(redWidth(png)).toBe(100)
    expect(pixel(png, 470, 110)).toEqual([255, 255, 255, 255])
  })

  it('refuses to go back in time', async () => {
    const d = await openPage(browser, url('css.html'), base)
    try {
      await d.goto(1)
      await expect(d.goto(0.5)).rejects.toThrow(PagereelError)
    } finally {
      await d.close()
    }
  })

  it('stops a timer storm with a readable error', async () => {
    const d = await openPage(browser, url('storm.html'), base).catch((e) => e)
    if (d instanceof Error) {
      expect(d).toBeInstanceOf(PagereelError)
      expect(d.message).toMatch(/timer/)
      return
    }
    try {
      await expect(d.goto(1)).rejects.toThrow(/timer/)
    } finally {
      await d.close()
    }
  })
})

describe('scene mode', () => {
  const scene: Partial<OpenOptions> = { mode: 'scene' }

  it('awaits async seek and can go back in time', async () => {
    const d = await openPage(browser, url('scene.html'), { ...base, ...scene })
    try {
      await d.goto(2)
      near(redStart(decode(await d.capture())), 200)
      await d.goto(1)
      near(redStart(decode(await d.capture())), 100)
    } finally {
      await d.close()
    }
  })

  it('names the frame and time when seek throws', async () => {
    const d = await openPage(browser, url('scene-throws.html'), { ...base, ...scene })
    try {
      await expect(d.goto(0.4, 12)).rejects.toThrow('seek failed at frame 12 (t=0.400s): boom')
    } finally {
      await d.close()
    }
  })
})

describe('detect', () => {
  it('finds the scene contract and its defaults', async () => {
    expect(await detect(browser, url('scene.html'))).toEqual({
      mode: 'scene',
      scene: { duration: 3, fps: 30, width: 480, height: 120 },
    })
  })

  it('falls back to clock mode', async () => {
    expect((await detect(browser, url('css.html'))).mode).toBe('clock')
  })

  it('explains when a page cannot load', async () => {
    await expect(detect(browser, 'http://127.0.0.1:9/')).rejects.toThrow(/Could not load/)
  })
})

describe('capture', () => {
  it('keeps transparency and applies the scale', async () => {
    const png = await frameAt('transparent.html', 0, { transparent: true, scale: 2 })
    expect(png.width).toBe(960)
    expect(png.height).toBe(240)
    expect(pixel(png, 0, 0)[3]).toBe(0)
    expect(pixel(png, 120, 120)).toEqual([255, 0, 0, 255])
  })
})
