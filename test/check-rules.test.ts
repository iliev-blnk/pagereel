import { describe, expect, it } from 'vitest'
import {
  audioRule,
  clippedRule,
  contrastRule,
  deadAirRule,
  flashRule,
  formatRule,
  hookRule,
  readingTimeRule,
  safeZoneRule,
  textSizeRule,
} from '../src/check/rules'
import type { FrameStat, TextSample } from '../src/check/types'

const STEP = 0.25

type Box = TextSample['boxes'][number]

function box(p: Partial<Box> = {}): Box {
  return {
    key: 'Offline captions',
    label: 'Offline captions',
    words: 2,
    x: 100,
    y: 800,
    w: 600,
    h: 80,
    fontPx: 72,
    color: [255, 255, 255],
    opacity: 1,
    clipped: false,
    ...p,
  }
}

/** `count` text samples STEP apart; `fn` gives the boxes visible at each time. */
function samples(count: number, fn: (t: number) => Box[]): TextSample[] {
  return Array.from({ length: count }, (_, i) => ({ t: i * STEP, boxes: fn(i * STEP) }))
}

function frames(count: number, fps: number, fn: (i: number) => Partial<FrameStat>): FrameStat[] {
  return Array.from({ length: count }, (_, i) => ({
    t: i / fps,
    mean: 0.5,
    std: 30,
    diff: 2,
    ...fn(i),
  }))
}

/** Frames whose mean luminance follows `means`. */
function series(means: number[], fps: number): FrameStat[] {
  return means.map((mean, i) => ({
    t: i / fps,
    mean,
    std: 30,
    diff: Math.abs(mean - (means[i - 1] ?? mean)) * 255,
  }))
}

describe('formatRule', () => {
  it('rejects a reel that is not 1080×1920', () => {
    const f = formatRule({ width: 1280, height: 720, duration: 10, target: 'ig-reel' })
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'format', severity: 'error' })
  })

  it('rejects a reel shorter than 3 s', () => {
    const f = formatRule({ width: 1080, height: 1920, duration: 2, target: 'ig-reel' })
    expect(f.map((x) => x.severity)).toEqual(['error'])
  })

  it('warns about a reel longer than 90 s', () => {
    const f = formatRule({ width: 1080, height: 1920, duration: 95, target: 'ig-reel' })
    expect(f.map((x) => x.severity)).toEqual(['warn'])
  })

  it('accepts a 15 s 1080×1920 reel', () => {
    expect(formatRule({ width: 1080, height: 1920, duration: 15, target: 'ig-reel' })).toEqual([])
  })

  it('checks nothing without a target', () => {
    expect(formatRule({ width: 1280, height: 720, duration: 2, target: 'none' })).toEqual([])
  })
})

describe('safeZoneRule', () => {
  it('flags text under the caption area, naming the text and the time range', () => {
    const f = safeZoneRule(
      samples(8, () => [box({ y: 1700 })]),
      STEP,
      1,
    )
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'safe-zone', severity: 'error', from: 0, to: 2 })
    expect(f[0]?.message).toContain('"Offline captions"')
    expect(f[0]?.message).toContain('0.00–2.00 s')
  })

  it('ignores text that passes through the zone for less than 3 samples', () => {
    expect(
      safeZoneRule(
        samples(8, (t) => (t < 0.5 ? [box({ y: 1700 })] : [])),
        STEP,
        1,
      ),
    ).toEqual([])
  })

  it('accepts text inside the safe area', () => {
    expect(
      safeZoneRule(
        samples(8, () => [box({ y: 400 })]),
        STEP,
        1,
      ),
    ).toEqual([])
  })

  it('flags text under the buttons on the right in the lower half', () => {
    const f = safeZoneRule(
      samples(8, () => [box({ x: 950, y: 1200, w: 100 })]),
      STEP,
      1,
    )
    expect(f.map((x) => x.id)).toEqual(['safe-zone'])
  })

  it('scales a smaller stage up to 1080 wide', () => {
    const f = safeZoneRule(
      samples(8, () => [box({ x: 50, y: 850, w: 300, h: 40 })]),
      STEP,
      2,
    )
    expect(f.map((x) => x.id)).toEqual(['safe-zone'])
  })
})

describe('textSizeRule', () => {
  it('errors on type under 28 px', () => {
    const f = textSizeRule(
      samples(4, () => [box({ fontPx: 20 })]),
      STEP,
      1,
    )
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'text-size', severity: 'error' })
  })

  it('warns on type under 36 px', () => {
    const f = textSizeRule(
      samples(4, () => [box({ fontPx: 32 })]),
      STEP,
      1,
    )
    expect(f.map((x) => x.severity)).toEqual(['warn'])
  })

  it('accepts 40 px type', () => {
    expect(
      textSizeRule(
        samples(4, () => [box({ fontPx: 40 })]),
        STEP,
        1,
      ),
    ).toEqual([])
  })

  it('ignores small type that lasts less than 3 samples', () => {
    const f = textSizeRule(
      samples(8, (t) => [box({ fontPx: t < 0.5 ? 20 : 72 })]),
      STEP,
      1,
    )
    expect(f).toEqual([])
  })
})

describe('clippedRule', () => {
  it('errors on text cut off for 3 samples', () => {
    const f = clippedRule(
      samples(3, () => [box({ clipped: true })]),
      STEP,
    )
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'text-clipped', severity: 'error' })
  })

  it('ignores clipping that lasts 2 samples', () => {
    expect(
      clippedRule(
        samples(8, (t) => [box({ clipped: t < 0.5 })]),
        STEP,
      ),
    ).toEqual([])
  })
})

describe('readingTimeRule', () => {
  const nine = (show: number) => (t: number) => (t < show ? [box({ key: 'k9', words: 9 })] : [])

  it('warns when 9 words are on screen for 0.75 s', () => {
    const f = readingTimeRule(samples(16, nine(0.75)), STEP)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'reading-time', severity: 'warn' })
  })

  it('accepts 9 words held for 3.25 s', () => {
    expect(readingTimeRule(samples(16, nine(3.25)), STEP)).toEqual([])
  })

  it('accepts one word held for 1 s', () => {
    expect(
      readingTimeRule(
        samples(8, (t) => (t < 1 ? [box({ words: 1 })] : [])),
        STEP,
      ),
    ).toEqual([])
  })
})

describe('contrastRule', () => {
  it('warns on 1.8:1 text and names the ratio', () => {
    const f = contrastRule(
      samples(4, () => [box({ contrast: 1.8 })]),
      STEP,
    )
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'contrast', severity: 'warn' })
    expect(f[0]?.message).toContain('1.8')
  })

  it('ignores text that is still fading in', () => {
    expect(
      contrastRule(
        samples(4, () => [box({ contrast: 1.8, opacity: 0.5 })]),
        STEP,
      ),
    ).toEqual([])
  })
})

describe('hookRule', () => {
  it('warns twice about a blank, still opening', () => {
    const f = hookRule(frames(60, 30, () => ({ std: 0, diff: 0 })))
    expect(f.map((x) => `${x.id} ${x.severity}`)).toEqual(['hook warn', 'hook warn'])
  })

  it('accepts an opening with content at 0.5 s and motion before 1.5 s', () => {
    const f = hookRule(frames(60, 30, (i) => ({ std: i === 15 ? 30 : 0, diff: i === 9 ? 5 : 0 })))
    expect(f).toEqual([])
  })
})

describe('deadAirRule', () => {
  it('warns about 3 s without motion', () => {
    const f = deadAirRule(
      frames(90, 30, () => ({ diff: 0 })),
      30,
    )
    expect(f).toHaveLength(1)
    expect(f[0]?.id).toBe('dead-air')
    expect(f[0]?.from).toBeCloseTo(0, 5)
    expect(f[0]?.to).toBeCloseTo(3, 5)
  })

  it('accepts a 2 s hold', () => {
    expect(
      deadAirRule(
        frames(120, 30, (i) => ({ diff: i < 60 ? 0 : 2 })),
        30,
      ),
    ).toEqual([])
  })
})

describe('flashRule', () => {
  it('errors once on a black/white strobe', () => {
    const f = flashRule(
      series(
        Array.from({ length: 30 }, (_, i) => i % 2),
        30,
      ),
      30,
    )
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ id: 'flash', severity: 'error' })
  })

  it('accepts one flash per second', () => {
    const means = Array.from({ length: 120 }, (_, i) => Math.floor(i / 15) % 2)
    expect(flashRule(series(means, 30), 30)).toEqual([])
  })

  it('accepts a fade from black to white', () => {
    const means = Array.from({ length: 31 }, (_, i) => i / 30)
    expect(flashRule(series(means, 30), 30)).toEqual([])
  })

  it('accepts flicker under 10 % luminance', () => {
    const means = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.5 : 0.45))
    expect(flashRule(series(means, 30), 30)).toEqual([])
  })
})

describe('audioRule', () => {
  it('warns when there is no audio', () => {
    expect(audioRule(null).map((x) => `${x.id} ${x.severity}`)).toEqual(['audio warn'])
  })

  it('errors on a true peak above -1 dBTP', () => {
    expect(audioRule({ integrated: -14, truePeak: -0.2 }).map((x) => x.severity)).toEqual(['error'])
  })

  it('accepts -14 LUFS with -1.5 dBTP peaks', () => {
    expect(audioRule({ integrated: -14, truePeak: -1.5 })).toEqual([])
  })

  it('warns about a quiet mix', () => {
    expect(audioRule({ integrated: -22, truePeak: -3 }).map((x) => x.severity)).toEqual(['warn'])
  })
})
