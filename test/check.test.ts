import { describe, expect, it } from 'vitest'
import { check } from '../src/check'
import type { CheckReport, RuleId } from '../src/check/types'

const runs = new Map<string, Promise<CheckReport>>()

/** Checks a fixture in test/fixtures/check once per file run. */
function report(name: string): Promise<CheckReport> {
  let run = runs.get(name)
  if (!run) {
    run = check({ source: `test/fixtures/check/${name}.html` })
    runs.set(name, run)
  }
  return run
}

const found = (r: CheckReport) => r.findings.map((f) => `${f.id} ${f.severity}`)
const ids = (r: CheckReport) => new Set(r.findings.map((f) => f.id))

describe('check', () => {
  it.each([
    ['safe-zone', 'safe-zone', 'error'],
    ['small-text', 'text-size', 'error'],
    ['clipped', 'text-clipped', 'error'],
    ['fast-text', 'reading-time', 'warn'],
    ['low-contrast', 'contrast', 'warn'],
    ['blank-start', 'hook', 'warn'],
    ['static', 'dead-air', 'warn'],
    ['flash', 'flash', 'error'],
  ] as const)('%s.html trips only %s (%s)', async (name, id: RuleId, severity) => {
    const r = await report(name)
    expect(found(r)).toContain(`${id} ${severity}`)
    expect(ids(r)).toEqual(new Set([id, 'audio']))
  })

  it('passes a clean reel with nothing but the missing audio', async () => {
    const r = await report('good')
    expect(r).toMatchObject({
      target: 'ig-reel',
      width: 1080,
      height: 1920,
      duration: 4,
      fps: 30,
      errors: 0,
      warnings: 1,
      notes: [],
    })
    expect(found(r)).toEqual(['audio warn'])
  })

  it('warns when there is no audio', async () => {
    const r = await report('good')
    expect(r.findings.find((f) => f.id === 'audio')?.message).toBe('There is no audio')
  })

  it('tracks text rebuilt with innerHTML on every seek as one span', async () => {
    expect(ids(await report('rebuild')).has('reading-time')).toBe(false)
  })

  it('lets text slide in from off screen and up from the bottom edge', async () => {
    const r = await report('slide-in')
    expect(ids(r).has('text-clipped')).toBe(false)
    expect(ids(r).has('safe-zone')).toBe(false)
  })

  it('sees a colour moving over a background of the same brightness', async () => {
    expect(ids(await report('colour'))).toEqual(new Set(['audio']))
  })

  it('says the text checks did not run on a canvas-only page', async () => {
    const r = await report('canvas')
    expect(r.notes.join(' ')).toContain('No DOM text found')
  })

  it('reports the format of a short clock-mode page instead of throwing', async () => {
    const r = await check({ source: 'test/fixtures/css.html', duration: 1 })
    expect(found(r)).toContain('format error')
  })
})
