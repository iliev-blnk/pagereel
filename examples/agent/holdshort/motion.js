// Copied from pagereel 0.1.1 by pagereel init.
// src/motion.ts
var clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
var lerp = (a, b, p) => a + (b - a) * p;
var invLerp = (a, b, x) => clamp((x - a) / (b - a));
function spring(t, { freq = 2, zeta = 0.8 } = {}) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta * w / wd * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const r1 = -w * (zeta - Math.sqrt(zeta * zeta - 1));
  const r2 = -w * (zeta + Math.sqrt(zeta * zeta - 1));
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}
var SPRINGS = {
  /** Buttons, toggles, leading edges. */
  snappy: { freq: 3.2, zeta: 0.78 },
  /** Cards, containers, camera. */
  default: { freq: 2, zeta: 0.86 },
  /** Big type, logo lockups. No overshoot. */
  heavy: { freq: 1.3, zeta: 1 },
  /** Mascots, stickers. Visible overshoot. */
  playful: { freq: 2.4, zeta: 0.45 }
};
var preset = (p) => (typeof p === "string" ? SPRINGS[p] : p) ?? SPRINGS.default;
function track(initial, changes) {
  const steps = [];
  let prev = initial;
  for (const [at, value, p] of changes) {
    steps.push({ at, delta: value - prev, cfg: preset(p) });
    prev = value;
  }
  return (t) => steps.reduce((v, s) => v + s.delta * spring(t - s.at, s.cfg), initial);
}
function colorTrack(initial, changes) {
  const ch = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const tracks = [0, 1, 2].map(
    (i) => track(
      ch(initial)[i] ?? 0,
      changes.map(([at, hex, p]) => [at, ch(hex)[i] ?? 0, p])
    )
  );
  return (t) => `rgb(${tracks.map((f) => Math.round(clamp(f(t), 0, 255))).join(",")})`;
}
function beats(bpm) {
  const spb = 60 / bpm;
  const at = ((n) => n * spb);
  at.bpm = bpm;
  at.spb = spb;
  at.index = (t) => t / spb;
  at.pulse = (t, decay = 6) => Math.exp(-decay * (t / spb % 1) * spb);
  return at;
}
var ease = {
  inOut: (p) => p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2,
  out: (p) => 1 - (1 - p) ** 3,
  in: (p) => p * p * p
};
var fade = (t, a, b, e = ease.inOut) => e(invLerp(a, b, t));
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let r = Math.imul(s ^ s >>> 15, 1 | s);
    r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
export {
  SPRINGS,
  beats,
  clamp,
  colorTrack,
  ease,
  fade,
  invLerp,
  lerp,
  rng,
  spring,
  track
};
