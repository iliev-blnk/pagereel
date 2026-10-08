import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stills } from '../src/stills'

const dir = () => mkdtempSync(join(tmpdir(), 'pagereel-test-stills-'))

describe('stills', () => {
  it('captures evenly spaced frames and a contact sheet', async () => {
    const outDir = dir()
    const res = await stills({
      source: 'test/fixtures/css.html',
      outDir,
      duration: 2,
      count: 4,
      size: '320x90',
    })
    expect(res.files.map((f) => basename(f))).toEqual([
      '000_0.00s.png',
      '001_0.50s.png',
      '002_1.00s.png',
      '003_1.50s.png',
    ])
    for (const f of res.files) expect(existsSync(f)).toBe(true)
    expect(existsSync(res.contactSheet)).toBe(true)
    expect(res.loop).toBeUndefined()
  })

  it('captures given times in clock mode in ascending order', async () => {
    const res = await stills({
      source: 'test/fixtures/css.html',
      outDir: dir(),
      duration: 2,
      at: [1.5, 0.25],
      size: '320x90',
    })
    expect(res.files.map((f) => basename(f))).toEqual(['000_0.25s.png', '001_1.50s.png'])
  })

  it('reports a seamless loop', async () => {
    const res = await stills({ source: 'test/fixtures/scene-loop.html', outDir: dir(), count: 2 })
    expect(res.loop?.seamless).toBe(true)
  })

  it('skips the loop check for scenes that do not loop', async () => {
    const res = await stills({ source: 'test/fixtures/scene.html', outDir: dir(), count: 2 })
    expect(res.loop).toBeUndefined()
  })
})
