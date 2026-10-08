// Pure functions of time. Usable in the page and in Node, so picture and sound
// can share one clock. Nothing here reads a real timer.

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a))

export interface SpringConfig {
  /** Natural frequency in Hz. Higher is faster. */
  freq: number
  /** Damping ratio. Below 1 overshoots. */
  zeta: number
}

/** Closed-form damped spring: step response from 0 to 1, `t` seconds after it starts. */
export function spring(t: number, { freq = 2, zeta = 0.8 }: Partial<SpringConfig> = {}): number {
  if (t <= 0) return 0
  const w = 2 * Math.PI * freq
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t))
  }
  if (zeta === 1) return 1 - Math.exp(-w * t) * (1 + w * t)
  const r1 = -w * (zeta - Math.sqrt(zeta * zeta - 1))
  const r2 = -w * (zeta + Math.sqrt(zeta * zeta - 1))
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1)
}

export const SPRINGS = {
  /** Buttons, toggles, leading edges. */
  snappy: { freq: 3.2, zeta: 0.78 },
  /** Cards, containers, camera. */
  default: { freq: 2.0, zeta: 0.86 },
  /** Big type, logo lockups. No overshoot. */
  heavy: { freq: 1.3, zeta: 1.0 },
  /** Mascots, stickers. Visible overshoot. */
  playful: { freq: 2.4, zeta: 0.45 },
} satisfies Record<string, SpringConfig>

export type SpringPreset = keyof typeof SPRINGS | SpringConfig
export type Change = [at: number, value: number, preset?: SpringPreset]

const preset = (p?: SpringPreset): SpringConfig =>
  (typeof p === 'string' ? SPRINGS[p] : p) ?? SPRINGS.default

/**
 * A value that changes target several times. Each change adds its own spring
 * starting at its own time, so motion stays continuous and any frame can be
 * computed without simulating the frames before it.
 *
 *   const w = track(360, [[2, 120, 'snappy'], [4, 560]]); w(3.1)
 */
export function track(initial: number, changes: Change[]): (t: number) => number {
  const steps: { at: number; delta: number; cfg: SpringConfig }[] = []
  let prev = initial
  for (const [at, value, p] of changes) {
    steps.push({ at, delta: value - prev, cfg: preset(p) })
    prev = value
  }
  return (t) => steps.reduce((v, s) => v + s.delta * spring(t - s.at, s.cfg), initial)
}

/** `track` for '#rrggbb' colours. Returns 'rgb(r,g,b)'. */
export function colorTrack(
  initial: string,
  changes: [at: number, hex: string, preset?: SpringPreset][],
): (t: number) => string {
  const ch = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const tracks = [0, 1, 2].map((i) =>
    track(
      ch(initial)[i] ?? 0,
      changes.map(([at, hex, p]) => [at, ch(hex)[i] ?? 0, p]),
    ),
  )
  return (t) => `rgb(${tracks.map((f) => Math.round(clamp(f(t), 0, 255))).join(',')})`
}

export interface Beats {
  /** Beat n → seconds. */
  (n: number): number
  bpm: number
  /** Seconds per beat. */
  spb: number
  /** Seconds → fractional beat. */
  index(t: number): number
  /** 1 on each beat, decaying until the next. */
  pulse(t: number, decay?: number): number
}

/** Beat grid. Put every cue on it instead of hand-typing seconds. */
export function beats(bpm: number): Beats {
  const spb = 60 / bpm
  const at = ((n: number) => n * spb) as Beats
  at.bpm = bpm
  at.spb = spb
  at.index = (t) => t / spb
  at.pulse = (t, decay = 6) => Math.exp(-decay * ((t / spb) % 1) * spb)
  return at
}

/** Plain eases, for things that should not feel physical (opacity, wipes). */
export const ease = {
  inOut: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  out: (p: number) => 1 - (1 - p) ** 3,
  in: (p: number) => p * p * p,
}

/** 0 → 1 between `a` and `b` seconds with an ease. */
export const fade = (t: number, a: number, b: number, e: (p: number) => number = ease.inOut) =>
  e(invLerp(a, b, t))

/** Deterministic PRNG: same seed, same sequence, every render. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let r = Math.imul(s ^ (s >>> 15), 1 | s)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
