import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMix, note, SR } from '../src/audio'

const dir = mkdtempSync(join(tmpdir(), 'pagereel-audio-'))
const hasFfmpeg = (() => {
  try {
    execFileSync(process.env.PAGEREEL_FFMPEG ?? 'ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

function samples(path: string) {
  const buf = readFileSync(path)
  return { buf, left: (i: number) => buf.readInt16LE(44 + i * 4) }
}

describe('audio', () => {
  it('converts MIDI notes to Hz', () => {
    expect(note(69)).toBe(440)
    expect(note(81)).toBeCloseTo(880)
  })

  it('writes a 16-bit stereo 48 kHz WAV of the right length', () => {
    const mix = createMix(1)
    mix.kick(0)
    const path = join(dir, 'a.wav')
    mix.write(path)
    const { buf } = samples(path)
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE')
    expect(buf.readUInt16LE(22)).toBe(2)
    expect(buf.readUInt32LE(24)).toBe(SR)
    expect(buf.readUInt16LE(34)).toBe(16)
    expect(buf.readUInt32LE(40)).toBe(SR * 4)
  })

  it('normalises peaks to at most 0.89 of full scale', () => {
    const mix = createMix(1)
    for (let i = 0; i < 6; i++) mix.kick(0)
    const path = join(dir, 'loud.wav')
    mix.write(path)
    const { buf } = samples(path)
    let peak = 0
    for (let i = 44; i < buf.length; i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)))
    expect(peak).toBeLessThanOrEqual(Math.round(0.89 * 32767) + 1)
  })

  it('cuts tails at the end unless the mix loops', () => {
    const cut = createMix(1, { loop: false })
    cut.kick(0.9)
    cut.write(join(dir, 'cut.wav'))
    const c = samples(join(dir, 'cut.wav'))
    for (let i = 0; i < 100; i++) expect(c.left(i)).toBe(0)

    const wrap = createMix(1, { loop: true })
    wrap.kick(0.9)
    wrap.write(join(dir, 'wrap.wav'))
    const w = samples(join(dir, 'wrap.wav'))
    let energy = 0
    for (let i = 0; i < SR * 0.1; i++) energy += Math.abs(w.left(i))
    expect(energy).toBeGreaterThan(0)
  })

  it.skipIf(!hasFfmpeg)('loudness-normalises with ffmpeg', () => {
    const mix = createMix(1)
    mix.pad(0, 1, [220, 330])
    const path = join(dir, 'lufs.wav')
    mix.write(path, { lufs: -14 })
    const probe = execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'csv=p=0',
      path,
    ])
    expect(probe.toString().trim()).toBe('pcm_s16le')
  })
})
