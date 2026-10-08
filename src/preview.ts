import { launchBrowser } from './driver.js'
import { type RenderOptions, resolveOptions } from './options.js'
import { CLOCK_JS, PLAYER_JS } from './page/generated.js'
import { detectMode } from './render.js'
import { resolveSource } from './serve.js'

export type PreviewOptions = Omit<
  RenderOptions,
  'output' | 'format' | 'workers' | 'audio' | 'from' | 'to'
>

/** Opens the page in a visible Chromium window with a scrub bar. Resolves when the window closes. */
export async function preview(input: PreviewOptions): Promise<void> {
  const source = await resolveSource(input.source, input.root)
  const probe = await launchBrowser()
  let detected: Awaited<ReturnType<typeof detectMode>>
  try {
    detected = await detectMode(probe, source.url, input.mode)
  } finally {
    await probe.close()
  }
  const { mode, scene } = detected
  const o = resolveOptions({ ...input, format: 'png', output: '.' }, mode, scene)
  const browser = await launchBrowser({ headless: false })
  const context = await browser.newContext({
    viewport: { width: o.width, height: o.height },
    deviceScaleFactor: o.scale,
  })
  const config = { mode, duration: o.to, fps: o.fps, loop: scene.loop ?? false }
  let script = `window.__pagereelPreview=${JSON.stringify(config)};`
  if (mode === 'clock') {
    script += `window.__pagereelConfig=${JSON.stringify({ seed: o.seed, epoch: o.epoch })};${CLOCK_JS};`
  }
  await context.addInitScript({ content: script + PLAYER_JS })
  const page = await context.newPage()
  await page.goto(source.url)
  await new Promise<void>((resolve) => browser.on('disconnected', () => resolve()))
  await source.close()
}
