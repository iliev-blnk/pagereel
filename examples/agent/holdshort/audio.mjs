// The soundtrack, scored on the same beat grid as the picture. Run it again whenever
// timeline.js changes:  node audio.mjs  → audio.wav beside this file, at -14 LUFS.
import { fileURLToPath } from 'node:url'
import { createMix, note } from './audio.js'
import { B, cue, cuts, DURATION } from './timeline.js'

const mix = createMix(DURATION, { loop: false })

// A kick on every beat, a hat between them, a snare on the backbeat from beat 8.
for (let n = 0; B(n) < DURATION - B(1); n++) {
  mix.kick(B(n))
  mix.hat(B(n + 0.5), { pan: 0.3 })
  if (n >= 8 && n % 2 === 1) mix.snare(B(n), { gain: 0.5 })
}
// A bass note per four beats under the beat.
for (let n = 0; n < 36; n += 4) mix.bass(B(n), B(4), note(n % 8 === 0 ? 33 : 36), { gain: 0.5 })

// A swell into every cut, a crash on the sign-off.
for (const at of cuts) mix.whoosh(at, 0.5, { gain: 0.4 })
mix.crash(cue.cut4, { gain: 0.6 })

// The go-around: a bell as the ring lands, a low boom as the plane turns away.
mix.bell(B(19.75), note(81), { dur: 1.2, gain: 0.5 })
mix.sub(cue.goAround, { gain: 0.5 })

// A tick for each stat as it rolls in.
for (const at of cue.stat) mix.blip(at, 1320, { gain: 0.6 })

mix.write(fileURLToPath(new URL('audio.wav', import.meta.url)), { lufs: -14 })
