// The soundtrack, scored on the same beat grid as the picture. Run it again whenever
// timeline.js changes:  node audio.mjs  → audio.wav beside this file, at -14 LUFS.
import { fileURLToPath } from 'node:url'
import { createMix } from './audio.js'
import { B, cue, cuts, DURATION } from './timeline.js'

const mix = createMix(DURATION, { loop: false })

// A kick on every beat and a hat between them, until everything leaves.
for (let n = 0; B(n) < cue.out; n++) {
  mix.kick(B(n))
  mix.hat(B(n + 0.5), { pan: 0.3 })
}

// A swell that lands on each cut.
for (const at of cuts) {
  mix.whoosh(at, 0.5, { gain: 0.4 })
  mix.snare(at, { gain: 0.5 })
}

// A bell as each new line rises, and a sub under the last form.
for (const at of [cue.cut1, cue.cut2, cue.cut3, cue.cut4]) mix.bell(at + B(0.25), 880, { dur: 0.6, gain: 0.3 })
mix.blip(cue.cut5 + B(0.25), 1320, { gain: 0.4 })
mix.sub(cue.cut5, { gain: 0.6 })

mix.write(fileURLToPath(new URL('audio.wav', import.meta.url)), { lufs: -14 })
