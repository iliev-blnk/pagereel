# Instagram reel format

What `check` measures with its default target, `ig-reel`, and what Instagram does with the file.

## The file

- 1080×1920 (9:16), 30 fps. `render` to a `.mp4` makes H.264 with AAC audio.
- 3–90 s. Under 3 s is an error; over 90 s, Instagram may not show it as a reel.

## Safe zones

Instagram draws its interface over the video. Text must stay clear of:

- the top 220 px: the account name and the Reels header;
- the bottom 440 px: the caption, the audio line and the buttons;
- the right 150 px of the lower half (below y = 960): like, comment, share.

So text lives between y = 220 and y = 1480, and left of x = 930 below y = 960. A shape or a
background can run into the zones; words can't. Entrances get half a second: a line sliding in
through a zone isn't reported unless it stays there.

## Text

- Size: at least 36 px rendered at 1080 wide (under 28 px is an error), counting any scale
  transform. Headlines read at 96 px and up.
- Reading time: a line stays on screen at least 0.6 s + its words ÷ 3.5 seconds; six words need
  2.3 s.
- Contrast: at least 3:1 against the pixels behind it; aim for 4.5:1.
- Clipping: no text partly off screen or overflowing an `overflow: hidden` box once it has
  arrived.

## Picture

- Hook: the frame at 0.5 s is not a flat colour, and something moves within the first 1.5 s.
- Dead air: no stretch of 2.5 s or more where nothing moves.
- Flashing: no more than 3 flashes in any second (full-frame brightness swings; WCAG 2.3.1).

## Sound

- Loudness: −16 to −12 LUFS integrated; reels play at about −14.
- True peak: −1 dBTP or lower, or it clips once Instagram re-encodes it.
- `mix.write(path, { lufs: -14 })` meets both.

## Cover and caption

- Cover: a still from the reel. The Reels tab shows all of it; the profile grid shows the middle
  1080×1440 (3:4), so keep the words and the subject there.
- Caption: two lines at most (Instagram hides the rest behind "more"), real copy, three hashtags
  at most.
