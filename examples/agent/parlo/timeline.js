// The one clock. scene.js and audio.mjs both import it, so picture and sound stay on the beat.
import { beats } from './motion.js'

export const BPM = 120
export const B = beats(BPM)
export const DURATION = B(36)

export const cue = {
  // The shape lands on the first frame, the type half a beat later.
  typeIn: B(0.5),
  // Every 6 beats (3 s): new copy, new form for the shape.
  cut1: B(6),
  cut2: B(12),
  cut3: B(18),
  cut4: B(24),
  cut5: B(30),
  // Everything leaves on the last beat.
  out: B(35),
}

// The moments to look at when you review a render. audio.mjs lands a whoosh on each.
export const cuts = [cue.cut1, cue.cut2, cue.cut3, cue.cut4, cue.cut5]
