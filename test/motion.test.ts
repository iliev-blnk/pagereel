import { describe, expect, it } from 'vitest'
import { beats, colorTrack, fade, rng, SPRINGS, spring, track } from '../src/motion'

describe('spring', () => {
  it('starts at 0 and settles at 1', () => {
    expect(spring(0)).toBe(0)
    expect(spring(-1)).toBe(0)
    expect(spring(10)).toBeCloseTo(1, 6)
  })

  it('never overshoots with the heavy preset', () => {
    for (let t = 0; t <= 5; t += 0.01)
      expect(spring(t, SPRINGS.heavy)).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('overshoots with the playful preset', () => {
    let max = 0
    for (let t = 0; t <= 5; t += 0.01) max = Math.max(max, spring(t, SPRINGS.playful))
    expect(max).toBeGreaterThan(1.02)
  })
})

describe('track', () => {
  it('holds the initial value until the first change, then reaches the target', () => {
    const v = track(0, [[1, 10]])
    expect(v(0.5)).toBe(0)
    expect(v(20)).toBeCloseTo(10, 6)
  })

  it('stays continuous when a second change starts mid-motion', () => {
    const v = track(0, [
      [0, 10],
      [2, -5],
    ])
    expect(Math.abs(v(2 - 1e-6) - v(2 + 1e-6))).toBeLessThan(1e-3)
    expect(v(30)).toBeCloseTo(-5, 6)
  })
})

describe('colorTrack', () => {
  it('moves each channel to the target colour', () => {
    expect(colorTrack('#000000', [[0, '#ffffff']])(50)).toBe('rgb(255,255,255)')
    expect(colorTrack('#336699', [[5, '#ffffff']])(0)).toBe('rgb(51,102,153)')
  })
})

describe('beats', () => {
  it('converts between beats and seconds', () => {
    const B = beats(120)
    expect(B(4)).toBe(2)
    expect(B.bpm).toBe(120)
    expect(B.spb).toBe(0.5)
    expect(B.index(1)).toBe(2)
    expect(B.pulse(0)).toBe(1)
  })
})

describe('fade and rng', () => {
  it('fades between two times', () => {
    expect(fade(0.5, 0, 1)).toBe(0.5)
    expect(fade(-1, 0, 1)).toBe(0)
    expect(fade(2, 0, 1)).toBe(1)
  })

  it('matches the motion-studio generator for the same seed', () => {
    const r = rng(1)
    expect([r(), r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522])
  })
})
