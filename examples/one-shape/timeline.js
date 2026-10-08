// Single source of truth for timing — the scene and audio.mjs both import this.
import { beats } from 'pagereel/motion'

export const BPM = 120
export const B = beats(BPM)
export const DURATION = B(24)

export const cue = {
  cursorIn: B(0.5),
  press: B(3),
  release: B(3.3),
  toLoader: B(4),
  toPlayer: B(8),
  toPlayButton: B(8.8),
  playClick: B(10),
  toSlider: B(14),
  toKnob: B(13.6),
  grab: B(15.2),
  dragEnd: B(17.2),
  letGo: B(17.5),
  toToast: B(18),
  toButton: B(21),
  cursorOut: B(21.6),
}

// Every morph lands here — the audio puts a whoosh on each.
export const morphs = [cue.toLoader, cue.toPlayer, cue.toSlider, cue.toToast, cue.toButton]
export const clicks = [cue.press, cue.playClick, cue.grab, cue.letGo]
