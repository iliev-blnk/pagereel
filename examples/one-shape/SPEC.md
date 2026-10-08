# Example — "One Shape"

One rounded rectangle. Never cut. A cursor drives every change with a real click.
Last frame equals first frame, so it loops.

- Format: 1080×1080, 60 fps, 12 s, loops
- Tempo: 120 BPM → 24 beats, every cue sits on the grid (`timeline.js`)
- Palette: near-black `#0c0c0e`, signal blue `#3d5afe`, paper `#f4f4f5`, slate `#26262c`
- Type: Inter 600 / 500, tabular numbers on the slider readout

## States

| Beats  | State   | Shape                         | What happens                                              |
|--------|---------|-------------------------------|-----------------------------------------------------------|
| 0–4    | Button  | 340×96, r48, blue             | Cursor glides in, presses at b3 (shape dips to 0.94)      |
| 4–8    | Loader  | 124×124, r62, blue            | Label drops out, arc spins, breathes on the kick          |
| 8–14   | Player  | 680×220, r44, paper           | Cover + title + progress; cursor clicks play at b10       |
| 14–18  | Slider  | 680×24, r12, slate            | Cursor grabs knob b15, drags 30 → 85, releases b17.5      |
| 18–21  | Toast   | 500×112, r30, blue            | Check draws itself, "Saved" slides in                     |
| 21–24  | Button  | back to 340×96                | Label returns, cursor exits — frame 24 = frame 0           |

## Rules
- Every size/position/color moves on springs (`track` / `colorTrack`), contents fade on eases.
- Contents are clipped to the shape, so a morph never shows stray parts.
- Cursor and slider knob share the same spring during the drag so the knob never slips.
- Sound: kick on every beat, hats on the offbeat, bass + pad on vi–IV–I–V,
  a whoosh landing on each morph, a click on every cursor press.
