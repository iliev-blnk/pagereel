import type { AudioStats, Finding, FrameStat, Target, TextSample } from './types.js'

/**
 * Instagram's reel format and the strips its interface covers, at 1080×1920. Approximations of
 * Meta's published guidance; tune them here.
 */
export const IG_REEL = {
  width: 1080,
  height: 1920,
  safe: { top: 220, bottom: 440, right: 150, rightFromY: 960 },
} as const

/**
 * Consecutive text samples (0.25 s apart) a geometry or contrast problem must last before it
 * counts, so text sliding in from off-screen or through a mask isn't reported.
 */
export const PERSIST = 3

/** Mean luma change from the previous frame (0–255) under which a frame counts as still. */
export const DEAD_DIFF = 0.5

const SAFE_TOLERANCE = 4
const MIN_PX = 28
const WARN_PX = 36
const MIN_CONTRAST = 3
const DEAD_SECONDS = 2.5
const FLASH_STEP = 0.1
const FLASH_DARK = 0.8
const MAX_FLASHES = 3
const EPS = 1e-9

type Box = TextSample['boxes'][number]

interface Run {
  label: string
  from: number
  to: number
  boxes: Box[]
}

const range = (from: number, to: number) => `${from.toFixed(2)}–${to.toFixed(2)} s`

/**
 * Runs of consecutive samples in which `test` holds for the same text. Each sample stands for
 * the `step` seconds after it, cut short at `end`, the end of the reel.
 */
function textRuns(
  samples: TextSample[],
  step: number,
  end: number,
  test: (b: Box) => boolean,
): Run[] {
  const open = new Map<string, Run>()
  const done: Run[] = []
  for (const s of samples) {
    const seen = new Set<string>()
    for (const b of s.boxes) {
      if (seen.has(b.key) || !test(b)) continue
      seen.add(b.key)
      const run = open.get(b.key)
      const to = Math.min(s.t + step, end)
      if (run) {
        run.to = to
        run.boxes.push(b)
      } else open.set(b.key, { label: b.label, from: s.t, to, boxes: [b] })
    }
    for (const [key, run] of open) {
      if (seen.has(key)) continue
      done.push(run)
      open.delete(key)
    }
  }
  done.push(...open.values())
  return done.sort((a, b) => a.from - b.from)
}

const lasting = (runs: Run[]) => runs.filter((r) => r.boxes.length >= PERSIST)

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2
}

/** Output size and length. `width`/`height` are output pixels. */
export function formatRule(o: {
  width: number
  height: number
  duration: number
  target: Target
}): Finding[] {
  if (o.target !== 'ig-reel') return []
  const { width, height } = IG_REEL
  const out: Finding[] = []
  if (o.width !== width || o.height !== height)
    out.push({
      id: 'format',
      severity: 'error',
      from: 0,
      to: 0,
      message: `The output is ${o.width}×${o.height}; Instagram reels are ${width}×${height}`,
      hint: `Make the stage ${width}×${height}, or ${width / 2}×${height / 2} rendered with --scale 2.`,
    })
  if (o.duration < 3)
    out.push({
      id: 'format',
      severity: 'error',
      from: 0,
      to: 0,
      message: `${o.duration.toFixed(1)} s is too short for a reel (3 s minimum)`,
      hint: 'Make it 3–90 s long; 15–20 s suits most reels.',
    })
  else if (o.duration > 90)
    out.push({
      id: 'format',
      severity: 'warn',
      from: 0,
      to: 0,
      message: `${o.duration.toFixed(1)} s is over 90 s; Instagram may not show it as a reel`,
      hint: 'Cut it to 90 s or less.',
    })
  return out
}

/** Text under Instagram's interface. `k` scales the viewport to 1080 wide. */
export function safeZoneRule(
  samples: TextSample[],
  step: number,
  k: number,
  end = Number.POSITIVE_INFINITY,
): Finding[] {
  const { top, bottom, right, rightFromY } = IG_REEL.safe
  const maxY = IG_REEL.height - bottom
  const maxX = IG_REEL.width - right
  const zone = (b: Box): string | undefined => {
    if (b.y * k < top - SAFE_TOLERANCE) return `the reel header (top ${top} px)`
    if ((b.y + b.h) * k > maxY + SAFE_TOLERANCE)
      return `Instagram's caption area (bottom ${bottom} px)`
    if ((b.x + b.w) * k > maxX + SAFE_TOLERANCE && (b.y + b.h) * k > rightFromY + SAFE_TOLERANCE)
      return `the like, comment and share buttons (right ${right} px)`
    return undefined
  }
  return lasting(textRuns(samples, step, end, (b) => zone(b) !== undefined)).map((r) => ({
    id: 'safe-zone',
    severity: 'error',
    from: r.from,
    to: r.to,
    message: `"${r.label}" is under ${r.boxes[0] && zone(r.boxes[0])} at ${range(r.from, r.to)}`,
    hint: `Keep text between y=${top} and y=${maxY}, and left of x=${maxX} below y=${rightFromY} (at ${IG_REEL.width}×${IG_REEL.height}).`,
  }))
}

/** Type too small to read on a phone. `k` scales the viewport to 1080 wide. */
export function textSizeRule(
  samples: TextSample[],
  step: number,
  k: number,
  end = Number.POSITIVE_INFINITY,
): Finding[] {
  return lasting(textRuns(samples, step, end, (b) => b.fontPx * k < WARN_PX)).map((r) => {
    const px = median(r.boxes.map((b) => b.fontPx * k))
    const error = px < MIN_PX
    return {
      id: 'text-size',
      severity: error ? 'error' : 'warn',
      from: r.from,
      to: r.to,
      message: `"${r.label}" is ${Math.round(px)} px type at ${range(r.from, r.to)}, ${error ? 'unreadable' : 'hard to read'} on a phone`,
      hint: `Use at least ${WARN_PX} px type (at ${IG_REEL.width} wide); text people must read works best at 48 px and up.`,
    }
  })
}

/** Text cut off by the frame or by an overflow-hidden box. */
export function clippedRule(
  samples: TextSample[],
  step: number,
  end = Number.POSITIVE_INFINITY,
): Finding[] {
  return lasting(textRuns(samples, step, end, (b) => b.clipped)).map((r) => ({
    id: 'text-clipped',
    severity: 'error',
    from: r.from,
    to: r.to,
    message: `"${r.label}" is cut off at ${range(r.from, r.to)}`,
    hint: 'Shorten the text, enlarge its box, or keep it inside the frame.',
  }))
}

/** Text that leaves before it can be read: 0.6 s plus 1 s per 3.5 words. */
export function readingTimeRule(
  samples: TextSample[],
  step: number,
  end = Number.POSITIVE_INFINITY,
): Finding[] {
  const out: Finding[] = []
  for (const r of textRuns(samples, step, end, () => true)) {
    const words = Math.max(...r.boxes.map((b) => b.words))
    const need = 0.6 + words / 3.5
    const shown = r.to - r.from
    if (shown + EPS >= need) continue
    out.push({
      id: 'reading-time',
      severity: 'warn',
      from: r.from,
      to: r.to,
      message: `"${r.label}" (${words} words) is on screen for ${shown.toFixed(2)} s at ${range(r.from, r.to)}; reading it takes about ${need.toFixed(1)} s`,
      hint: 'Hold text for 0.6 s plus 1 s per 3.5 words, or cut words.',
    })
  }
  return out
}

/** Fully opaque text that doesn't stand out from what is behind it. */
export function contrastRule(
  samples: TextSample[],
  step: number,
  end = Number.POSITIVE_INFINITY,
): Finding[] {
  const low = (b: Box) => b.opacity >= 0.95 && b.contrast !== undefined && b.contrast < MIN_CONTRAST
  return lasting(textRuns(samples, step, end, low)).map((r) => {
    const min = Math.min(...r.boxes.map((b) => b.contrast ?? MIN_CONTRAST))
    return {
      id: 'contrast',
      severity: 'warn',
      from: r.from,
      to: r.to,
      message: `"${r.label}" has ${min.toFixed(1)}:1 contrast with what is behind it at ${range(r.from, r.to)}`,
      hint: `Aim for ${MIN_CONTRAST}:1 or more (4.5:1 for small text): change the text colour or darken what is behind it.`,
    }
  })
}

/** An opening that gives people nothing to look at. */
export function hookRule(frames: FrameStat[]): Finding[] {
  const first = frames[0]
  if (!first) return []
  const out: Finding[] = []
  const at = frames.reduce((a, b) => (Math.abs(b.t - 0.5) < Math.abs(a.t - 0.5) ? b : a), first)
  if (at.std < 4)
    out.push({
      id: 'hook',
      severity: 'warn',
      from: 0,
      to: at.t,
      message: `The frame at ${at.t.toFixed(2)} s is nearly a flat colour`,
      hint: 'Open on something: a bold shape, the product or a line of text in the first half second.',
    })
  if (!frames.some((f) => f.t > 0 && f.t <= 1.5 + EPS && f.diff >= DEAD_DIFF))
    out.push({
      id: 'hook',
      severity: 'warn',
      from: 0,
      to: 1.5,
      message: 'Nothing moves in the first 1.50 s',
      hint: 'Move or cut something before 1.5 s; the first second decides whether people stay.',
    })
  return out
}

/** Stretches of 2.5 s or more where nothing moves. */
export function deadAirRule(frames: FrameStat[], fps: number): Finding[] {
  const out: Finding[] = []
  let start = -1
  const close = (end: number) => {
    if (start >= 0 && (end - start) / fps >= DEAD_SECONDS - EPS) {
      const from = frames[start]?.t ?? 0
      const to = (frames[end - 1]?.t ?? 0) + 1 / fps
      out.push({
        id: 'dead-air',
        severity: 'warn',
        from,
        to,
        message: `Nothing moves for ${(to - from).toFixed(1)} s at ${range(from, to)}`,
        hint: 'Keep something alive (a slow drift, a pulse on the beat) or cut sooner.',
      })
    }
    start = -1
  }
  frames.forEach((f, i) => {
    if (f.diff < DEAD_DIFF) {
      if (start < 0) start = i
    } else close(i)
  })
  close(frames.length)
  return out
}

/**
 * More than three general flashes in any second (WCAG 2.3.1), simplified to the whole frame's
 * mean relative luminance rather than flashing area.
 */
export function flashRule(frames: FrameStat[], fps: number): Finding[] {
  // Monotone runs of luminance; a run big enough to count is a transition.
  const transitions: Array<{ t: number; dir: number }> = []
  let start = 0
  let end = 0
  let dir = 0
  const close = () => {
    const a = frames[start]?.mean ?? 0
    const b = frames[end]?.mean ?? 0
    if (dir !== 0 && Math.abs(b - a) >= FLASH_STEP && Math.min(a, b) < FLASH_DARK)
      transitions.push({ t: frames[end]?.t ?? 0, dir })
  }
  for (let i = 1; i < frames.length; i++) {
    const d = (frames[i]?.mean ?? 0) - (frames[i - 1]?.mean ?? 0)
    if (Math.abs(d) < 1e-4) continue
    if (Math.sign(d) !== dir) {
      close()
      start = i - 1
      dir = Math.sign(d)
    }
    end = i
  }
  close()

  // A flash is a pair of opposite transitions.
  const flashes: number[] = []
  for (let j = 0; j + 1 < transitions.length; ) {
    const a = transitions[j]
    const b = transitions[j + 1]
    if (a && b && a.dir !== b.dir) {
      flashes.push(b.t)
      j += 2
    } else j += 1
  }

  // Windows [t, t + 1 s) holding more than three, merged where they overlap.
  const stretches: Array<{ from: number; to: number; peak: number }> = []
  for (let k = 0; k < flashes.length; k++) {
    const t0 = flashes[k] ?? 0
    let n = 0
    while (k + n < flashes.length && (flashes[k + n] ?? 0) < t0 + 1 - EPS) n++
    if (n <= MAX_FLASHES) continue
    const t1 = (flashes[k + n - 1] ?? 0) + 1 / fps
    const last = stretches.at(-1)
    if (last && t0 <= last.to) {
      last.to = Math.max(last.to, t1)
      last.peak = Math.max(last.peak, n)
    } else stretches.push({ from: t0, to: t1, peak: n })
  }
  return stretches.map((s) => ({
    id: 'flash',
    severity: 'error',
    from: s.from,
    to: s.to,
    message: `${s.peak} flashes within one second at ${range(s.from, s.to)}; more than ${MAX_FLASHES} can trigger seizures`,
    hint: `Keep it to ${MAX_FLASHES} flashes a second or fewer, or keep each change under 10 % of full luminance.`,
  }))
}

/**
 * Loudness and true peak, measured with ffmpeg's ebur128 filter. `missing` names a track the
 * scene declares that does not exist yet.
 */
export function audioRule(stats: AudioStats | null, missing?: string): Finding[] {
  if (!stats)
    return [
      missing
        ? {
            id: 'audio',
            severity: 'warn',
            from: 0,
            to: 0,
            message: `The scene's audio, ${missing}, was not found`,
            hint: 'Make the track before you render (render needs it), or remove window.pagereel.audio.',
          }
        : {
            id: 'audio',
            severity: 'warn',
            from: 0,
            to: 0,
            message: 'There is no audio',
            hint: 'Add a track: set window.pagereel.audio in the scene or pass --audio <file>.',
          },
    ]
  const out: Finding[] = []
  if (stats.truePeak > -1)
    out.push({
      id: 'audio',
      severity: 'error',
      from: 0,
      to: 0,
      message: `The true peak is ${stats.truePeak.toFixed(1)} dBTP; above -1 dBTP it clips once Instagram re-encodes it`,
      hint: 'Normalize with a ceiling under -1 dBTP, e.g. mix.write(path, { lufs: -14 }) from pagereel/audio.',
    })
  if (stats.integrated < -16 || stats.integrated > -12)
    out.push({
      id: 'audio',
      severity: 'warn',
      from: 0,
      to: 0,
      message: `The mix is ${stats.integrated.toFixed(1)} LUFS; reels sit around -14 LUFS`,
      hint: 'Normalize to -14 LUFS, e.g. mix.write(path, { lufs: -14 }) from pagereel/audio.',
    })
  return out
}
