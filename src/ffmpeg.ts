import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
  if (withAudio) args.push('-map', '1:a?')
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
