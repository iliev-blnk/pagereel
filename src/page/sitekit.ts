// Site kit, evaluated in the page by `siteKit()`. Sets window.__pagereelSiteKit, which reads
// what a reel about this page can borrow from it: copy, colours, type, a logo, the og:image.
import { rgba } from './colour'

export interface PageKit {
  title: string
  description: string
  /** The h1s, then the h2s, at most 10. */
  headings: string[]
  /** At most 12, each cut to 200 characters. */
  paragraphs: string[]
  /** At most 6 colours, by the area each paints: backgrounds by what shows of them, text by its boxes. */
  palette: Array<{ hex: string; share: number }>
  /** At most 4 font stacks, as CSS gives them, by the area of their text. */
  fonts: Array<{ family: string; share: number }>
  /** An inline SVG as a file of its own, or the URL of an image. */
  logo: { svg?: string; src?: string }
  og?: string
}

declare global {
  interface Window {
    __pagereelSiteKit?: () => PageKit
  }
}

type RGB = [number, number, number]

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

const MAX_HEADINGS = 10
const MAX_PARAGRAPHS = 12
const MAX_CHARS = 200
const MAX_COLOURS = 6
const MAX_FONTS = 4
/** Below this opacity an element, and everything in it, counts as unseen. */
const MIN_OPACITY = 0.05
/** A colour fainter than this tints what is behind it too little to count as a colour of its own. */
const MIN_ALPHA = 0.1
const WHITE: RGB = [255, 255, 255]
/**
 * Elements drawn from something other than text and CSS colour. What they draw may be transparent
 * (a canvas, an SVG, a PNG), so the backgrounds behind them still count as painted.
 */
const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'object', 'embed'])

const words = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Rendered, not hidden, and at least `min` px each way. */
function shown(el: Element, min = 2) {
  const r = el.getBoundingClientRect()
  return r.width >= min && r.height >= min && el.checkVisibility({ visibilityProperty: true })
}

/** The text of each shown element matching `selector`, once each, in document order. */
function texts(selector: string) {
  const all = [...document.querySelectorAll(selector)].filter((el) => shown(el))
  return [...new Set(all.map((el) => words(el.textContent)).filter(Boolean))]
}

/** Cuts text to MAX_CHARS at a word break, marking the cut with an ellipsis. */
const cut = (s: string) =>
  s.length <= MAX_CHARS ? s : `${s.slice(0, MAX_CHARS - 1).replace(/\s+\S*$/, '')}…`

/** The first of these meta tags, by name or property, that has content. */
function meta(...keys: string[]) {
  for (const key of keys) {
    const tag = document.querySelector(`meta[name="${key}" i], meta[property="${key}" i]`)
    const content = words(tag?.getAttribute('content'))
    if (content) return content
  }
  return ''
}

function absolute(url: string) {
  try {
    return new URL(url, document.baseURI).href
  } catch {
    return undefined
  }
}

const area = (r: Rect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top)

const meet = (a: Rect, b: Rect): Rect => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom),
})

/** A rect from getBoundingClientRect, in page coordinates. */
const onPage = (r: DOMRect): Rect => ({
  left: r.left + scrollX,
  top: r.top + scrollY,
  right: r.right + scrollX,
  bottom: r.bottom + scrollY,
})

/** `c` drawn at `alpha` over `behind`. */
const over = (c: RGB, behind: RGB, alpha: number) =>
  c.map((v, i) => v * alpha + (behind[i] ?? 0) * (1 - alpha)) as RGB

const hex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function tally(map: Map<string, number>, key: string, weight: number) {
  if (weight > 0) map.set(key, (map.get(key) ?? 0) + weight)
}

/** The `n` heaviest keys, each with its share of the whole tally. */
function rank(map: Map<string, number>, n: number) {
  const total = [...map.values()].reduce((sum, w) => sum + w, 0)
  return [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, w]) => ({ key, share: Math.round((w / total) * 1000) / 1000 }))
}

/** Colours by the area they paint, and font stacks by the area of their text. */
function measure() {
  const colours = new Map<string, number>()
  const fonts = new Map<string, number>()
  const root = document.documentElement
  const body = document.body
  const page: Rect = { left: 0, top: 0, right: root.scrollWidth, bottom: root.scrollHeight }

  // The canvas takes the root's background, or the body's when the root has none, and that
  // element then paints nothing of its own.
  const fill = (el: Element | null) =>
    rgba(el ? getComputedStyle(el).backgroundColor : 'transparent')
  const fromRoot = fill(root)[3] > 0
  const [r, g, b, a] = fill(fromRoot ? root : body)
  const canvas = over([r, g, b], WHITE, a)
  const propagated = new Set<Element | null>(fromRoot ? [root] : [root, body])

  /** Tallies the text directly inside `el` by the area of its boxes. */
  function text(el: Element, s: CSSStyleDeclaration, behind: RGB, alpha: number, clip: Rect) {
    let covered = 0
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const box of range.getClientRects()) covered += area(meet(onPage(box), clip))
    }
    if (!covered) return
    tally(fonts, s.fontFamily, covered)
    const [r, g, b, a] = rgba(s.webkitTextFillColor || s.color)
    if (a * alpha >= MIN_ALPHA) tally(colours, hex(over([r, g, b], behind, a * alpha)), covered)
  }

  /**
   * Tallies what `el` and everything in it paint, drawn over `behind`, and returns the area
   * their backgrounds cover, so that each background counts only the part of it that shows.
   */
  function paint(el: Element, behind: RGB, opacity: number, clip: Rect): number {
    if (REPLACED.has(el.localName)) return 0
    const s = getComputedStyle(el)
    if (s.display === 'none') return 0
    const alpha = opacity * Number(s.opacity)
    if (alpha < MIN_OPACITY) return 0
    const box = meet(onPage(el.getBoundingClientRect()), clip)
    const [r, g, b, a] = rgba(s.backgroundColor)
    const own =
      !propagated.has(el) && s.visibility !== 'hidden' && a * alpha >= MIN_ALPHA && area(box) > 0
    const colour = own ? over([r, g, b], behind, a * alpha) : behind
    // The root's and the body's overflow belong to the viewport, not to their own boxes.
    const clips =
      el !== root && el !== body && (s.overflowX !== 'visible' || s.overflowY !== 'visible')
    const inner = clips ? box : clip
    let covered = 0
    for (const child of el.children) covered += paint(child, colour, alpha, inner)
    if (s.visibility !== 'hidden') text(el, s, colour, alpha, inner)
    if (!own) return covered
    tally(colours, hex(colour), area(box) - covered)
    return Math.max(area(box), covered)
  }

  tally(colours, hex(canvas), area(page) - paint(root, canvas, 1, page))
  return {
    palette: rank(colours, MAX_COLOURS).map(({ key, share }) => ({ hex: key, share })),
    fonts: rank(fonts, MAX_FONTS).map(({ key, share }) => ({ family: key, share })),
  }
}

/** An inline SVG as a file of its own: with its namespace, and the colours CSS gave it written in. */
function standalone(svg: Element) {
  const copy = svg.cloneNode(true) as Element
  const from = [svg, ...svg.querySelectorAll('*')]
  const to = [copy, ...copy.querySelectorAll('*')]
  for (const [i, el] of from.entries()) {
    const style = (to[i] as SVGElement | undefined)?.style
    if (!style) continue
    const s = getComputedStyle(el)
    style.fill = s.fill
    style.stroke = s.stroke
  }
  return new XMLSerializer().serializeToString(copy)
}

/** Whether `el`, or a parent of it inside `header`, calls itself a logo or a brand. */
function named(el: Element, header: Element) {
  for (let a: Element | null = el; a && a !== header; a = a.parentElement) {
    const label = ['id', 'class', 'aria-label', 'alt', 'src'].map((k) => a?.getAttribute(k))
    if (/logo|brand/i.test(label.join(' '))) return true
  }
  return false
}

/** The biggest icon the page links: an SVG, else the one with the largest `sizes`. */
function icon() {
  const links = [
    ...document.querySelectorAll<HTMLLinkElement>(
      'link[rel~="icon" i], link[rel~="apple-touch-icon" i], link[rel~="apple-touch-icon-precomposed" i]',
    ),
  ].filter((link) => link.href)
  const size = (link: HTMLLinkElement) => {
    const sizes = link.sizes.value
    if (/svg/i.test(link.type) || /\.svg$/i.test(link.href) || /any/i.test(sizes)) return 1e6
    const sides = [...sizes.matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1]))
    if (sides.length) return Math.max(...sides)
    return /apple/i.test(link.rel) ? 180 : 0
  }
  return links.sort((a, b) => size(b) - size(a))[0]?.href
}

/**
 * The site's logo. In the header, an SVG or image that calls itself a logo, else the first one
 * shown; then any image whose alt text says logo; then the biggest icon the page links.
 */
function logo(): PageKit['logo'] {
  const marks = [...document.querySelectorAll('header, [role="banner"]')].flatMap((header) =>
    [...header.querySelectorAll('svg, img')]
      .filter((el) => shown(el, 8) && !el.parentElement?.closest('svg'))
      .map((el) => ({ el, named: named(el, header) })),
  )
  const mark = (marks.find((m) => m.named) ?? marks[0])?.el
  const img = (el: Element) => {
    const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src
    return src ? { src } : {}
  }
  if (mark) return mark.localName === 'svg' ? { svg: standalone(mark) } : img(mark)
  const alt = [...document.querySelectorAll('img[alt*="logo" i]')].find((el) => shown(el, 8))
  if (alt) return img(alt)
  const src = icon()
  return src ? { src } : {}
}

window.__pagereelSiteKit = () => {
  const og = meta('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image')
  return {
    title: words(document.title) || meta('og:title'),
    description: meta('description', 'og:description', 'twitter:description'),
    headings: [...new Set([...texts('h1'), ...texts('h2')])].slice(0, MAX_HEADINGS),
    paragraphs: texts('p').slice(0, MAX_PARAGRAPHS).map(cut),
    ...measure(),
    logo: logo(),
    og: og ? absolute(og) : undefined,
  }
}
