// The soundtrack, scored on the same beat grid as the picture. Run it again whenever
// timeline.js changes:  node audio.mjs  → audio.wav beside this file, at -14 LUFS.
import { fileURLToPath } from 'node:url'
import { createMix, note } from './audio.js'
import { B, cue, cuts, DURATION } from './timeline.js'

const mix = createMix(DURATION, { loop: false })

// A kick on every beat and a hat between them; a bass note each bar.
for (let n = 0; n < 37; n++) {
  mix.kick(B(n), { gain: n >= 32 ? 0.7 : 1 })
  mix.hat(B(n + 0.5), { pan: 0.3 })
  if (n % 4 === 0) mix.bass(B(n), B(4), note(n % 8 === 0 ? 33 : 36), { gain: 0.5 })
}

// A swell into every cut.
for (const at of cuts) mix.whoosh(at, 0.5, { gain: 0.4 })

// The line draws: a tick on each hour as it passes.
for (let i = 0; i < 24; i++) mix.blip(cue.typeIn + (i / 23) * (cue.drawEnd - cue.typeIn), 660 + i * 20, { gain: 0.12 })

// The peak dot pops; the number counts up in ticks.
mix.bell(cue.cut1 + B(0.5), note(81), { dur: 0.8 })
for (let i = 0; i < 16; i++) mix.blip(cue.countStart + (i / 16) * (cue.countEnd - cue.countStart), 900 + i * 25, { gain: 0.15 })
mix.sub(cue.countEnd, { gain: 0.6 })

// The bands open.
mix.bell(cue.cut1 + B(1), note(76), { dur: 0.6, gain: 0.5 })
mix.bell(cue.cut2 + B(0.5), note(88), { dur: 1, gain: 0.7 })

// The bars grow.
mix.click(cue.bar2)
mix.click(cue.bar1)
mix.bell(cue.bar1 + B(1), note(84), { dur: 0.8 })

// The close.
mix.crash(cue.cut4)

mix.write(fileURLToPath(new URL('audio.wav', import.meta.url)), { lufs: -14 })
