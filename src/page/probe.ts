// Text probe, evaluated in the page by `pagereel check`. Sets window.__pagereelProbe,
// which lists the DOM text a viewer can see at this moment and where it is drawn.
// SVG text is out of scope.
import type { TextBox } from '../check/types'

/** A TextBox plus the alpha of the text's fill colour; contrast is only measured on solid text. */
export type ProbedBox = TextBox & { fill: number }

declare global {
  interface Window {
    __pagereelProbe?: () => ProbedBox[]
  }
}

/** How far text may cross the viewport edge, and an overflow box, before it counts as cut off. */
const VIEW_TOLERANCE = 1
const CLIP_TOLERANCE = 2
const MIN_OPACITY = 0.05

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

let ctx: CanvasRenderingContext2D | null = null
const colours = new Map<string, [number, number, number, number]>()

/** Any CSS colour (oklch, color-mix…) as sRGB 0–255 plus alpha 0–1, read back from a canvas. */
function rgba(css: string): [number, number, number, number] {
  const cached = colours.get(css)
  if (cached) return cached
  ctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return [0, 0, 0, 1]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data
  const c: [number, number, number, number] = [r, g, b, a / 255]
  colours.set(css, c)
  return c
}

const outOfFlow = (s: CSSStyleDeclaration) => s.position === 'absolute' || s.position === 'fixed'

/** Whether an element is the containing block of absolute (or, with `fixed`, fixed) descendants. */
function holdsPositioned(s: CSSStyleDeclaration, fixed: boolean): boolean {
  if (!fixed && s.position !== 'static') return true
  return (
    s.transform !== 'none' ||
    s.translate !== 'none' ||
    s.rotate !== 'none' ||
    s.scale !== 'none' ||
    s.perspective !== 'none' ||
    s.filter !== 'none' ||
    s.backdropFilter !== 'none' ||
    /paint|layout|strict|content/.test(s.contain) ||
    /transform|perspective|filter/.test(s.willChange)
  )
}

/** The containing block of an out-of-flow element; null means the viewport. */
function containingBlock(el: Element, s: CSSStyleDeclaration): Element | null {
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (holdsPositioned(getComputedStyle(a), s.position === 'fixed')) return a
  }
  return null
}

const cut = (r: Rect, c: Rect, x: boolean, y: boolean): Rect => ({
  left: x ? Math.max(r.left, c.left) : r.left,
  top: y ? Math.max(r.top, c.top) : r.top,
  right: x ? Math.min(r.right, c.right) : r.right,
  bottom: y ? Math.min(r.bottom, c.bottom) : r.bottom,
})

/** The most any edge moved inwards from `a` to `b`. */
const lost = (a: Rect, b: Rect) =>
  Math.max(b.left - a.left, b.top - a.top, a.right - b.right, a.bottom - b.bottom)

/**
 * What is left of `box` after the overflow clips of the element and of the ancestors whose
 * clip applies to it (an out-of-flow element escapes the clips below its containing block),
 * then the viewport.
 */
function visiblePart(el: Element, box: Rect): { rect: Rect; clipped: boolean } {
  const root = document.documentElement
  const rootStyle = getComputedStyle(root)
  // A visible root hands the body's overflow to the viewport, so the body itself clips nothing.
  const bodyToViewport = rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible'
  let rect = box
  let clipped = false
  const clip = (a: Element, s: CSSStyleDeclaration) => {
    if (a === root || (a === document.body && bodyToViewport)) return
    const paint = /paint|strict|content/.test(s.contain)
    const x = paint || s.overflowX !== 'visible'
    const y = paint || s.overflowY !== 'visible'
    if (!x && !y) return
    const next = cut(rect, a.getBoundingClientRect(), x, y)
    if (lost(rect, next) > CLIP_TOLERANCE) clipped = true
    rect = next
  }

  let s = getComputedStyle(el)
  clip(el, s)
  // undefined: every ancestor clips; an element: skip up to it; null: nothing above clips.
  let until: Element | null | undefined = outOfFlow(s) ? containingBlock(el, s) : undefined
  for (let a = el.parentElement; a && until !== null; a = a.parentElement) {
    if (until && a !== until) continue
    s = getComputedStyle(a)
    clip(a, s)
    until = outOfFlow(s) ? containingBlock(a, s) : undefined
  }

  const next = cut(rect, { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, true, true)
  if (lost(rect, next) > VIEW_TOLERANCE) clipped = true
  return { rect: next, clipped }
}

function probe(): ProbedBox[] {
  const body = document.body
  if (!body) return []
  const owners = new Map<Element, Text[]>()
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!el || !n.nodeValue?.trim()) continue
    const texts = owners.get(el)
    if (texts) texts.push(n as Text)
    else owners.set(el, [n as Text])
  }

  const range = document.createRange()
  const out: ProbedBox[] = []
  for (const [el, texts] of owners) {
    if (!(el instanceof HTMLElement)) continue
    const s = getComputedStyle(el)
    if (s.visibility !== 'visible') continue
    let opacity = 1
    for (let a: Element | null = el; a; a = a.parentElement) {
      opacity *= Number(getComputedStyle(a).opacity)
    }
    if (opacity <= MIN_OPACITY) continue

    let box: Rect | undefined
    for (const t of texts) {
      range.selectNodeContents(t)
      for (const r of Array.from(range.getClientRects())) {
        if (r.width <= 0 || r.height <= 0) continue
        box = box
          ? {
              left: Math.min(box.left, r.left),
              top: Math.min(box.top, r.top),
              right: Math.max(box.right, r.right),
              bottom: Math.max(box.bottom, r.bottom),
            }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }
    }
    if (!box) continue
    const { rect, clipped } = visiblePart(el, box)
    if (rect.right <= rect.left || rect.bottom <= rect.top) continue

    const key = texts
      .map((t) => t.nodeValue)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const [r, g, b, fill] = rgba(s.webkitTextFillColor || s.color)
    // A transform above the text shows as drawn height over layout height; offsetHeight is
    // rounded to whole pixels, so a difference under one pixel is not a transform.
    const drawn = el.getBoundingClientRect().height
    const scale =
      el.offsetHeight && Math.abs(drawn - el.offsetHeight) >= 1 ? drawn / el.offsetHeight : 1
    out.push({
      key,
      label: key.slice(0, 40),
      words: key.split(' ').length,
      x: rect.left,
      y: rect.top,
      w: rect.right - rect.left,
      h: rect.bottom - rect.top,
      fontPx: Number.parseFloat(s.fontSize) * scale,
      color: [r, g, b],
      opacity,
      clipped,
      fill,
    })
  }
  return out
}

window.__pagereelProbe = probe
