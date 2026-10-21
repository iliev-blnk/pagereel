#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { check } from './check/index.js'
import type { CheckReport, Target } from './check/types.js'
import { PagereelError } from './errors.js'
import type { Format, Progress, RenderOptions } from './options.js'
import { preview } from './preview.js'
import { render } from './render.js'
import { stills } from './stills.js'

const USAGE = `Usage:
  pagereel render <url|file> [-o out.mp4] [options]
  pagereel stills <url|file> [-o dir] [--count n | --at t1,t2]
  pagereel preview <url|file> [options]
  pagereel check <url|file> [--target ig-reel|none] [--audio file] [--json]

Options:
  -o, --output     output file (render) or folder (stills)
  --duration s     length in seconds (required for pages without window.pagereel)
  --size WxH       viewport size, default 1280x720 or the page's own
  --fps n          frames per second, default 30 or the page's own
  --scale n        device scale factor, output is size × scale
  --from s --to s  render only part of the timeline
  --workers n      parallel browser pages
  --audio file     audio track to mux in, or to measure with check
  --format f       mp4, webm, gif or png (default: from the output extension)
  --transparent    keep the page background transparent (webm, png)
  --mode m         auto, scene or clock
  --seed n         Math.random seed in clock mode
  --epoch ms       Date.now() at t=0 in clock mode
  --root dir       folder to serve for a local file
  --count n        stills: evenly spaced frames (default 16)
  --at t1,t2       stills: exact times
  --target t       check: ig-reel (default) or none
  --json           check: print the report as JSON
  -h, --help       show this help
  -v, --version    show the version`

const NUMBERS = [
  'duration',
  'fps',
  'scale',
  'from',
  'to',
  'workers',
  'seed',
  'epoch',
  'count',
] as const

function parse(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      duration: { type: 'string' },
      size: { type: 'string' },
      fps: { type: 'string' },
      scale: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      workers: { type: 'string' },
      audio: { type: 'string' },
      format: { type: 'string' },
      transparent: { type: 'boolean' },
      mode: { type: 'string' },
      seed: { type: 'string' },
      epoch: { type: 'string' },
      root: { type: 'string' },
      count: { type: 'string' },
      at: { type: 'string' },
      target: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })
  const num: Partial<Record<(typeof NUMBERS)[number], number>> = {}
  for (const key of NUMBERS) {
    const raw = values[key]
    if (raw === undefined) continue
    const n = Number(raw)
    if (!Number.isFinite(n)) throw new PagereelError(`--${key} must be a number, got "${raw}".`)
    num[key] = n
  }
  const at = values.at?.split(',').map((s) => {
    const n = Number(s)
    if (!Number.isFinite(n))
      throw new PagereelError(`--at takes numbers separated by commas, got "${values.at}".`)
    return n
  })
  const mode = values.mode
  if (mode && !['auto', 'scene', 'clock'].includes(mode)) {
    throw new PagereelError(`--mode must be auto, scene or clock, got "${mode}".`)
  }
  return { values, positionals, num, at, mode: mode as RenderOptions['mode'] }
}

async function main(argv: string[]) {
  const { values, positionals, num, at, mode } = parse(argv)
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    console.log(pkg.version)
    return
  }
  const [command, source] = positionals
  if (values.help || !command) {
    console.log(USAGE)
    return
  }
  if (!['render', 'stills', 'preview', 'check'].includes(command)) {
    throw new PagereelError(`Unknown command "${command}". Run pagereel --help.`)
  }
  if (!source) throw new PagereelError(`Missing source.\n\n${USAGE}`)

  const common = {
    source,
    duration: num.duration,
    size: values.size,
    fps: num.fps,
    scale: num.scale,
    transparent: values.transparent,
    mode,
    seed: num.seed,
    epoch: num.epoch,
    root: values.root,
  }

  if (command === 'preview') return preview(common)

  const tty = process.stderr.isTTY
  const onProgress = tty
    ? ({ frame, total }: Progress) => process.stderr.write(`\rframes ${frame}/${total}`)
    : undefined

  if (command === 'check') {
    const report = await check({
      source,
      target: values.target as Target | undefined,
      audio: values.audio,
      duration: num.duration,
      size: values.size,
      fps: num.fps,
      scale: num.scale,
      mode,
      seed: num.seed,
      epoch: num.epoch,
      root: values.root,
      onProgress,
    })
    if (tty) process.stderr.write('\n')
    console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report))
    if (report.errors > 0) process.exitCode = 1
    return
  }

  if (command === 'stills') {
    const res = await stills({ ...common, outDir: values.output, count: num.count, at })
    console.log(`${res.files.length} stills, contact sheet: ${res.contactSheet}`)
    if (res.loop) {
      const db = Number.isFinite(res.loop.psnr) ? `${res.loop.psnr.toFixed(1)} dB` : 'identical'
      console.log(`loop check: ${res.loop.seamless ? 'seamless' : 'visible jump'} (${db})`)
    }
    return
  }

  const controller = new AbortController()
  let interrupted = false
  process.on('SIGINT', () => {
    if (interrupted) process.exit(130)
    interrupted = true
    controller.abort()
  })
  const res = await render({
    ...common,
    output: values.output,
    from: num.from,
    to: num.to,
    workers: num.workers,
    audio: values.audio,
    format: values.format as Format | undefined,
    signal: controller.signal,
    onProgress,
  })
  if (tty) process.stderr.write('\n')
  console.log(`${res.output}  (${res.frames} frames in ${res.seconds.toFixed(1)}s)`)
}

/** The report for a person: notes, then each finding over its hint, then the totals. */
function formatReport(r: CheckReport): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const width = Math.max(0, ...r.findings.map((f) => f.id.length))
  const lines = [...r.notes]
  for (const f of r.findings) {
    lines.push(`${f.severity.padEnd(5)}  ${f.id.padEnd(width)}  ${f.message}`)
    lines.push(`${' '.repeat(width + 9)}→ ${f.hint}`)
  }
  lines.push(`${plural(r.errors, 'error')}, ${plural(r.warnings, 'warning')}`)
  return lines.join('\n')
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const expected = err instanceof PagereelError
  const message = err instanceof Error ? err.message : String(err)
  if (expected && message.includes('\n\n')) {
    const [first, rest] = message.split('\n\n')
    console.error(`pagereel: ${first}\n\n${rest}`)
  } else {
    console.error(`pagereel: ${expected ? message : message.split('\n')[0]}`)
  }
  if (!expected && process.env.DEBUG?.includes('pagereel') && err instanceof Error)
    console.error(err.stack)
  process.exit(1)
})
