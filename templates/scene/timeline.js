// The one clock. scene.js and audio.mjs both import it, so picture and sound stay on the beat.
import { beats } from './motion.js'

export const BPM = 120
export const B = beats(BPM)
export const DURATION = B(32)

export const cue = {
  // The shape lands on the first frame, the type half a beat later.
  typeIn: B(0.5),
  // Every 8 beats (4 s): new copy, new form for the shape.
  cut1: B(8),
  cut2: B(16),
  cut3: B(24),
  // Everything leaves on the last beat, so the last frame matches the first and the reel loops.
  out: B(31),
}

// The moments to look at when you review a render. audio.mjs lands a whoosh on each.
export const cuts = [cue.cut1, cue.cut2, cue.cut3]
