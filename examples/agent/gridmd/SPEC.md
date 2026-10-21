# Reel spec: grid.md

## One bold idea

The page's own forecast chart is the instrument: the line draws hour by hour, the 50 % band and then
the 90 % band open around it as the copy explains them, and at the end the camera pans down from the
chart to a bar comparison and back. Everything else is plain type on white.

## Format

1080×1920, 30 fps, 18 s, an Instagram reel. Text stays between y=220 and y=1480, and left of
x=930 below y=960. No loop.

## Tempo

120 BPM, 36 beats. Every cue is a beat in `timeline.js`.

## Palette (from the site)

- `#ffffff` ground
- `#0e1116` ink: the type
- `#1838e6` accent: the line, the bands, the big numbers
- `#5b6472` grey: secondary type, the operator's bar
(the bands are tints of the accent)

## Type

Big Shoulders Display 800 for the numbers (the site's number face); IBM Plex Sans 500/700 for
everything else. 128 px for the opening lines, 96–110 px for support, numbers 260–520 px. Left-aligned
at x=96. Lines roll through their own masks. Chart: x 96–984, y 1020–1420; the hourly values are read
off the page's chart for tomorrow's forecast, so the shape is the page's own.

## Beats

| Beats | Copy | Moves | Sound |
|-------|------|-------|-------|
| 0–8 | Moldova / tomorrow, / hour by hour. | the line draws left to right from frame 0 | kick, hat |
| 8–16 | Peak around 10:00 / 851 MW | peak dot pops, 50 % band opens, number counts up | whoosh, ticks, bell |
| 16–24 | 90% sure / it lands between / 730 and 948 MW | 90 % band opens | whoosh, bell |
| 24–32 | Off by about / 9% / on average. | chart pans down, bars grow: operator's plan 19 %, grid.md 9 % | whoosh, clicks |
| 32–36 | grid.md / Every morning at 9:00 / URL | bars pan away, chart returns | whoosh, crash |
