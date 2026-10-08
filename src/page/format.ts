/** "1.50s  f45": seconds plus the frame number at `fps`. */
export const formatTime = (t: number, fps: number) => `${t.toFixed(2)}s  f${Math.round(t * fps)}`
