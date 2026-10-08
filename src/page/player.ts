// Preview player, injected into the page by `pagereel preview`.
import { formatTime } from './format'

interface PreviewConfig {
  mode: 'scene' | 'clock'
  duration: number
  fps: number
  loop: boolean
}

declare global {
  interface Window {
    __pagereelPreview?: PreviewConfig
    pagereel?: { seek(t: number): unknown }
  }
}

const KEY = 'pagereel-preview-t'

function start(cfg: PreviewConfig) {
  const clock = window.__pagereel
  const frame = clock?.realFrame ?? window.requestAnimationFrame.bind(window)
  const step = 1 / cfg.fps

  const bar = document.createElement('div')
  bar.innerHTML = `<button type="button">Play</button><input type="range" min="0" max="${cfg.duration}" step="${step}" value="0"><code></code>`
  Object.assign(bar.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '2147483647',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '8px 14px',
    background: 'rgba(12,12,14,.92)',
    color: '#e5e5e5',
    font: '12px ui-monospace, monospace',
  })
  const [button, scrub, readout] = [
    bar.querySelector('button') as HTMLButtonElement,
    bar.querySelector('input') as HTMLInputElement,
    bar.querySelector('code') as HTMLElement,
  ]
  Object.assign(button.style, { font: 'inherit', padding: '4px 10px', cursor: 'pointer' })
  scrub.style.flex = '1'
  document.body.append(bar)

  // `target` moves immediately on input; seeks run one at a time in order,
  // so quick key presses each count.
  let t = 0
  let target = 0
  let playing = false
  let last = 0
  let queue = Promise.resolve()

  const clampTime = (x: number) => Math.min(Math.max(x, 0), cfg.duration)

  async function show(next: number) {
    if (cfg.mode === 'scene') {
      await window.pagereel?.seek(next)
    } else if (next < t - 1e-9) {
      // A clock page cannot go back: reload and fast-forward.
      sessionStorage.setItem(KEY, String(next))
      location.reload()
      return
    } else {
      await clock?.advanceTo(next * 1000, step * 1000)
    }
    t = next
    scrub.value = String(t)
    readout.textContent = formatTime(t, cfg.fps)
  }

  function go(next: number) {
    target = clampTime(next)
    const goal = target
    queue = queue.then(() => show(goal)).catch((err) => console.error(err))
    return queue
  }

  async function tick(now: number) {
    if (!playing) return
    const dt = (now - last) / 1000
    last = now
    let next = target + dt
    if (next >= cfg.duration) {
      if (cfg.loop && cfg.mode === 'scene') next %= cfg.duration
      else {
        next = cfg.duration
        playing = false
        button.textContent = 'Play'
      }
    }
    await go(next)
    if (playing) frame(tick)
  }

  const toggle = () => {
    playing = !playing
    button.textContent = playing ? 'Pause' : 'Play'
    if (!playing) return
    if (target >= cfg.duration) void go(0)
    frame((now) => {
      last = now
      frame(tick)
    })
  }

  button.addEventListener('click', toggle)
  scrub.addEventListener('input', () => void go(Number(scrub.value)))
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault()
      toggle()
    }
    if (e.code === 'ArrowRight') void go(target + step)
    if (e.code === 'ArrowLeft') void go(target - step)
  })

  const resume = Number(sessionStorage.getItem(KEY))
  sessionStorage.removeItem(KEY)
  void go(resume > 0 ? resume : 0)
}

const config = window.__pagereelPreview
if (config) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start(config), { once: true })
  } else start(config)
}
