// The one clock. scene.js and audio.mjs both import it, so picture and sound stay on the beat.
import { beats } from './motion.js'

export const BPM = 120
export const B = beats(BPM)
export const DURATION = B(37)

export const cue = {
  typeIn: B(0),
  drawEnd: B(7),
  cut1: B(8),
  countStart: B(9),
  countEnd: B(13),
  cut2: B(16),
  cut3: B(24),
  bar1: B(25),
  bar2: B(26.5),
  cut4: B(32),
}

// The moments to look at when you review a render. audio.mjs lands a whoosh on each.
export const cuts = [cue.cut1, cue.cut2, cue.cut3, cue.cut4]
