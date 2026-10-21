# Reel spec: holdshort

## One bold idea

The site's own radar, rebuilt and playing: blue arrivals and orange departures fly over the
runways, the camera pushes in for one go-around, and the runways pulse on every beat. Everything
else is plain type on the site's flat dark ground.

## Format

1080×1920, 30 fps, 18 s, an Instagram reel. Text stays between y=220 and y=1480, and left of
x=930 below y=960. No loop. Defaults taken: 120 BPM, 9:16, no logo (the site has none).

## Tempo

120 BPM, 36 beats. Every cue is a beat in `timeline.js`.

## Palette (from holdshort.pages.dev)

- `#1b1f24` background
- `#e6e9ec` ink: the type, the runways
- `#4da3ff` blue: arrivals, the URL
- `#ff9f43` orange: departures

## Type

Inter (the site's face), 800 for headlines and numbers, 500 for labels (ink at 72 %). Headlines
100–168 px, URL 76 px, labels 40 px. Left-aligned at x=96, starting at y=980, under the radar.
Each line rolls through its own mask on the snappy spring.

## Copy (all from the site)

holdshort · Istanbul Airport · Rebuilt from open ADS-B data · every flight, runway and
go-around · Movements, last hour 66 · Median ASMA today 17.1 min · Go-arounds today 2 ·
holdshort.pages.dev

## Beats

| Beats | Type | Radar | Sound |
|-------|------|-------|-------|
| 0–8 | holdshort / Istanbul Airport | runways draw, arrivals already in flight | kick, hat |
| 8–16 | Rebuilt from / open ADS-B / data. | orange departures start climbing out | whoosh into b8 |
| 16–24 | Every flight, / runway / and go-around. | camera pushes in; one arrival turns away at b20.5, ringed | whoosh into b16, bell at the go-around |
| 24–32 | 66 / 17.1 min / 2, counting up | radar dims | whoosh into b24, ticks on the counts |
| 32–36 | holdshort / holdshort.pages.dev | radar back to full | crash on b32 |
