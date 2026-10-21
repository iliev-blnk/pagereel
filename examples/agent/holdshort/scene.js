// The reel. Every value that moves is a track or a pure function of t built here, once;
// seek(t) only reads them and writes styles, so any frame renders the same every time.
import { fade, rng, track } from './motion.js'
import { B, cue, DURATION } from './timeline.js'

const INK = '#e6e9ec'
const BLUE = '#4da3ff'
const ORANGE = '#ff9f43'

const make = (cls, parent, tag = 'div') => {
  const el = Object.assign(document.createElement(tag), { className: cls })
  parent.append(el)
  return el
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

const stage = document.getElementById('stage')
const field = make('field', stage)
const cam = make('cam', field)

// ---- Radar -------------------------------------------------------------------------------

const RWY = { '34L': 480, '35R': 640 }
const runways = Object.entries(RWY).map(([name, x]) => {
  const el = make('runway', cam)
  el.style.left = `${x}px`
  const label = make('rwy', cam)
  label.style.left = `${x}px`
  label.textContent = name
  return el
})
const draw = track(0, [[0, 1, 'default']])

const quad = (p0, c, e, u) => {
  const a = (1 - u) ** 2
  const b = 2 * (1 - u) * u
  const d = u * u
  return {
    x: a * p0[0] + b * c[0] + d * e[0],
    y: a * p0[1] + b * c[1] + d * e[1],
    vx: 2 * (1 - u) * (c[0] - p0[0]) + 2 * u * (e[0] - c[0]),
    vy: 2 * (1 - u) * (c[1] - p0[1]) + 2 * u * (e[1] - c[1]),
  }
}
const cubic = (p, u) => {
  const m = 1 - u
  const w = [m * m * m, 3 * m * m * u, 3 * m * u * u, u * u * u]
  const dw = [-3 * m * m, 3 * m * m - 6 * m * u, 6 * m * u - 3 * u * u, 3 * u * u]
  const sum = (k, ws) => ws.reduce((s, wi, i) => s + wi * p[i][k], 0)
  return { x: sum(0, w), y: sum(1, w), vx: sum(0, dw), vy: sum(1, dw) }
}

const rand = rng(3)
const planes = []
const addPlane = (color, t0, dur, path, fadeIn) => {
  const el = make('plane', cam)
  const tail = make('tail', el)
  const arrow = make('arrow', el)
  tail.style.background = color
  arrow.style.background = color
  planes.push({ el, t0, dur, path, fadeIn })
}

// Arrivals: already in flight at 0, one every 1.25 beats, onto 34L and 35R. Through the
// go-around only 34L is used, so nothing crosses the plane that turns away.
for (let t0 = -B(4); t0 < DURATION; t0 += B(1.25)) {
  const quiet = t0 > B(15) && t0 < B(24)
  const rx = quiet || rand() < 0.5 ? RWY['34L'] : RWY['35R']
  const sx = clamp(rx + (rand() - 0.8) * 1200, 40, 1040)
  addPlane(BLUE, t0, B(4), (u) => quad([sx, -60], [rx, 200], [rx, 600], u), false)
}
// Departures from 35R start on beat 8 and climb out; none through the go-around.
for (let t0 = B(8); t0 < DURATION; t0 += B(1.5)) {
  const ex = clamp(640 + (rand() - 0.5) * 1000, 40, 1040)
  if (t0 > B(17) && t0 < B(23)) continue
  addPlane(ORANGE, t0, B(4), (u) => quad([640, 740], [640, 400], [ex, -60], u), true)
}
// The go-around: down the final to 35R, then away over the threshold.
const GA = [[640, -60], [640, 400], [640, 880], [1000, -80]]
addPlane(BLUE, cue.cut2, B(8), (u) => cubic(GA, u), false)
const ga = planes.at(-1)
const ring = make('ring', cam)

// The camera pushes in for the go-around and pulls back for the numbers.
const zoom = track(1, [[cue.cut2, 1.2, 'heavy'], [cue.cut3, 1, 'heavy']])

// ---- Type --------------------------------------------------------------------------------

const slotOf = (size) => Math.ceil(size * 1.25)
const lines = []
const addLine = ({ text, size, y, at, out = Infinity, cls = '' }) => {
  const slot = slotOf(size)
  const mask = make('mask', stage)
  mask.style.top = `${y}px`
  mask.style.height = `${slot}px`
  const el = make(`line ${cls}`.trim(), mask, 'p')
  el.style.fontSize = `${size}px`
  el.style.lineHeight = `${slot}px`
  const fixed = typeof text === 'string'
  if (fixed) el.textContent = text
  const moves = [[at, 0, 'snappy']]
  if (out !== Infinity) moves.push([out, -slot, 'snappy'])
  lines.push({ el, y: track(slot, moves), text: fixed ? null : text })
  return slot
}
// Stack lines downward from y, each at its own cue; returns nothing, the layout is fixed.
const stack = (y, specs, out) => {
  let top = y
  for (const spec of specs) top += addLine({ ...spec, y: top, out })
}

// A section's lines leave half a beat before the next one's arrive, so the two never overlap.
const GAP = B(0.5)
stack(980, [
  { text: 'holdshort', size: 168, at: cue.typeIn },
  { text: 'Istanbul Airport', size: 84, at: cue.typeIn + B(0.25) },
], cue.cut1 - GAP)
stack(980, [
  { text: 'Rebuilt from', size: 120, at: cue.cut1 },
  { text: 'open ADS-B', size: 120, at: cue.cut1 + B(0.25) },
  { text: 'data.', size: 120, at: cue.cut1 + B(0.5) },
], cue.cut2 - GAP)
stack(980, [
  { text: 'Every flight,', size: 100, at: cue.cut2 },
  { text: 'runway', size: 100, at: B(18) },
  { text: 'and go-around.', size: 100, at: cue.goAround },
], cue.cut3 - GAP)

const STATS = [
  { text: '66', label: 'Movements, last hour' },
  { text: '17.1 min', label: 'Median ASMA today' },
  { text: '2', label: 'Go-arounds today' },
]
STATS.forEach((s, i) => {
  const at = cue.stat[i]
  const y = 942 + i * 175
  addLine({ text: s.text, size: 100, y, at, out: cue.cut4 - GAP })
  addLine({ text: s.label, size: 40, y: y + slotOf(100), at: at + B(0.25), out: cue.cut4 - GAP, cls: 'label' })
})

stack(980, [
  { text: 'holdshort', size: 168, at: cue.cut4 },
  { text: 'holdshort.pages.dev', size: 76, at: cue.cut4 + B(0.25), cls: 'url' },
])

// ---- seek --------------------------------------------------------------------------------

// The radar dims behind the numbers and comes back for the sign-off.
const dim = (t) => 1 - 0.45 * (fade(t, cue.cut3, cue.cut3 + B(1)) - fade(t, cue.cut4, cue.cut4 + B(1)))

const place = (p, t) => {
  const u = (t - p.t0) / p.dur
  if (u < 0 || u > 1) {
    p.el.style.display = 'none'
    return null
  }
  const s = p.path(u)
  const angle = (Math.atan2(s.vx, -s.vy) * 180) / Math.PI
  p.el.style.display = 'block'
  p.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${angle}deg)`
  p.el.style.opacity = p.fadeIn ? fade(u, 0, 0.08) : 1 - fade(u, 0.9, 1)
  return s
}

window.pagereel = {
  duration: DURATION,
  fps: 30,
  width: 1080,
  height: 1920,
  audio: './audio.wav',
  ready: document.fonts.ready,
  seek(t) {
    field.style.opacity = dim(t)
    cam.style.transform = `scale(${zoom(t)})`
    for (const el of runways) {
      el.style.transform = `scaleY(${Math.max(0, draw(t))})`
      el.style.opacity = 0.45 + 0.35 * B.pulse(t)
    }
    ring.style.opacity = 0
    for (const p of planes) {
      const s = place(p, t)
      if (p === ga && s) {
        ring.style.opacity = fade(t, B(19.5), B(20.25)) - fade(t, B(22), B(22.75))
        ring.style.transform = `translate(${s.x}px, ${s.y}px) scale(${1 + 0.2 * B.pulse(t)})`
      }
    }
    for (const line of lines) {
      line.el.style.transform = `translateY(${line.y(t)}px)`
      if (line.text) line.el.textContent = line.text(t)
    }
  },
}

window.pagereel.seek(0)
