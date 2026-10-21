import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AudioStats } from './check/types.js'
import { PagereelError } from './errors.js'
import type { Format } from './options.js'

const children = new Set<ChildProcess>()

/** ffmpeg processes still running. Exposed for tests and cleanup. */
export const activeChildren = () => [...children]

export function killAll() {
  for (const child of children) child.kill('SIGKILL')
}

function run(cmd: string, args: string[], signal?: AbortSignal) {
  const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  children.add(child)
  let stderr = ''
  child.stderr?.on('data', (d) => {
    stderr = (stderr + d).slice(-4000)
  })
  const onAbort = () => child.kill('SIGKILL')
  signal?.addEventListener('abort', onAbort, { once: true })
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      children.delete(child)
      signal?.removeEventListener('abort', onAbort)
      if (code === 0) resolve()
      else
        reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim().split('\n').at(-1) ?? ''}`))
    })
  })
  done.catch(() => {})
  return { child, done }
}

/** Streams PNG frames into a lossless FFV1 segment (keeps alpha). */
export function segmentWriter(cmd: string, path: string, fps: number, signal?: AbortSignal) {
  const { child, done } = run(
    cmd,
    [
      '-y',
      '-v',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-c:v',
      'png',
      '-i',
      '-',
      '-c:v',
      'ffv1',
      '-pix_fmt',
      'bgra',
      path,
    ],
    signal,
  )
  const stdin = child.stdin
  if (!stdin) throw new Error('ffmpeg has no stdin')
  stdin.on('error', () => {})
  return {
    async write(png: Buffer) {
      if (!stdin.write(png)) {
        await Promise.race([once(stdin, 'drain'), done])
      }
    },
    async end() {
      stdin.end()
      await done
    },
    kill() {
      child.kill('SIGKILL')
    },
  }
}

export interface FinalOptions {
  format: Exclude<Format, 'png'>
  output: string
  audio?: string
  from: number
  to: number
  transparent: boolean
  signal?: AbortSignal
}

/** Joins the segments and encodes them once to the target format, muxing audio. */
export async function encodeFinal(cmd: string, segments: string[], o: FinalOptions) {
  const list = join(dirname(segments[0] ?? '.'), 'segments.txt')
  await writeFile(list, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'))
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list]
  const withAudio = o.audio && o.format !== 'gif'
  if (withAudio && o.audio)
    args.push('-ss', String(o.from), '-t', String(o.to - o.from), '-i', o.audio)
  args.push('-map', '0:v')
  if (withAudio) args.push('-map', '1:a')
  if (o.format === 'mp4') {
    args.push(
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
    )
    if (withAudio) args.push('-c:a', 'aac', '-b:a', '192k')
  } else if (o.format === 'webm') {
    args.push(
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '32',
      '-b:v',
      '0',
      '-row-mt',
      '1',
      '-pix_fmt',
      o.transparent ? 'yuva420p' : 'yuv420p',
    )
    if (withAudio) args.push('-c:a', 'libopus', '-b:a', '160k')
  } else {
    args.push(
      '-vf',
      'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    )
  }
  args.push(o.output)
  await run(cmd, args, o.signal).done
}

/** Tiles images into one sheet, 480 px per cell, roughly square. */
export async function contactSheet(cmd: string, files: string[], output: string) {
  const list = `${output}.txt`
  await writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
  const cols = Math.ceil(Math.sqrt(files.length))
  const rows = Math.ceil(files.length / cols)
  try {
    await run(cmd, [
      '-y',
      '-v',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-vf',
      `scale=480:-2,tile=${cols}x${rows}:padding=6:color=0x444444`,
      '-frames:v',
      '1',
      output,
    ]).done
  } finally {
    await rm(list, { force: true })
  }
}

/**
 * An image as a JPEG no more than `maxSide` px on its long side, for handing to a model: 1568 is
 * the largest a vision model takes without scaling it down itself.
 */
export async function toJpeg(cmd: string, input: string, output: string, maxSide = 1568) {
  const fit = `scale='min(iw,${maxSide})':'min(ih,${maxSide})':force_original_aspect_ratio=decrease`
  await run(cmd, [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-vf',
    fit,
    '-q:v',
    '3',
    '-frames:v',
    '1',
    output,
  ]).done
  return output
}

/** Peak signal-to-noise ratio between two images. Infinity when identical. */
export async function psnr(cmd: string, a: string, b: string): Promise<number> {
  const child = spawn(cmd, ['-v', 'info', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  children.add(child)
  let log = ''
  child.stderr?.on('data', (d) => {
    log += d
  })
  await once(child, 'close')
  children.delete(child)
  const value = log.match(/average:(\S+)/)?.[1]
  if (!value) throw new Error('ffmpeg did not report PSNR')
  return value === 'inf' ? Number.POSITIVE_INFINITY : Number(value)
}

/** How loudness() starts its message when the audio is not there. */
export const AUDIO_NOT_FOUND = 'Audio file not found'

const level = (v: string) => (v === '-inf' ? Number.NEGATIVE_INFINITY : Number(v))

/** Integrated loudness and true peak of an audio file or URL, from ffmpeg's ebur128 filter. */
export async function loudness(cmd: string, file: string): Promise<AudioStats> {
  if (!/^https?:\/\//i.test(file) && !existsSync(file)) {
    throw new PagereelError(`${AUDIO_NOT_FOUND}: ${file}`)
  }
  const child = spawn(
    cmd,
    ['-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  children.add(child)
  // ebur128 logs a line every 100 ms of audio; the summary comes last.
  let log = ''
  child.stderr?.on('data', (d) => {
    log = (log + d).slice(-16_000)
  })
  const [code] = await once(child, 'close')
  children.delete(child)
  if (code !== 0) {
    if (log.includes('404 Not Found')) throw new PagereelError(`${AUDIO_NOT_FOUND}: ${file}`)
    if (log.includes('does not contain any stream')) {
      throw new PagereelError(`${file} has no audio track.`)
    }
    const last = (log.trim().split('\n').at(-1) ?? '').replace(/^Error opening \w+ files?: /, '')
    throw new PagereelError(`Could not read the audio in ${file}: ${last}`)
  }
  const summary = log.slice(log.lastIndexOf('Summary:'))
  const integrated = /I:\s+(-?inf|-?[\d.]+) LUFS/.exec(summary)?.[1]
  const peak = /True peak:\s+Peak:\s+(-?inf|-?[\d.]+) dBFS/.exec(summary)?.[1]
  if (!integrated || !peak)
    throw new PagereelError(`ffmpeg did not report the loudness of ${file}.`)
  return { integrated: level(integrated), truePeak: level(peak) }
}
