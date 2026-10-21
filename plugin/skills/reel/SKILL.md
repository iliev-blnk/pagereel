---
name: reel
description: Make a short vertical video (an Instagram reel, a TikTok or YouTube Short, a promo, launch or explainer video) from a one-line brief, optionally about a website. Plans the reel, writes it as an HTML scene, lints it with pagereel check, reviews its own frames in scored rounds, scores a soundtrack and renders an upload-ready MP4. Use whenever someone asks to make, design or animate a reel, a short, a promo video or a motion piece.
---

# reel

A one-line brief in; an upload-ready reel out, in `reel-<slug>/` in the working directory:
`reel.mp4`, `cover.png`, `caption.txt` and `REVIEW.md`. Do the steps in order. Don't stop to ask:
default whatever the brief leaves out and write the default down in SPEC.md.

The pagereel tools are `site_kit`, `init`, `check`, `stills`, `frame` and `render`. Give them
absolute paths. Read [taste.md](references/taste.md) before you plan, keep
[motion.md](references/motion.md) open while you write the scene and the sound, and score with
[rubric.md](references/rubric.md). [ig-reel.md](references/ig-reel.md) has the format's numbers.
Read files several to a message, not one at a time. Write and edit files with your file tools,
not shell redirects or heredocs: the shell is only for `node` and `cp`.

## Rules

- Real copy only: words from the brief or from `site_kit`. Never invent numbers, stats, quotes,
  users, prices or features.
- Type is DOM text, never canvas text, so `check` can measure it.
- Fonts come from Google Fonts or from files in the project, never from the system.
- The scene is a pure function of time: no `Date.now`, `Math.random`, `requestAnimationFrame`,
  CSS transitions or animations, or timers. Randomness comes from `rng(seed)`.
- Nothing from the network but Google Fonts and `site_kit`: no stock footage, no generated
  images, no npm installs.

## 0. Parse the brief

Pull out the subject, the length, the format, the mood and whether it loops. Defaults: 9:16 at
1080×1920, 15–20 s, 120 BPM, no loop. `<slug>` is the subject in two or three lowercase words
joined by hyphens.

## 1. Read the site (when the brief has a URL)

`site_kit { url, outDir: <working dir>/kit }`. Not inside `reel-<slug>/`: `init` needs that
empty, and the screenshots don't ship. Take the reel's copy, palette, fonts and logo from what it
returns. If the reel shows the logo, copy the file into `reel-<slug>/` after step 2.

## 2. Plan: `init`, then SPEC.md

`init { dir: <working dir>/reel-<slug> }` writes a working 16 s starter that renders and passes
`check`. Read its SPEC.md, timeline.js and scene.js in one message: they are the patterns to
build on. Then, before any code, rewrite SPEC.md for this reel:

- **One bold idea**: the one thing this reel does that a template wouldn't. Everything else plain.
- **Format**: size, 30 fps, length, loop or not.
- **Tempo**: the BPM. Every cue is a beat.
- **Palette**: four colours at most, in hex, each with its job.
- **Type**: one family (two at most), weights, sizes (36 px and up) and where the type sits.
- **Beats**: a table with a row per section: the beats, the copy on screen, what moves, the
  sound. A hook in the first 2 s (something already moving at 0.5 s), and a payoff every 3–5 s:
  a cut, a reveal, a change of form.

## 3. Write the scene

- `timeline.js`: BPM, `B`, `DURATION`, a `cue` per moment, and `cuts`, the times you review and
  `audio.mjs` accents.
- `index.html`: the font link (with `&display=block`), the palette as CSS variables, the stage.
- `scene.js`: build every moving value as a `track` or `colorTrack` at module level; `seek(t)`
  only reads them and writes styles. Keep `window.pagereel` as the starter has it: duration,
  fps 30, 1080×1920, `audio: './audio.wav'`, `ready: document.fonts.ready`, seek.
- A line of type rolls through its own `overflow: hidden` mask, one `--slot` tall, as in the
  starter. Its `line-height` is the slot, at least 1.25 times the font size (1.21 for Inter), or
  `check` reports the line as cut off.
- Text stays between y = 220 and y = 1480, and left of x = 930 below y = 960: Instagram's
  buttons and caption cover the rest.

## 4. Review, in rounds

Each round:

1. `check { source: <reel>/index.html }`. Every error is a problem for this round.
2. `stills { source }`: a contact sheet of 16 frames across the reel.
3. `frame { source, t }` at every cut + 0.1 s and + 0.3 s, where transitions go wrong and a
   contact sheet doesn't show it. Ask for them all in one message. From round 2 on, only the cuts
   you changed and the ones that scored under 8.
4. Score every still and frame 1–10 on composition, legibility, motion intent and brand fit, by
   rubric.md. A criterion's score for the round is its lowest, and it only rises when the frames
   behind it changed.
5. Append the round to `<reel>/REVIEW.md`, in exactly this form:

   ```
   ## Round N
   check: E errors, W warnings
   scores: composition C, legibility L, motion M, brand B (lowest still: t=…)
   1. <problem> → <fix>
   2. …
   3. …
   ```

   The three worst problems, check errors first. Each names what is wrong, where (the time and
   the element) and why it matters; each fix is a change you can make in the code. "Leave it" is
   not a fix: a problem you would leave isn't one of the three worst, so look again.
6. If `check` had no errors and every score is 8 or more, this was the last round: its three
   lines are the fixes you would make next, and the picture doesn't change again. Otherwise make
   the three fixes and start the next round: a round with a score under 8 is never the last
   before round 4. Round 4 is the last either way; if it falls short, add a line under it saying
   what still does.

## 5. Sound

Rewrite `audio.mjs` on the same timeline: a pulse on the beat, an accent on every cut, a sound for
every action on screen. Run `node <reel>/audio.mjs`, which writes `audio.wav` beside it at
−14 LUFS. Then `check` again and fix any `audio` error.

## 6. Render and deliver

1. `render { source: <reel>/index.html, output: <reel>/reel.mp4 }`.
2. `cover.png`: copy the strongest still from `<reel>/out/stills/`: the hook or the bold idea,
   the words readable, the subject inside the middle 1080×1440, which the profile grid shows.
3. `caption.txt`: two lines at most, real copy, the URL if the brief had one, three hashtags at
   most.
4. Reply with the path of each deliverable, the reel's length, the number of rounds, and the
   check line of round 1 against the last round's.
