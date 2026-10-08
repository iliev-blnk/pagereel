// Renders every example into site/media/ (the gallery) and media/demo.gif (the README).
// Usage: pnpm build && node scripts/render-examples.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { render } from '../dist/index.js'

const log =
  (name) =>
  ({ frame, total }) => {
    if (frame === total || frame % 30 === 0) process.stdout.write(`\r${name} ${frame}/${total}   `)
  }
mkdirSync('site/media', { recursive: true })
mkdirSync('media', { recursive: true })

// One Shape's soundtrack: synthesised on the film's beat grid, stored as AAC.
const wav = 'examples/one-shape/audio.wav'
execFileSync(process.execPath, ['examples/one-shape/audio.mjs', wav], { stdio: 'inherit' })
execFileSync('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-i',
  wav,
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  'examples/one-shape/audio.m4a',
])
rmSync(wav)

await render({
  source: 'examples/css-only/index.html',
  output: 'site/media/css-only.mp4',
  duration: 6,
  size: '1280x720',
  onProgress: log('css-only'),
})
await render({
  source: 'examples/canvas/index.html',
  output: 'site/media/canvas.mp4',
  duration: 8,
  size: '1280x720',
  onProgress: log('canvas'),
})
await render({
  source: 'examples/one-shape/index.html',
  root: '.',
  output: 'site/media/one-shape.mp4',
  onProgress: log('one-shape'),
})
await render({
  source: 'examples/one-shape/index.html',
  root: '.',
  output: 'media/demo.gif',
  fps: 20,
  scale: 0.5,
  onProgress: log('demo.gif'),
})
console.log('\ndone')
