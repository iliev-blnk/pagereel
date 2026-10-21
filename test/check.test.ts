import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { check } from '../src/check'
import type { CheckReport, RuleId } from '../src/check/types'
import { loudness } from '../src/ffmpeg'

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

describe('check audio', () => {
  const ffmpeg = process.env.PAGEREEL_FFMPEG || 'ffmpeg'
  const dir = mkdtempSync(join(tmpdir(), 'pagereel-check-audio-'))
  const wav = (name: string) => join(dir, `${name}.wav`)
  const audioOf = (r: CheckReport) => r.findings.filter((f) => f.id === 'audio')
  /** The audio findings for good.html, checked for one second, with this track. */
  const withAudio = async (audio: string) =>
    audioOf(await check({ source: 'test/fixtures/check/good.html', duration: 1, audio }))

  /** A copy of good.html that declares `track` as its audio, in a folder of its own. */
  function scene(track: string, file?: string): string {
    const site = mkdtempSync(join(tmpdir(), 'pagereel-check-scene-'))
    const html = readFileSync('test/fixtures/check/good.html', 'utf8')
    writeFileSync(
      join(site, 'index.html'),
      html.replace('duration: 4,', `duration: 4, audio: '${track}',`),
    )
    if (file) {
      mkdirSync(join(site, track, '..'), { recursive: true })
      copyFileSync(file, join(site, track))
    }
    return join(site, 'index.html')
  }

  beforeAll(() => {
    const make = (...args: string[]) => execFileSync(ffmpeg, ['-v', 'error', '-y', ...args])
    make('-f', 'lavfi', '-i', 'sine=f=440:d=3,volume=8', wav('loud'))
    make('-f', 'lavfi', '-i', 'sine=f=440:d=3,volume=0.05', wav('quiet'))
    make('-i', wav('loud'), '-af', 'loudnorm=I=-14:TP=-1.5', '-ar', '48000', wav('ok'))
    make('-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', join(dir, 'mute.mp4'))
  })

  it('measures the integrated loudness and true peak of audio', async () => {
    const stats = await loudness(ffmpeg, wav('ok'))
    expect(Math.abs(stats.integrated + 14)).toBeLessThanOrEqual(1)
    expect(stats.truePeak).toBeLessThanOrEqual(-1)
  })

  it('errors on audio that peaks above -1 dBTP', async () => {
    expect((await withAudio(wav('loud'))).map((f) => f.severity)).toContain('error')
  })

  it('warns on quiet audio', async () => {
    expect(await withAudio(wav('quiet'))).toMatchObject([
      { severity: 'warn', message: expect.stringContaining('LUFS') },
    ])
  })

  it('passes audio normalized to -14 LUFS', async () => {
    expect(await withAudio(wav('ok'))).toEqual([])
  })

  it('rejects an audio file that does not exist', async () => {
    const missing = join(dir, 'missing.wav')
    await expect(loudness(ffmpeg, missing)).rejects.toThrow(`Audio file not found: ${missing}`)
    await expect(withAudio(missing)).rejects.toThrow('Audio file not found')
  })

  it('says why it cannot read an audio file', async () => {
    await expect(loudness(ffmpeg, 'test/fixtures/check/good.html')).rejects.toThrow(
      /^Could not read the audio in test\/fixtures\/check\/good\.html: Invalid data/,
    )
    await expect(loudness(ffmpeg, join(dir, 'mute.mp4'))).rejects.toThrow(
      `${join(dir, 'mute.mp4')} has no audio track.`,
    )
  })

  it('warns, naming the file, when the audio a scene declares is not made yet', async () => {
    const r = await check({ source: scene('sound/track.wav'), duration: 1 })
    expect(audioOf(r)).toMatchObject([
      { severity: 'warn', message: expect.stringContaining('sound/track.wav') },
    ])
  })

  it('measures the audio a scene declares', async () => {
    const r = await check({ source: scene('sound/track.wav', wav('quiet')), duration: 1 })
    expect(audioOf(r).map((f) => f.message)).toEqual([expect.stringContaining('LUFS')])
  })
})
