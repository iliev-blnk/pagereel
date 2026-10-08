// Virtual clock, injected before any page script in clock mode.
// Replaces every source of time the page can read, so pagereel decides what
// "now" is: performance.now, Date, timers, requestAnimationFrame, Math.random,
// and CSS / Web Animations.

interface Config {
  seed: number
  epoch: number
}

interface Timer {
  at: number
  fn: (...args: unknown[]) => void
  args: unknown[]
  interval?: number
  depth: number
}

declare global {
  interface Window {
    __pagereelConfig?: Config
    __pagereel?: {
      now(): number
      advance(ms: number): Promise<void>
      advanceTo(ms: number, stepMs: number): Promise<void>
      /** The browser's own requestAnimationFrame, for the preview player. */
      realFrame(cb: FrameRequestCallback): number
    }
  }
}

const MAX_RUNS = 10_000

const config: Config = window.__pagereelConfig ?? { seed: 1, epoch: Date.now() }
const RealDate = Date
const realSetTimeout = window.setTimeout.bind(window)
const realFrame = window.requestAnimationFrame.bind(window)

let now = 0

// Math.random: same generator as pagereel/motion `rng`.
let seed = config.seed >>> 0
Math.random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296
}

Object.defineProperty(performance, 'now', { value: () => now, configurable: true })

const wallNow = () => config.epoch + now
function VirtualDate(this: unknown, ...args: unknown[]) {
  if (!new.target) return new RealDate(wallNow()).toString()
  // biome-ignore lint/suspicious/noExplicitAny: forwarding constructor arguments
  return args.length ? new (RealDate as any)(...args) : new RealDate(wallNow())
}
VirtualDate.prototype = RealDate.prototype
VirtualDate.now = wallNow
VirtualDate.parse = RealDate.parse
VirtualDate.UTC = RealDate.UTC
window.Date = VirtualDate as unknown as DateConstructor

// Timers. Like browsers, nested zero-delay timers are clamped to 4 ms.
const timers = new Map<number, Timer>()
let nextTimer = 1
let depth = 0

function schedule(handler: unknown, ms: unknown, args: unknown[], repeat: boolean) {
  // Browsers run a string handler as code in the global scope.
  // biome-ignore lint/security/noGlobalEval: matches setTimeout('code') semantics
  const evalGlobal = (code: string) => globalThis.eval(code)
  const fn =
    typeof handler === 'function' ? (handler as Timer['fn']) : () => evalGlobal(String(handler))
  let delay = Math.max(0, Number(ms) || 0)
  if (depth >= 5 && delay < 4) delay = 4
  const id = nextTimer++
  timers.set(id, {
    at: now + delay,
    fn,
    args,
    interval: repeat ? Math.max(delay, 1) : undefined,
    depth: depth + 1,
  })
  return id
}

window.setTimeout = ((h: unknown, ms?: unknown, ...a: unknown[]) =>
  schedule(h, ms, a, false)) as typeof window.setTimeout
window.setInterval = ((h: unknown, ms?: unknown, ...a: unknown[]) =>
  schedule(h, ms, a, true)) as typeof window.setInterval
window.clearTimeout = ((id?: number) =>
  void timers.delete(Number(id))) as typeof window.clearTimeout
window.clearInterval = window.clearTimeout as typeof window.clearInterval

const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 1
window.requestAnimationFrame = (cb) => {
  const id = nextFrame++
  frames.set(id, cb)
  return id
}
window.cancelAnimationFrame = (id) => void frames.delete(id)

// Animations are paused and placed by hand. An animation's birth is the
// virtual time pagereel first saw it, so transitions started by a timer at
// 1 s begin at 1 s.
const births = new WeakMap<Animation, number>()
function noteAnimations() {
  for (const a of document.getAnimations()) if (!births.has(a)) births.set(a, now)
}
function placeAnimations() {
  for (const a of document.getAnimations()) {
    if (!births.has(a)) births.set(a, now)
    a.pause()
    a.currentTime = now - (births.get(a) ?? now)
  }
}

function runTimers(target: number) {
  let runs = 0
  for (;;) {
    let nextId = 0
    let next: Timer | undefined
    for (const [id, t] of timers) {
      if (t.at <= target && (!next || t.at < next.at)) {
        next = t
        nextId = id
      }
    }
    if (!next) return
    if (++runs > MAX_RUNS) {
      throw new Error(
        `more than ${MAX_RUNS} timer callbacks before t=${(target / 1000).toFixed(3)}s; the page keeps scheduling timers faster than time passes`,
      )
    }
    now = Math.max(now, next.at)
    if (next.interval) next.at += next.interval
    else timers.delete(nextId)
    depth = next.depth
    try {
      next.fn(...next.args)
    } catch (err) {
      console.error(err)
    } finally {
      depth = 0
    }
    noteAnimations()
  }
}

async function advance(target: number) {
  if (target < now) throw new Error('the clock cannot go back in time')
  runTimers(target)
  now = target
  const due = [...frames.values()]
  frames.clear()
  for (const cb of due) {
    try {
      cb(now)
    } catch (err) {
      console.error(err)
    }
  }
  noteAnimations()
  // Let promise chains and observers triggered by this frame settle.
  await new Promise((resolve) => realSetTimeout(resolve, 0))
  placeAnimations()
}

window.__pagereel = {
  now: () => now,
  realFrame,
  advance,
  async advanceTo(target, step) {
    while (now + step < target - 1e-6) await advance(now + step)
    await advance(target)
  },
}

export {}
