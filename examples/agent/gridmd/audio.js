// Copied from pagereel 0.1.1 by pagereel init.
// src/audio.ts
import { spawnSync } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";

// src/motion.ts
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let r = Math.imul(s ^ s >>> 15, 1 | s);
    r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

// src/audio.ts
var SR = 48e3;
var CEILING = -1.5;
var note = (midi) => 440 * 2 ** ((midi - 69) / 12);
function createMix(seconds, { loop = true } = {}) {
  const L = new Float32Array(Math.ceil(seconds * SR));
  const R = new Float32Array(L.length);
  const noise = rng(7);
  function add(at, dur, fn, { gain = 1, pan = 0 } = {}) {
    const start = Math.round(at * SR);
    const n = Math.round(dur * SR);
    const gl = gain * Math.cos((pan + 1) * Math.PI / 4);
    const gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n; i++) {
      if (!loop && (start + i >= L.length || start + i < 0)) continue;
      const j = ((start + i) % L.length + L.length) % L.length;
      const v = fn(i / SR);
      L[j] = (L[j] ?? 0) + v * gl;
      R[j] = (R[j] ?? 0) + v * gr;
    }
  }
  const highpassNoise = () => {
    let prev = 0;
    return () => {
      const w = noise() * 2 - 1;
      const hp = w - prev;
      prev = w;
      return hp;
    };
  };
  const instruments = {
    kick(at, o = {}) {
      add(
        at,
        0.45,
        (t) => {
          const phase = 2 * Math.PI * (45 * t + 110 / 28 * (1 - Math.exp(-t * 28)));
          return Math.sin(phase) * Math.exp(-t * 7);
        },
        { gain: 0.9, ...o }
      );
    },
    hat(at, o = {}) {
      const hp = highpassNoise();
      add(at, 0.08, (t) => hp() * Math.exp(-t * 60), { gain: 0.18, ...o });
    },
    click(at, o = {}) {
      add(
        at,
        0.04,
        (t) => Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 180) + (noise() - 0.5) * Math.exp(-t * 400),
        { gain: 0.35, ...o }
      );
    },
    blip(at, freq = 880, o = {}) {
      add(
        at,
        0.25,
        (t) => Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 14) * Math.min(1, t * 400),
        { gain: 0.22, ...o }
      );
    },
    bass(at, dur, freq, o = {}) {
      add(
        at,
        dur,
        (t) => {
          const env = Math.min(1, t * 60) * Math.min(1, (dur - t) * 30);
          return Math.tanh(2.2 * Math.sin(2 * Math.PI * freq * t)) * 0.6 * env;
        },
        { gain: 0.32, ...o }
      );
    },
    pad(at, dur, freqs, o = {}) {
      add(
        at,
        dur,
        (t) => {
          const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.6);
          let s = 0;
          for (const f of freqs)
            s += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t);
          return s / freqs.length * env;
        },
        { gain: 0.07, ...o }
      );
    },
    /** FM bell: ice, sparkle, chimes. */
    bell(at, freq, o = {}) {
      const dur = o.dur ?? 1.8;
      add(
        at,
        dur,
        (t) => {
          const idx = 2.6 * Math.exp(-t * 6);
          return Math.sin(2 * Math.PI * freq * t + idx * Math.sin(2 * Math.PI * freq * 1.4 * t)) * Math.exp(-t * 2.8) * Math.min(1, t * 800);
        },
        { gain: 0.16, ...o }
      );
    },
    /** Sub boom: a long sine drop for big moments. */
    sub(at, o = {}) {
      add(
        at,
        2.4,
        (t) => Math.sin(2 * Math.PI * (32 * t + 40 / 3 * (1 - Math.exp(-t * 3)))) * Math.exp(-t * 1.5) * Math.min(1, t * 300),
        { gain: 0.75, ...o }
      );
    },
    snare(at, o = {}) {
      add(
        at,
        0.25,
        (t) => (noise() * 2 - 1) * Math.exp(-t * 20) * 0.7 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 32),
        { gain: 0.3, ...o }
      );
    },
    crash(at, o = {}) {
      const hp = highpassNoise();
      add(at, 2.2, (t) => hp() * Math.exp(-t * 2.2), { gain: 0.2, ...o });
    },
    /** Rising noise swell that peaks at `at`. Put it on a morph. */
    whoosh(at, len = 0.5, o = {}) {
      let lp = 0;
      add(
        at - len,
        len + 0.15,
        (t) => {
          const p = Math.min(1, t / len);
          lp += (0.02 + 0.5 * p * p) * (noise() * 2 - 1 - lp);
          return lp * (t < len ? p * p : Math.exp(-(t - len) * 30));
        },
        { gain: 0.5, ...o }
      );
    }
  };
  function write(path, {
    lufs,
    ffmpeg = process.env.PAGEREEL_FFMPEG ?? "ffmpeg"
  } = {}) {
    let peak = 0;
    for (let i = 0; i < L.length; i++)
      peak = Math.max(peak, Math.abs(L[i] ?? 0), Math.abs(R[i] ?? 0));
    const norm = peak > 0.89 ? 0.89 / peak : 1;
    const buf = Buffer.alloc(44 + L.length * 4);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + L.length * 4, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(SR, 24);
    buf.writeUInt32LE(SR * 4, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(L.length * 4, 40);
    const s16 = (v) => Math.round(Math.max(-1, Math.min(1, v * norm)) * 32767);
    for (let i = 0; i < L.length; i++) {
      buf.writeInt16LE(s16(L[i] ?? 0), 44 + i * 4);
      buf.writeInt16LE(s16(R[i] ?? 0), 46 + i * 4);
    }
    writeFileSync(path, buf);
    if (lufs != null) {
      const tmp = `${path}.norm.wav`;
      const filter = (af) => {
        const r = spawnSync(ffmpeg, [
          "-y",
          "-v",
          "error",
          "-i",
          path,
          "-af",
          af,
          "-ar",
          String(SR),
          tmp
        ]);
        if (r.status !== 0) throw new Error(`${af.split("=")[0]} failed: ${r.stderr}`);
        renameSync(tmp, path);
      };
      filter(`loudnorm=I=${lufs}:TP=${CEILING}:LRA=11`);
      const over = truePeak(ffmpeg, path) - CEILING;
      if (over > 0) filter(`volume=${(-over).toFixed(2)}dB`);
    }
  }
  return { ...instruments, add, write };
}
function truePeak(ffmpeg, path) {
  const r = spawnSync(
    ffmpeg,
    ["-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
    // ebur128 logs a line per 100 ms of audio before its summary.
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const peak = /True peak:\s+Peak:\s+(-?inf|-?[\d.]+) dBFS/.exec(summary)?.[1];
  if (r.status !== 0 || !peak) throw new Error(`ebur128 failed: ${r.stderr.slice(-500)}`);
  return peak.endsWith("inf") ? -Infinity : Number(peak);
}
export {
  SR,
  createMix,
  note
};
