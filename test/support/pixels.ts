import { PNG } from 'pngjs'

export function decode(buf: Buffer) {
  return PNG.sync.read(buf)
}

export function pixel(png: PNG, x: number, y: number): [number, number, number, number] {
  const i = (png.width * y + x) * 4
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0, png.data[i + 3] ?? 0]
}

const isRed = ([r, g, b, a]: number[]) =>
  (r ?? 0) > 200 && (g ?? 0) < 60 && (b ?? 0) < 60 && (a ?? 0) > 200

/** Leftmost x on row `y` that is red, or -1. */
export function redStart(png: PNG, y = 60): number {
  for (let x = 0; x < png.width; x++) if (isRed(pixel(png, x, y))) return x
  return -1
}

/** Number of red pixels on row `y`. */
export function redWidth(png: PNG, y = 60): number {
  let n = 0
  for (let x = 0; x < png.width; x++) if (isRed(pixel(png, x, y))) n++
  return n
}
