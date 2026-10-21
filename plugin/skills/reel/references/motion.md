# Motion and sound cheat sheet

`motion.js` and `audio.js` in the reel folder are copies of `pagereel/motion` and
`pagereel/audio`, so the page and `audio.mjs` import them with no bundler. Everything in
`motion.js` is a pure function of `t`, which is what lets any frame render on its own.

```js
import { beats, clamp, colorTrack, ease, fade, invLerp, lerp, rng, track } from './motion.js'
```

## track: a value that springs between targets

```js
// Starts at 360; springs to 120 at 2 s, then to 560 at 4 s.
const w = track(360, [[2, 120, 'snappy'], [4, 560]])
w(3.1) // → a number
```

- One track per property, holding every change it ever makes. Never make a second track for the
  same property or restart a spring: each change adds its own spring from its own time, so the
  motion stays continuous through a change that lands mid-flight.
- Build tracks once, at module level. `seek(t)` only calls them and writes styles.
- `colorTrack('#3d5afe', [[at, '#f4f4f5', preset]])` does the same for `#rrggbb` colours and
  returns `rgb(r,g,b)`.

## Spring presets

| Preset | Settles in | Overshoot | For |
|---|---|---|---|
| `snappy` | 0.18 s | 2 % | type rolling through a mask, leading edges, small UI |
| `default` | 0.34 s | 1 % | cards, containers, shapes |
| `heavy` | 0.71 s | none | big type, a logo lockup, the camera |
| `playful` | 0.55 s | 21 % | stickers, a bounce that is the point |

A preset is `{ freq, zeta }` (Hz, damping ratio); pass your own object for anything in between.
At 120 BPM a beat is 0.5 s: a `heavy` move needs more than a beat before the next cut.

## beats: the one clock

```js
const B = beats(120)
B(8)          // beat 8 → 4 s
B.spb         // seconds per beat: 0.5
B.index(t)    // seconds → fractional beat
B.pulse(t)    // 1 on each beat, decaying to ~0 before the next (decay = 6)
```

Every cue is `B(n)` in `timeline.js`, which `scene.js` and `audio.mjs` both import. Don't type a
time in seconds in two places.

## fade and ease: for opacity and wipes only

```js
fade(t, a, b)            // 0 → 1 between a and b seconds, ease.inOut
fade(t, a, b, ease.out)  // ease.out, ease.in, ease.inOut
```

Things that move use springs; plain eases are for what should not feel physical.

## Patterns

**Several properties, one change of form.** One track per property, changing at the same cues,
as the starter's `morph(key)` does:

```js
const morph = (key) => track(FORMS[0][key], FORMS.slice(1).map((f) => [f.at, f[key]]))
const x = morph('x'), y = morph('y'), w = morph('w'), h = morph('h')
```

**Colour moves faster than size**, so the muddy midpoint between two colours only flashes by:

```js
const TINT = { freq: 3.4, zeta: 1 } // settles in 0.27 s, no overshoot
const fill = colorTrack(BLUE, [[cue.cut1, INK, TINT]])
```

**Things that move together share one spring config**, so they never drift apart.

**A line of type through its mask.** Each line sits in an `overflow: hidden` box one slot tall;
the line rises in from below at its cue and leaves through the top at the next:

```js
const y = track(SLOT, [[cue.in + k * B(0.25), 0, 'snappy'], [cue.out + k * B(0.25), -SLOT, 'snappy']])
el.style.transform = `translateY(${y(t)}px)` // in seek
```

The second line (`k = 1`) follows the first by a quarter beat. Swapping copy at a cut is the
same move: the old line leaves through the top while the new one rises from the bottom.

**A kick on the beat.** `scale = 1 + 0.06 * B.pulse(t)`. Small: 0.04–0.08.

**A press.** Dip and spring back: `track(1, [[at, 0.92, 'snappy'], [at + 0.12, 1, 'playful']])`.

**A window of visibility** (fades in over beats a→b, out over c→d):

```js
const vis = (t, a, b, c, d) => fade(t, B(a), B(b)) - fade(t, B(c), B(d))
```

**A real number counting up** (only a number from the brief or the site):

```js
const n = Math.round(lerp(0, 4200, ease.out(invLerp(cue.count, cue.count + B(2), t))))
```

Set `font-variant-numeric: tabular-nums` so the digits don't jitter as they change.

**The camera.** Put the stage's content in one wrapper and move that, on `heavy`: push in on a
small state, pull back for a wide one.

**Seeded variety.** `const r = rng(7)`: call `r()` at module level to place things; never in
`seek`.

## Sound: audio.mjs

```js
import { fileURLToPath } from 'node:url'
import { createMix, note } from './audio.js'
import { B, cue, cuts, DURATION } from './timeline.js'

const mix = createMix(DURATION, { loop: false }) // loop: true wraps tails to the start
mix.kick(B(0))
mix.write(fileURLToPath(new URL('audio.wav', import.meta.url)), { lufs: -14 })
```

| Voice | Use |
|---|---|
| `kick(at)`, `snare(at)`, `hat(at)`, `crash(at)` | the beat |
| `click(at)`, `blip(at, freq = 880)` | UI actions: a press, a tick, a type-on |
| `whoosh(at, len = 0.5)` | a swell that peaks at `at`: put it on a cut |
| `sub(at)` | a low boom for the one big moment |
| `bass(at, dur, freq)`, `pad(at, dur, [freqs])` | a bed under the beat |
| `bell(at, freq, { dur })` | a bright accent, a reveal |

Every voice takes `{ gain, pan }` last (gain 0–1 and up, pan −1 left to 1 right).
`note(midi)` turns a MIDI note into Hz: `note(57)` is A3, 220 Hz. Write with `{ lufs: -14 }`:
it normalises the loudness under the true peak `check` allows.
