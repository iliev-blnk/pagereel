// The reel. Every value that moves is a track built here, once, from SECTIONS; seek(t) only
// reads them and writes styles, so any frame comes out the same every time it is rendered.
import { colorTrack, track } from './motion.js'
import { B, cue, DURATION } from './timeline.js'

const INK = '#f6f8fa'
const ACCENT = '#2da44e'

// Per section: two lines of type, and the form the shape takes (x, y = its top-left corner).
// Every form stands on y = 780, 80 px above the first line's mask, at the type's left edge.
const SECTIONS = [
  {
    at: 0,
    lines: ['Live captions', 'for talks.'],
    form: { x: 96, y: 420, w: 360, h: 360, r: 180, color: ACCENT },
  },
  {
    at: cue.cut1,
    lines: ['One laptop', 'listens.'],
    form: { x: 96, y: 520, w: 380, h: 260, r: 20, color: ACCENT },
  },
  {
    at: cue.cut2,
    lines: ['The projector', 'shows it.'],
    form: { x: 96, y: 280, w: 888, h: 500, r: 12, color: ACCENT },
  },
  {
    at: cue.cut3,
    lines: ['Phones follow', 'your language.'],
    form: { x: 96, y: 300, w: 300, h: 480, r: 44, color: ACCENT },
  },
  {
    at: cue.cut4,
    lines: ['No cloud.', 'Fully offline.'],
    form: { x: 96, y: 580, w: 888, h: 200, r: 100, color: ACCENT },
  },
  {
    at: cue.cut5,
    lines: ['npm i -g', 'parlo-captions'],
    // The install line is wider than the others, so it sets smaller to stay clear of the buttons.
    size: 100,
    form: { x: 96, y: 520, w: 260, h: 260, r: 0, color: INK },
  },
]

// Where the type starts, and the height of one line's mask (--slot in index.html). A line
// travels one slot to come in or go out, so the line going and the line coming never touch.
// The whole group sits 220 px lower than the forms are written, so the type lands mid-frame.
const DROP = 220
const TOP = 860 + DROP
const SLOT = Number.parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--slot'),
)
// The second line follows the first by a quarter beat.
const STAGGER = B(0.25)
// How much the shape grows on each beat.
const KICK = 0.06

const stage = document.getElementById('stage')
const shape = Object.assign(document.createElement('div'), { className: 'shape' })
shape.style.transformOrigin = '0 100%'
stage.append(shape)

const masks = [0, 1].map((k) => {
  const mask = Object.assign(document.createElement('div'), { className: 'mask' })
  mask.style.top = `${TOP + k * SLOT}px`
  stage.append(mask)
  return mask
})

// A line rises into its mask when its section starts, and on out of the top when the next does.
const lines = SECTIONS.flatMap((section, i) => {
  const leave = SECTIONS[i + 1]?.at ?? cue.out
  return section.lines.map((text, k) => {
    const el = Object.assign(document.createElement('p'), { className: 'line', textContent: text })
    if (section.size) el.style.fontSize = `${section.size}px`
    masks[k].append(el)
    // Both old lines leave together, a quarter beat before the cut, so the new line never
    // shares the mask with the old second line. The first section is in on frame 0.
    const out = [leave - STAGGER, -SLOT, 'snappy']
    const y =
      i === 0 ? track(0, [out]) : track(SLOT, [[section.at + k * STAGGER, 0, 'snappy'], out])
    return { el, y }
  })
})

// The shape springs from form to form at each cut; its colour follows, a little faster.
const morph = (key, offset = 0) =>
  track(
    SECTIONS[0].form[key] + offset,
    SECTIONS.slice(1).map((s) => [s.at, s.form[key] + offset]),
  )
const x = morph('x')
// The shape stands 40 px lower than the type group, which closes the gap the line-height leaves.
const y = morph('y', DROP + 40)
const w = morph('w')
const h = morph('h')
const r = morph('r')
const color = colorTrack(
  SECTIONS[0].form.color,
  SECTIONS.slice(1).map((s) => [s.at, s.form.color, 'snappy']),
)
// It grows in on the first frame and shrinks away when everything leaves.
const grow = track(0, [
  [0, 1, 'snappy'],
  [cue.out, 0, 'snappy'],
])

window.pagereel = {
  duration: DURATION,
  fps: 30,
  width: 1080,
  height: 1920,
  audio: './audio.wav',
  // Read once the type is in the page: reading it lays the page out, which starts the font
  // downloads, and it settles when they finish.
  ready: document.fonts.ready,
  seek(t) {
    const scale = Math.max(0, grow(t)) * (1 + KICK * B.pulse(t))
    shape.style.width = `${w(t)}px`
    shape.style.height = `${h(t)}px`
    shape.style.borderRadius = `${Math.max(0, r(t))}px`
    shape.style.background = color(t)
    shape.style.transform = `translate(${x(t)}px, ${y(t)}px) scale(${scale})`
    for (const line of lines) line.el.style.transform = `translateY(${line.y(t)}px)`
  },
}

// Opened straight in a browser, show the first frame. pagereel preview plays it.
window.pagereel.seek(0)
