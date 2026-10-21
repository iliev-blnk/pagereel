// The one clock. scene.js and audio.mjs both import it, so picture and sound stay on the beat.
import { beats } from './motion.js'

export const BPM = 120
export const B = beats(BPM)
export const DURATION = B(36)

export const cue = {
  typeIn: B(0.5),
  // New copy every 8 beats.
  cut1: B(8),
  cut2: B(16),
  // The arrival that turns away, and the copy that names it.
  goAround: B(20.5),
  cut3: B(24),
  // Stats count up on beats 24, 26 and 28.
  stat: [B(24), B(26), B(28)],
  cut4: B(32),
}

// The moments to look at when you review a render. audio.mjs lands a whoosh on each.
export const cuts = [cue.cut1, cue.cut2, cue.goAround, cue.cut3, cue.cut4]
