import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createMix } from '../src/audio'
import { activeChildren } from '../src/ffmpeg'
import { splitSlices } from '../src/options'
import { render } from '../src/render'
import { decode } from './support/pixels'

const out = mkdtempSync(join(tmpdir(), 'pagereel-test-out-'))
const fx = (name: string) => `test/fixtures/${name}`
const savedEnv = { ...process.env }
afterEach(() => {
  process.env = { ...savedEnv }
})

function probe(path: string) {
  const json = execFileSync('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]).toString()
  return JSON.parse(json) as {
    streams: Record<string, string | number | Record<string, string>>[]
    format: { duration: string }
  }
}

const tempDirs = () =>
  new Set(
    readdirSync(tmpdir()).filter(
      (d) => d.startsWith('pagereel-') && !d.startsWith('pagereel-test'),
    ),
  )

let wav: string
beforeAll(() => {
  const mix = createMix(3, { loop: false })
  mix.kick(0)
  mix.pad(0, 3, [220, 330])
  wav = join(out, 'track.wav')
  mix.write(wav)
})

describe('splitSlices', () => {
  it('splits frames into contiguous slices that differ by at most one', () => {
    expect(splitSlices(0, 10, 3)).toEqual([
      [0, 4],
      [4, 7],
      [7, 10],
    ])
  })

  it('never makes empty slices', () => {
    expect(splitSlices(0, 2, 6)).toEqual([
      [0, 1],
      [1, 2],
    ])
  })
})

describe('render', () => {
  it('renders an mp4 with the right size, frame count and duration', async () => {
    const output = join(out, 'css.mp4')
    const res = await render({
      source: fx('css.html'),
      output,
      duration: 1,
      size: '320x180',
      fps: 30,
    })
    expect(res.frames).toBe(30)
    const { streams, format } = probe(output)
    const v = streams.find((s) => s.codec_type === 'video')
    expect(v?.codec_name).toBe('h264')
    expect(v?.width).toBe(320)
    expect(v?.height).toBe(180)
    expect(Number(v?.nb_read_frames)).toBe(30)
    expect(Number(format.duration)).toBeCloseTo(1, 1)
  })

  it('keeps transparency in webm', async () => {
    const output = join(out, 'alpha.webm')
    await render({
      source: fx('transparent.html'),
      output,
      duration: 0.5,
      size: '160x120',
      transparent: true,
    })
    const v = probe(output).streams[0]
    const alpha =
      v?.pix_fmt === 'yuva420p' || (v?.tags as Record<string, string>)?.alpha_mode === '1'
    expect(alpha).toBe(true)
  })

  it('renders a gif', async () => {
    const output = join(out, 'css.gif')
    await render({ source: fx('css.html'), output, duration: 0.5, size: '160x90', fps: 10 })
    expect(readFileSync(output).subarray(0, 6).toString()).toBe('GIF89a')
  })

  it('writes numbered PNG frames', async () => {
    const output = join(out, 'frames')
    await render({
      source: fx('css.html'),
      output,
      format: 'png',
      duration: 1,
      size: '160x90',
      fps: 30,
    })
    const files = readdirSync(output).sort()
    expect(files).toHaveLength(30)
    expect(files[0]).toBe('00000.png')
    expect(files[29]).toBe('00029.png')
  })

  it('muxes an audio track', async () => {
    const output = join(out, 'audio.mp4')
    await render({ source: fx('scene.html'), output, audio: wav, to: 2 })
    const { streams } = probe(output)
    const a = streams.find((s) => s.codec_type === 'audio')
    const v = streams.find((s) => s.codec_type === 'video')
    expect(a?.codec_name).toBe('aac')
    expect(Number(a?.duration)).toBeCloseTo(Number(v?.duration), 0)
  })

  it('muxes the audio a scene declares, even an m4a that needs seeking', async () => {
    const site = mkdtempSync(join(tmpdir(), 'pagereel-test-site-'))
    // ffmpeg writes the m4a index at the end unless told otherwise, so reading
    // it over HTTP needs range requests.
    // Long enough that ffmpeg cannot read it in one go and has to seek.
    const long = createMix(20, { loop: false })
    for (let i = 0; i < 20; i++) long.pad(i, 1, [220, 277, 330])
    long.write(join(site, 'track.wav'))
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      join(site, 'track.wav'),
      '-c:a',
      'aac',
      join(site, 'track.m4a'),
    ])
    const html = readFileSync(fx('scene.html'), 'utf8').replace(
      'duration: 3,',
      "duration: 3, audio: 'track.m4a',",
    )
    writeFileSync(join(site, 'index.html'), html)
    const output = join(out, 'scene-audio.mp4')
    await render({ source: join(site, 'index.html'), output, to: 1 })
    const audio = probe(output).streams.find((s) => s.codec_type === 'audio')
    expect(Number(audio?.duration)).toBeGreaterThan(0.9)
  })

  it('fails loudly when the requested audio cannot be read', async () => {
    await expect(
      render({
        source: fx('css.html'),
        output: join(out, 'noaudio.mp4'),
        duration: 0.5,
        size: '160x90',
        audio: fx('hello.html'),
      }),
    ).rejects.toThrow(/audio|ffmpeg/i)
  })

  it('joins worker slices without a seam in clock mode', async () => {
    const one = join(out, 'seam-1')
    const three = join(out, 'seam-3')
    const common = {
      source: fx('random.html'),
      format: 'png' as const,
      duration: 2,
      size: '160x90',
      fps: 15,
    }
    await render({ ...common, output: one, workers: 1 })
    await render({ ...common, output: three, workers: 3 })
    const files = readdirSync(one).sort()
    expect(files).toHaveLength(30)
    for (const f of files) {
      const a = decode(readFileSync(join(one, f)))
      const b = decode(readFileSync(join(three, f)))
      expect(Buffer.compare(a.data, b.data), f).toBe(0)
    }
  })

  it('rejects an odd mp4 size before starting a browser', async () => {
    process.env.PAGEREEL_CHROME = '/nope/chrome'
    await expect(
      render({
        source: fx('css.html'),
        output: join(out, 'odd.mp4'),
        duration: 1,
        size: '321x180',
      }),
    ).rejects.toThrow(/even/)
  })

  it('explains a missing file and a page that will not load, and leaves nothing behind', async () => {
    const before = tempDirs()
    await expect(render({ source: fx('missing.html'), duration: 1 })).rejects.toThrow(
      /File not found/,
    )
    const refused = render({
      source: 'http://127.0.0.1:9/',
      output: join(out, 'x.mp4'),
      duration: 1,
    })
    await expect(refused).rejects.toThrow(/Could not load/)
    expect(tempDirs()).toEqual(before)
    expect(activeChildren()).toHaveLength(0)
    expect(existsSync(join(out, 'x.mp4'))).toBe(false)
  })

  it('cancels cleanly', async () => {
    const before = tempDirs()
    const ctrl = new AbortController()
    const output = join(out, 'cancel.mp4')
    const run = render({
      source: fx('css.html'),
      output,
      duration: 4,
      size: '320x180',
      signal: ctrl.signal,
      onProgress: () => ctrl.abort(),
    })
    await expect(run).rejects.toThrow('Render cancelled')
    expect(tempDirs()).toEqual(before)
    expect(activeChildren()).toHaveLength(0)
    expect(existsSync(output)).toBe(false)
  })

  it('requires a duration in clock mode', async () => {
    await expect(render({ source: fx('css.html'), output: join(out, 'nod.mp4') })).rejects.toThrow(
      /--duration/,
    )
  })

  it('refuses transparency in mp4', async () => {
    await expect(
      render({
        source: fx('css.html'),
        output: join(out, 't.mp4'),
        duration: 1,
        transparent: true,
      }),
    ).rejects.toThrow(/webm/)
  })
})
