export type Severity = 'error' | 'warn'

export type RuleId =
  | 'format'
  | 'safe-zone'
  | 'text-size'
  | 'text-clipped'
  | 'reading-time'
  | 'contrast'
  | 'hook'
  | 'dead-air'
  | 'flash'
  | 'audio'

/** One problem, over the time range it lasts. Whole-reel findings use 0–0. */
export interface Finding {
  id: RuleId
  severity: Severity
  from: number
  to: number
  message: string
  hint: string
}

/** A piece of DOM text as drawn at one moment, in CSS pixels of the viewport. */
export interface TextBox {
  /** The text with whitespace collapsed; the same text keeps the same key across seeks. */
  key: string
  /** The first 40 characters, for messages. */
  label: string
  words: number
  x: number
  y: number
  w: number
  h: number
  /** Font size after transforms. */
  fontPx: number
  color: [number, number, number]
  /** Product of the opacities up the tree. */
  opacity: number
  /** Cut off by the viewport or by an overflow-hidden ancestor. */
  clipped: boolean
}

export interface TextSample {
  t: number
  /** `contrast` is the WCAG ratio against the pixels behind the text, when it could be measured. */
  boxes: Array<TextBox & { contrast?: number }>
}

export interface FrameStat {
  t: number
  /** Mean relative luminance, 0–1. */
  mean: number
  /** Standard deviation of the most varied RGB channel, 0–255. */
  std: number
  /**
   * Mean absolute difference from the previous frame in the RGB channel that changed most,
   * 0–255; 0 for the first frame.
   */
  diff: number
}

export interface AudioStats {
  /** Integrated loudness, LUFS. */
  integrated: number
  /** True peak, dBTP. */
  truePeak: number
}

export type Target = 'ig-reel' | 'none'

export interface CheckReport {
  source: string
  target: Target
  /** Output pixels. */
  width: number
  height: number
  duration: number
  fps: number
  findings: Finding[]
  errors: number
  warnings: number
  /** Things the checks could not look at, e.g. a page with no DOM text. */
  notes: string[]
  /** How long the check took. */
  seconds: number
}
