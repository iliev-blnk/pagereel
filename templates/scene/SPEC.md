# Reel spec

Write this before you touch scene.js, and keep it true as the reel changes. As it stands it
describes the starter that `pagereel init` made.

## One bold idea

The shape keeps time: it takes a new form at every cut and kicks on every beat. Everything
else stays plain.

## Format

1080×1920, 30 fps, 16 s, an Instagram reel. Text stays between y=220 and y=1480, and left of
x=930 below y=960. The last frame matches the first, so it loops.

## Tempo

120 BPM, 32 beats. Every cue is a beat in `timeline.js`; nothing is timed in raw seconds.

## Palette

- `#0f0f11` background
- `#f4f4f5` ink: the type, the last form
- `#3d5afe` accent: the shape

## Type

Inter 800, 128 px, −0.03 em tracking, two lines 156 px apart, left-aligned at x=96. Each line
rolls through its own mask, one line tall, on the snappy spring.

## Beats

| Beats | Type                    | Shape                         | Sound             |
|-------|-------------------------|-------------------------------|-------------------|
| 0–8   | Two lines / of type     | grows in: a 360 px circle     | kick, hat         |
| 8–16  | move on / springs.      | a wide pill, 888×200          | whoosh into b8    |
| 16–24 | One shape / keeps time. | a tall slab, 300×480          | whoosh into b16   |
| 24–31 | Now edit / scene.js     | a small square, turns ink     | whoosh into b24   |
| 31–32 | everything leaves       | shrinks to nothing            | silence           |
