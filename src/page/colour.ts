// Colour reading shared by the page scripts.

let ctx: CanvasRenderingContext2D | null = null
const colours = new Map<string, [number, number, number, number]>()

/** Any CSS colour (oklch, color-mix…) as sRGB 0–255 plus alpha 0–1, read back from a canvas. */
export function rgba(css: string): [number, number, number, number] {
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
