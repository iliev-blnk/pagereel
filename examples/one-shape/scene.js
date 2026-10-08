import { clamp, colorTrack, ease, fade, lerp, track } from 'pagereel/motion'
import { B, clicks, cue, DURATION } from './timeline.js'

const W = 1080,
  H = 1080,
  CX = 540,
  CY = 540
const BLUE = '#3d5afe',
  PAPER = '#f4f4f5',
  SLATE = '#26262c',
  INK = '#111114'

const MORPH = { freq: 1.7, zeta: 0.72 } // container changes: a hair of overshoot
const TINT = { freq: 3.4, zeta: 1 } // color moves faster than size: the muddy RGB midpoint only flashes by
const GLIDE = { freq: 0.9, zeta: 1 } // cursor travel
const DRAG = { freq: 0.9, zeta: 1 } // shared by cursor + knob so they never drift apart

// ── the shape ────────────────────────────────────────────────────────────────
const morph = (a, ...rest) =>
  track(
    a,
    [cue.toLoader, cue.toPlayer, cue.toSlider, cue.toToast, cue.toButton].map((at, i) => [
      at,
      rest[i],
      MORPH,
    ]),
  )
const shapeW = morph(340, 124, 680, 680, 500, 340)
const shapeH = morph(96, 124, 220, 24, 112, 96)
const shapeR = morph(48, 62, 44, 12, 30, 48)
const shapeC = colorTrack(
  BLUE,
  [
    [cue.toPlayer, PAPER],
    [cue.toSlider, SLATE],
    [cue.toToast, BLUE],
  ].map(([a, c]) => [a, c, TINT]),
)
// camera: push in on small states, pull back for wide ones. Ends where it starts.
const camera = track(1.45, [
  [cue.toLoader, 1.7, 'heavy'],
  [cue.toPlayer, 1.1, 'heavy'],
  [cue.toSlider, 1.1, 'heavy'],
  [cue.toToast, 1.5, 'heavy'],
  [cue.toButton, 1.45, 'heavy'],
])
const press = track(1, [
  [cue.press, 0.94, 'snappy'],
  [cue.release, 1, 'snappy'],
])

// ── the cursor ───────────────────────────────────────────────────────────────
const KNOB_FROM = 0.3,
  KNOB_TO = 0.85,
  TRACK_X0 = 200,
  TRACK_X1 = 880
const knobX = (v) => lerp(TRACK_X0, TRACK_X1, v)
const curX = track(1180, [
  [cue.cursorIn, 610, GLIDE],
  [B(4.6), 770, GLIDE],
  [cue.toPlayButton, 812, 'default'],
  [B(11), 900, GLIDE],
  [cue.toKnob, knobX(KNOB_FROM), 'default'],
  [cue.grab, knobX(KNOB_TO), DRAG],
  [B(18.4), 800, GLIDE],
  [cue.cursorOut, 1180, GLIDE],
])
const curY = track(1180, [
  [cue.cursorIn, 562, GLIDE],
  [B(4.6), 700, GLIDE],
  [cue.toPlayButton, 524, 'default'],
  [B(11), 760, GLIDE],
  [cue.toKnob, CY, 'default'],
  [B(18.4), 700, GLIDE],
  [cue.cursorOut, 1180, GLIDE],
])
const curScale = track(
  1,
  clicks.flatMap((c) => [
    [c, 0.82, 'snappy'],
    [c + 0.12, 1, 'snappy'],
  ]),
)

// ── per-state content ────────────────────────────────────────────────────────
const vis = (t, a, b, c, d) => fade(t, B(a), B(b)) - fade(t, B(c), B(d))
const knob = track(KNOB_FROM, [[cue.grab, KNOB_TO, DRAG]])
const knobGrip = track(1, [
  [cue.grab, 1.18, 'snappy'],
  [cue.letGo, 1, 'playful'],
])
const playPress = track(1, [
  [cue.playClick, 0.9, 'snappy'],
  [cue.playClick + 0.12, 1, 'playful'],
])
const progress = (t) =>
  t < cue.playClick
    ? 0.08
    : lerp(0.08, 0.66, ease.out(clamp((t - cue.playClick) / (cue.toSlider - cue.playClick))))

let ctx

function rrect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

function text(str, x, y, { size, weight = 600, color, align = 'left', alpha = 1 }) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px Inter`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(str, x, y)
  ctx.globalAlpha = 1
}

function drawButton(t) {
  const a = 1 - fade(t, B(3.6), B(3.95)) + fade(t, B(21.15), B(21.7))
  if (a <= 0) return
  text('Get started', CX, CY + 2 + (1 - a) * 10, {
    size: 34,
    color: '#fff',
    align: 'center',
    alpha: a,
  })
}

function drawLoader(t) {
  const a = vis(t, 4.3, 4.7, 7.6, 7.95)
  if (a <= 0) return
  const rot = t * Math.PI * 2 * 0.9
  const len = Math.PI * (0.55 + 0.4 * Math.sin(t * Math.PI))
  ctx.globalAlpha = a
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(CX, CY, 30, rot, rot + len)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawPlayer(t) {
  const a = vis(t, 8.5, 9.1, 13.5, 13.95)
  if (a <= 0) return
  const dy = (1 - a) * 14
  ctx.globalAlpha = a
  // cover: concentric rings, rotating once playing
  const cx = 300,
    cy = CY + dy
  rrect(cx - 80, cy - 80, 160, 160, 22)
  ctx.fillStyle = BLUE
  ctx.fill()
  ctx.save()
  ctx.clip()
  const spin = t > cue.playClick ? (t - cue.playClick) * 1.2 : 0
  for (let i = 5; i >= 1; i--) {
    ctx.beginPath()
    ctx.arc(cx + 34 * Math.cos(spin), cy + 34 * Math.sin(spin), i * 26, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 ? '#5a73ff' : BLUE
    ctx.fill()
  }
  ctx.restore()
  ctx.globalAlpha = a
  text('Night Drive', 420, CY - 38 + dy, { size: 36, color: INK, alpha: a })
  text('One Shape', 420, CY + 4 + dy, { size: 24, weight: 500, color: '#6b6b74', alpha: a })
  // progress
  ctx.globalAlpha = a
  rrect(420, CY + 52 + dy, 420, 8, 4)
  ctx.fillStyle = '#dcdce1'
  ctx.fill()
  rrect(420, CY + 52 + dy, 420 * progress(t), 8, 4)
  ctx.fillStyle = INK
  ctx.fill()
  // play / pause
  const pressed = playPress(t)
  ctx.save()
  ctx.translate(810, CY - 20 + dy)
  ctx.scale(pressed, pressed)
  ctx.beginPath()
  ctx.arc(0, 0, 40, 0, Math.PI * 2)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.fillStyle = '#fff'
  if (t < cue.playClick) {
    ctx.beginPath()
    ctx.moveTo(-10, -15)
    ctx.lineTo(16, 0)
    ctx.lineTo(-10, 15)
    ctx.closePath()
    ctx.fill()
  } else {
    rrect(-12, -15, 8, 30, 3)
    ctx.fill()
    rrect(4, -15, 8, 30, 3)
    ctx.fill()
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawSliderFill(t) {
  const a = vis(t, 14.3, 14.8, 17.6, 17.95)
  if (a <= 0) return
  ctx.globalAlpha = a
  ctx.fillStyle = BLUE
  ctx.fillRect(0, 0, knobX(knob(t)), H)
  ctx.globalAlpha = 1
}

function drawSliderKnob(t) {
  const a = vis(t, 14.3, 14.8, 17.6, 17.95)
  if (a <= 0) return
  const x = knobX(knob(t))
  const s = knobGrip(t) * lerp(0.6, 1, a)
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(x, CY)
  ctx.scale(s, s)
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  ctx.beginPath()
  ctx.arc(0, 0, 28, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.restore()
  text(String(Math.round(knob(t) * 100)), x, CY - 78, {
    size: 44,
    color: '#fff',
    align: 'center',
    alpha: a,
  })
}

function drawToast(t) {
  const a = vis(t, 18.4, 18.9, 20.5, 20.95)
  if (a <= 0) return
  const x0 = CX - 250 + 56,
    dx = (1 - a) * -16
  // check mark draws itself
  const draw = fade(t, B(18.6), B(19.3), ease.out)
  ctx.globalAlpha = a
  ctx.beginPath()
  ctx.arc(x0 + dx, CY, 26, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.strokeStyle = BLUE
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([60, 60])
  ctx.lineDashOffset = 60 * (1 - draw)
  ctx.beginPath()
  ctx.moveTo(x0 + dx - 11, CY + 1)
  ctx.lineTo(x0 + dx - 3, CY + 9)
  ctx.lineTo(x0 + dx + 12, CY - 8)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  const ta = fade(t, B(18.7), B(19.2))
  text('Saved', x0 + 50 + (1 - ta) * 20, CY - 14, { size: 32, color: '#fff', alpha: a * ta })
  text('All changes synced', x0 + 50 + (1 - ta) * 28, CY + 20, {
    size: 22,
    weight: 500,
    color: 'rgba(255,255,255,0.72)',
    alpha: a * ta,
  })
}

function drawCursor(t) {
  const x = curX(t),
    y = curY(t)
  for (const c of clicks) {
    const p = (t - c) / 0.35
    if (p <= 0 || p >= 1) continue
    ctx.beginPath()
    ctx.arc(x, y, 8 + 46 * ease.out(p), 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - p)})`
    ctx.lineWidth = 3
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1.5 * curScale(t), 1.5 * curScale(t))
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 27)
  ctx.lineTo(6.5, 21)
  ctx.lineTo(11, 31)
  ctx.lineTo(15.5, 29)
  ctx.lineTo(11, 19.5)
  ctx.lineTo(19.5, 19.5)
  ctx.closePath()
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 1.6
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
}

function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0c0c0e'
  ctx.fillRect(0, 0, W, H)

  // loader breathes on the kick
  const cam = camera(t)
  ctx.setTransform(cam, 0, 0, cam, CX * (1 - cam), CY * (1 - cam))

  const breathe = 1 + 0.045 * B.pulse(t, 7) * vis(t, 4.2, 4.6, 7.7, 8)
  const s = press(t) * breathe
  const w = shapeW(t) * s,
    h = shapeH(t) * s,
    r = shapeR(t) * s
  const x = CX - w / 2,
    y = CY - h / 2

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 22
  rrect(x, y, w, h, r)
  ctx.fillStyle = shapeC(t)
  ctx.fill()
  ctx.restore()

  ctx.save()
  rrect(x, y, w, h, r)
  ctx.clip()
  drawSliderFill(t)
  drawButton(t)
  drawLoader(t)
  drawPlayer(t)
  drawToast(t)
  ctx.restore()

  drawSliderKnob(t)
  drawCursor(t)
}

// The pagereel scene contract: tell the renderer the format and how to paint
// any moment. Everything above is plain canvas drawing.
const canvas = document.createElement('canvas')
canvas.width = W
canvas.height = H
document.body.appendChild(canvas)
ctx = canvas.getContext('2d')

window.pagereel = {
  width: W,
  height: H,
  duration: DURATION,
  fps: 60,
  loop: true,
  audio: 'audio.m4a',
  ready: Promise.all(['600 34px Inter', '500 24px Inter'].map((f) => document.fonts.load(f))).then(
    () => draw(0),
  ),
  seek: draw,
}
