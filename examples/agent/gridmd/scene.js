// The reel. Every value that moves is a track built here, once; seek(t) only reads them and
// writes styles, so any frame comes out the same every time it is rendered.
import { ease, fade, invLerp, lerp, track } from './motion.js'
import { B, cue, DURATION } from './timeline.js'

const INK = '#0e1116'
const ACCENT = '#1838e6'
const GREY = '#5b6472'
const BAND50 = '#aeb9f6'
const BAND90 = '#dfe4fb'
const STAGGER = B(0.25)
const HALF = B(0.5)
const SVG = 'http://www.w3.org/2000/svg'

// ---- copy and layout: per section, lines of type (top = mask top, slot = mask height) ----
const sans = (text, size, top, color = INK) => ({ text, cls: 'sans', size, top, color, x: 96 })
const num = (text, size, top, color = ACCENT, x = 96) => ({ text, cls: 'num', size, top, color, x })

const SECTIONS = [
  {
    at: cue.typeIn,
    lines: [
      sans('Moldova', 128, 270),
      sans('tomorrow,', 128, 436),
      sans('hour by hour.', 128, 602, ACCENT),
    ],
  },
  {
    at: cue.cut1,
    lines: [
      sans('Peak around 10:00', 72, 250, GREY),
      { ...num('0', 520, 330), count: true },
      num('MW', 130, 735, INK, 770),
    ],
  },
  {
    at: cue.cut2,
    lines: [
      num('90% sure', 260, 270),
      sans('it lands between', 84, 620),
      sans('730 and 948 MW', 110, 730),
    ],
  },
  {
    at: cue.cut3,
    lines: [
      sans('Off by about', 96, 250),
      num('9%', 400, 375),
      sans('on average.', 96, 810),
    ],
  },
  {
    at: cue.cut4,
    lines: [
      num('grid.md', 280, 300),
      sans('Every morning at 9:00', 76, 720),
      { ...sans('iliev-blnk.github.io/grid.md', 52, 830, GREY), cls: 'sans' },
    ],
  },
]

const stage = document.getElementById('stage')

// ---- chart: tomorrow's forecast, hour by hour (values read off the page's chart) ----
const V = [575, 538, 552, 546, 547, 556, 622, 698, 711, 798, 851, 812, 770, 730, 738, 692, 726, 788, 822, 800, 803, 780, 730, 648]
const CX0 = 96
const CX1 = 984
const CY0 = 1420 // 400 MW
const CY1 = 1020 // 1000 MW
const px = (i) => lerp(CX0, CX1, i / (V.length - 1))
const py = (v) => lerp(CY0, CY1, (v - 400) / 600)

const svg = document.createElementNS(SVG, 'svg')
svg.id = 'chart'
svg.setAttribute('viewBox', '0 0 1080 1920')
const chart = document.createElementNS(SVG, 'g')
svg.append(chart)
const mk = (tag, attrs) => {
  const el = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  chart.append(el)
  return el
}
for (const v of [500, 700, 900]) {
  mk('line', { x1: CX0, x2: CX1, y1: py(v), y2: py(v), stroke: '#e6e8ec', 'stroke-width': 3 })
}
const band90 = mk('path', { fill: BAND90 })
const band50 = mk('path', { fill: BAND50 })
const path = mk('path', {
  d: `M${V.map((v, i) => `${px(i)} ${py(v)}`).join(' L')}`,
  fill: 'none',
  stroke: ACCENT,
  'stroke-linejoin': 'round',
  'stroke-linecap': 'round',
  pathLength: 1,
  'stroke-dasharray': 1,
})
const PEAK = V.indexOf(Math.max(...V))
const dot = mk('circle', { cx: px(PEAK), cy: py(V[PEAK]), fill: ACCENT })

// A band: the line shifted down by LO·f and up by HI·f (fractions of the value).
const bandD = (lo, hi, f) => {
  const top = V.map((v, i) => `${px(i)} ${py(v * (1 + hi * f))}`)
  const bot = V.map((v, i) => `${px(i)} ${py(v * (1 - lo * f))}`).reverse()
  return `M${top.join(' L')} L${bot.join(' L')} Z`
}

const head = mk('circle', { fill: ACCENT })

stage.append(svg)

// ---- bars: grid.md's error against the grid operator's plan ----
const bars = Object.assign(document.createElement('div'), { id: 'bars' })
const mkBar = (label, labelTop, barTop, color) => {
  const l = Object.assign(document.createElement('p'), { className: 'label sans', textContent: label })
  l.style.top = `${labelTop}px`
  l.style.fontWeight = 500
  const b = Object.assign(document.createElement('div'), { className: 'bar' })
  b.style.top = `${barTop}px`
  b.style.background = color
  bars.append(l, b)
  return { l, b }
}
const planBar = mkBar("Grid operator's plan · 19%", 985, 1060, GREY)
const meBar = mkBar('grid.md · 9%', 1190, 1265, ACCENT)
stage.append(bars)

// ---- type ----
const lines = SECTIONS.flatMap((section, i) => {
  const leave = SECTIONS[i + 1]?.at
  return section.lines.map((spec, k) => {
    const slot = Math.round(spec.size * 1.3)
    const mask = Object.assign(document.createElement('div'), { className: 'mask' })
    mask.style.left = `${spec.x}px`
    mask.style.top = `${spec.top}px`
    mask.style.height = `${slot}px`
    const el = Object.assign(document.createElement('p'), { className: `line ${spec.cls}`, textContent: spec.text })
    el.style.fontSize = `${spec.size}px`
    el.style.lineHeight = `${slot}px`
    el.style.color = spec.color
    mask.append(el)
    stage.append(mask)
    // The opening lines are already in place on the first frame.
    // The old lines leave half a beat before the cut and the new ones rise half a beat after it,
    // so two sections never share the frame.
    const moves = i === 0 ? [] : [[section.at + HALF + k * STAGGER, 0, 'snappy']]
    if (leave !== undefined) moves.push([leave - HALF + k * STAGGER, -slot, 'snappy'])
    return { el, spec, y: track(i === 0 ? 0 : slot, moves) }
  })
})

// ---- tracks ----
const draw = (t) => fade(t, cue.typeIn, cue.drawEnd, ease.out)
const dotScale = track(0, [[cue.cut1 + B(0.5), 1, 'playful']])
const f50 = track(0, [[cue.cut1 + B(1), 1, 'default']])
const f90 = track(0, [[cue.cut2 + B(0.5), 1, 'default']])
// The camera pans down to the bars at cut 3 and back to the chart at cut 4.
const chartY = track(0, [[cue.cut3, 1100, 'heavy'], [cue.cut4, 0, 'heavy']])
const barsY = track(1100, [[cue.cut3, 0, 'heavy'], [cue.cut4, 1100, 'heavy']])
const planW = track(0, [[cue.bar2, 888, 'default']])
const meW = track(0, [[cue.bar1, (888 * 9) / 19, 'default']])

window.pagereel = {
  duration: DURATION,
  fps: 30,
  width: 1080,
  height: 1920,
  audio: './audio.wav',
  ready: document.fonts.ready,
  seek(t) {
    const p = draw(t)
    const pulse = B.pulse(t)
    path.setAttribute('stroke-dashoffset', 1 - p)
    path.setAttribute('stroke-width', 10 + 4 * pulse)
    path.style.opacity = p > 0 ? 1 : 0
    band90.setAttribute('d', bandD(0.14, 0.114, Math.max(0, f90(t))))
    band50.setAttribute('d', bandD(0.045, 0.045, Math.max(0, f50(t))))
    dot.setAttribute('r', Math.max(0, 20 * dotScale(t)) * (1 + 0.15 * pulse))
    // A slow push in on the chart, with a small kick on the beat.
    const zoom = 1 + 0.1 * (t / DURATION) + 0.03 * pulse
    // The head of the line, while it draws.
    const f = p * (V.length - 1)
    const i = Math.min(V.length - 2, Math.floor(f))
    head.setAttribute('cx', px(f))
    head.setAttribute('cy', py(lerp(V[i], V[i + 1], f - i)))
    head.setAttribute('r', p > 0 && p < 1 ? 22 : 0)
    for (const b of [meBar.b, planBar.b]) b.style.transform = `scaleY(${1 + 0.15 * pulse})`
    chart.setAttribute('transform', `translate(0 ${chartY(t)}) translate(540 1220) scale(${zoom}) translate(-540 -1220)`)
    bars.style.transform = `translateY(${barsY(t)}px)`
    meBar.b.style.width = `${Math.max(0, meW(t))}px`
    planBar.b.style.width = `${Math.max(0, planW(t))}px`
    planBar.l.style.opacity = fade(t, cue.cut3 + B(0.5), cue.cut3 + B(1.5))
    meBar.l.style.opacity = fade(t, cue.bar1 - B(0.5), cue.bar1 + B(0.5))
    const n = Math.round(lerp(0, 851, ease.out(invLerp(cue.countStart, cue.countEnd, t))))
    for (const line of lines) {
      line.el.style.transform = `translateY(${line.y(t)}px)`
      if (line.spec.count) line.el.textContent = String(n)
    }
  },
}

window.pagereel.seek(0)
