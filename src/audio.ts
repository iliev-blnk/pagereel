// Tiny offline synth. Describe sound as cues on the same beat grid as the
// picture; this mixes them into a WAV. Deterministic, no samples, no deps.
import { spawnSync } from 'node:child_process'
import { renameSync, writeFileSync } from 'node:fs'
import { rng } from './motion.js'

export const SR = 48000

export interface Voice {
  /** 0..1 and up. */
  gain?: number
  /** -1 (left) .. 1 (right). */
  pan?: number
}

export const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/**
 * A stereo mix `seconds` long. With `loop`, tails that run past the end wrap
 * to the start so loops are seamless; otherwise they are cut.
 */
export function createMix(seconds: number, { loop = true }: { loop?: boolean } = {}) {
  const L = new Float32Array(Math.ceil(seconds * SR))
  const R = new Float32Array(L.length)
  const noise = rng(7)

  /** Adds `fn(localTime)` for `dur` seconds starting at `at`. */
  function add(
    at: number,
    dur: number,
    fn: (t: number) => number,
    { gain = 1, pan = 0 }: Voice = {},
  ) {
    const start = Math.round(at * SR)
    const n = Math.round(dur * SR)
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
    for (let i = 0; i < n; i++) {
      if (!loop && (start + i >= L.length || start + i < 0)) continue
      const j = (((start + i) % L.length) + L.length) % L.length
      const v = fn(i / SR)
      L[j] = (L[j] ?? 0) + v * gl
      R[j] = (R[j] ?? 0) + v * gr
    }
  }

  const highpassNoise = () => {
    let prev = 0
    return () => {
      const w = noise() * 2 - 1
      const hp = w - prev
      prev = w
      return hp
    }
  }

  const instruments = {
    kick(at: number, o: Voice = {}) {
      add(
        at,
        0.45,
        (t) => {
          // pitch drops 155 → 45 Hz; phase is the integral of that sweep
          const phase = 2 * Math.PI * (45 * t + (110 / 28) * (1 - Math.exp(-t * 28)))
          return Math.sin(phase) * Math.exp(-t * 7)
        },
        { gain: 0.9, ...o },
      )
    },
    hat(at: number, o: Voice = {}) {
      const hp = highpassNoise()
      add(at, 0.08, (t) => hp() * Math.exp(-t * 60), { gain: 0.18, ...o })
    },
    click(at: number, o: Voice = {}) {
      add(
        at,
        0.04,
        (t) =>
          Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 180) +
          (noise() - 0.5) * Math.exp(-t * 400),
        { gain: 0.35, ...o },
      )
    },
    blip(at: number, freq = 880, o: Voice = {}) {
      add(
        at,
        0.25,
        (t) => Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 14) * Math.min(1, t * 400),
        { gain: 0.22, ...o },
      )
    },
    bass(at: number, dur: number, freq: number, o: Voice = {}) {
      add(
        at,
        dur,
        (t) => {
          const env = Math.min(1, t * 60) * Math.min(1, (dur - t) * 30)
          return Math.tanh(2.2 * Math.sin(2 * Math.PI * freq * t)) * 0.6 * env
        },
        { gain: 0.32, ...o },
      )
    },
    pad(at: number, dur: number, freqs: number[], o: Voice = {}) {
      add(
        at,
        dur,
        (t) => {
          const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.6)
          let s = 0
          for (const f of freqs)
            s += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t)
          return (s / freqs.length) * env
        },
        { gain: 0.07, ...o },
      )
    },
    /** FM bell: ice, sparkle, chimes. */
    bell(at: number, freq: number, o: Voice & { dur?: number } = {}) {
      const dur = o.dur ?? 1.8
      add(
        at,
        dur,
        (t) => {
          const idx = 2.6 * Math.exp(-t * 6)
          return (
            Math.sin(2 * Math.PI * freq * t + idx * Math.sin(2 * Math.PI * freq * 1.4 * t)) *
            Math.exp(-t * 2.8) *
            Math.min(1, t * 800)
          )
        },
        { gain: 0.16, ...o },
      )
    },
    /** Sub boom: a long sine drop for big moments. */
    sub(at: number, o: Voice = {}) {
      add(
        at,
        2.4,
        (t) =>
          Math.sin(2 * Math.PI * (32 * t + (40 / 3) * (1 - Math.exp(-t * 3)))) *
          Math.exp(-t * 1.5) *
          Math.min(1, t * 300),
        { gain: 0.75, ...o },
      )
    },
    snare(at: number, o: Voice = {}) {
      add(
        at,
        0.25,
        (t) =>
          (noise() * 2 - 1) * Math.exp(-t * 20) * 0.7 +
          Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 32),
        { gain: 0.3, ...o },
      )
    },
    crash(at: number, o: Voice = {}) {
      const hp = highpassNoise()
      add(at, 2.2, (t) => hp() * Math.exp(-t * 2.2), { gain: 0.2, ...o })
    },
    /** Rising noise swell that peaks at `at`. Put it on a morph. */
    whoosh(at: number, len = 0.5, o: Voice = {}) {
      let lp = 0
      add(
        at - len,
        len + 0.15,
        (t) => {
          const p = Math.min(1, t / len)
          lp += (0.02 + 0.5 * p * p) * (noise() * 2 - 1 - lp)
          return lp * (t < len ? p * p : Math.exp(-(t - len) * 30))
        },
        { gain: 0.5, ...o },
      )
    },
  }

  /**
   * Writes a 16-bit stereo WAV, peak-limited to 0.89. With `lufs`, loudness is
   * normalised by ffmpeg (social apps play at about -14 LUFS).
   */
  function write(
    path: string,
    {
      lufs,
      ffmpeg = process.env.PAGEREEL_FFMPEG ?? 'ffmpeg',
    }: { lufs?: number; ffmpeg?: string } = {},
  ) {
    let peak = 0
    for (let i = 0; i < L.length; i++)
      peak = Math.max(peak, Math.abs(L[i] ?? 0), Math.abs(R[i] ?? 0))
    const norm = peak > 0.89 ? 0.89 / peak : 1
    const buf = Buffer.alloc(44 + L.length * 4)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + L.length * 4, 4)
    buf.write('WAVE', 8)
    buf.write('fmt ', 12)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(2, 22)
    buf.writeUInt32LE(SR, 24)
    buf.writeUInt32LE(SR * 4, 28)
    buf.writeUInt16LE(4, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(L.length * 4, 40)
    const s16 = (v: number) => Math.round(Math.max(-1, Math.min(1, v * norm)) * 32767)
    for (let i = 0; i < L.length; i++) {
      buf.writeInt16LE(s16(L[i] ?? 0), 44 + i * 4)
      buf.writeInt16LE(s16(R[i] ?? 0), 46 + i * 4)
    }
    writeFileSync(path, buf)
    if (lufs != null) {
      const tmp = `${path}.norm.wav`
      const r = spawnSync(ffmpeg, [
        '-y',
        '-v',
        'error',
        '-i',
        path,
        '-af',
        `loudnorm=I=${lufs}:TP=-1:LRA=11`,
        '-ar',
        String(SR),
        tmp,
      ])
      if (r.status !== 0) throw new Error(`loudnorm failed: ${r.stderr}`)
      renameSync(tmp, path)
    }
  }

  return { ...instruments, add, write }
}

export type Mix = ReturnType<typeof createMix>
