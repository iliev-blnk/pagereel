## Round 1
check: 2 errors, 11 warnings
scores: composition 5, legibility 5, motion 4, brand 7 (lowest still: t=4.1)
1. The "34L" and "35R" labels are cut off from 8.5 s: the push-in scales them past the radar's 940 px edge → move the runways and labels up, set the camera origin higher, and push to 1.15.
2. At every cut (4.1, 8.1, 12.1 s) the old line is still leaving while the new one arrives, in overlapping masks of different heights: "holdshort" over "Rebuilt from" → each section's lines leave half a beat before the next section's arrive.
3. The stat numbers count up, so each digit change reads as a new line for 0.27 s (reading-time warnings), and the planes are too small to count as movement (dead air at 0.6–8 s) → show each stat's real value rolling in, and make the planes 1.5× larger and faster, with the radar shifted right to balance the left-aligned type.

## Round 2
check: 0 errors, 2 warnings
scores: composition 7, legibility 8, motion 7, brand 8 (lowest still: t=15.7)
1. Nothing moves enough at 13.2–15.8 s (stats hold, radar dimmed to 35 %): the planes fall under the motion threshold → dim the radar to 55 % instead of 35 %, so the planes still read as movement.
2. The radar's left half (x 0–500, y 0–900) is empty in every frame and the planes cluster around the runways at x 600–760: composition leans right → start arrivals further left (sx = rx − 960…rx + 240) so they sweep across the empty half.
3. The audio is missing (check warns it was not found) → write audio.mjs on the cues and run it.

## Round 3
check: 0 errors, 0 warnings
scores: composition 7, legibility 8, motion 8, brand 8 (lowest still: t=3.38)
1. The radar still sits right of centre (runways at x 600 and 760) with its left half empty from 0 to 3.4 s, under left-aligned type → move the runways to x 480 and 640, and the camera origin, departures and go-around path with them.
2. The ring around the go-around plane stays on screen empty from 12 s to the end (visible at 14.5 and 15.7 s) after the plane has flown off → fade the ring out with the plane, at u 0.85–0.95 of its flight.
3. The stat labels ("Movements, last hour" and the other two) are 40 px at 72 % ink, the faintest type in the reel at 14.5 s → raise the label colour to 88 % ink.

## Round 4
check: 0 errors, 0 warnings
scores: composition 7, legibility 8, motion 8, brand 8 (lowest still: t=3.38)
1. The ring was still on screen, empty, at 14.5, 16.1 and 16.3 s, and its brightness changed with the order frames were captured: seek only updated it while the go-around plane was on screen, so it kept the last value → set the ring's opacity to 0 at the start of every seek (done; it is gone at 12.5, 14.5 and 16.3 s).
2. Composition: the radar fills only the top 940 px, with its left half empty at 0–4 s and the bottom third empty under the type → scale the radar to 1.3× and run its field to y 1000, with the stats starting at y 1040.
3. At 3.4 s the plane count on screen is two or three, so the hook reads thin → add a third stream of arrivals at 34L on beats 0–8.
Composition is still a 7: the radar is small against the empty left half and the empty lower third.
