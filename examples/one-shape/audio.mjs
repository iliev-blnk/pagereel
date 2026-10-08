// node examples/one-shape/audio.mjs out.wav — scored on the same grid as the picture.
import { createMix, note } from 'pagereel/audio'
import { B, clicks, DURATION, morphs } from './timeline.js'

const mix = createMix(DURATION)
const bars = DURATION / B(4)

// vi – IV – I – V in C, one chord per bar
const chords = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
]
const roots = [33, 29, 36, 31]

for (let bar = 0; bar < bars; bar++) {
  const at = B(bar * 4)
  const i = bar % 4
  mix.pad(at, B(4), chords[i].map(note))
  for (let k = 0; k < 4; k++) {
    mix.kick(B(bar * 4 + k))
    mix.hat(B(bar * 4 + k + 0.5), { pan: 0.3 })
    // bass: root on the beat, octave pop on the "and" of 4
    mix.bass(B(bar * 4 + k), B(0.45), note(roots[i]))
  }
  mix.bass(B(bar * 4 + 3.5), B(0.4), note(roots[i] + 12), { gain: 0.2 })
}

for (const m of morphs) mix.whoosh(m, 0.45, { gain: 0.35 })
for (const c of clicks) mix.click(c, { pan: 0.4 })

// toast lands: two rising blips
mix.blip(B(18.6), note(84), { pan: -0.2 })
mix.blip(B(18.85), note(88), { pan: 0.2 })

mix.write(process.argv[2] ?? 'audio.wav')
