# Reel spec

## One bold idea

One green shape keeps time and becomes each device in parlo's chain: a listening dot, the laptop,
the projector screen, the phone. The words are the README's own.

## Format

1080×1920, 30 fps, 18 s, an Instagram reel, no loop (defaults; the brief gave 15–20 s). Text stays
between y=220 and y=1480, and left of x=930 below y=960.

## Tempo

120 BPM, 36 beats. Every cue is a beat in `timeline.js`.

## Palette

- `#1f2328` background (the repo page's own ink)
- `#f6f8fa` ink: the type, the last form (the repo page's own paper)
- `#2da44e` accent: the shape (GitHub's green, from the Code button the page uses)

## Type

Mona Sans 800 (the site's face, on Google Fonts), 116 px, −0.03 em tracking, two lines 148 px
apart, left-aligned at x=96. Each line rolls through its own mask on the snappy spring.

## Beats

| Beats | Type                          | Shape                          | Sound           |
|-------|-------------------------------|--------------------------------|-----------------|
| 0–6   | Live captions / for talks.    | 360 px circle: it listens      | kick, hat       |
| 6–12  | One laptop / listens.         | 380×260 slab: the laptop       | whoosh into b6  |
| 12–18 | The projector / shows it.     | 888×500 wide screen            | whoosh into b12 |
| 18–24 | Phones follow / your language.| 300×480 tall slab: the phone   | whoosh into b18 |
| 24–30 | No cloud. / Fully offline.    | wide pill, 888×200             | whoosh into b24 |
| 30–35 | npm i -g / parlo-captions     | small ink square               | whoosh into b30 |
| 35–36 | everything leaves             | shrinks to nothing             | silence         |

Copy is from the README: "Live captions and translation for talks and events, fully offline.
One laptop listens, the projector shows captions, and everyone else follows on their phone in
their own language. No cloud", and the install line `npm i -g parlo-captions`.
