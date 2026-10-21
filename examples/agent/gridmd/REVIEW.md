## Round 1
check: 2 errors, 18 warnings
scores: composition 6, legibility 5, motion 4, brand 8 (lowest still: t=4.30 s, the new number over the old lines)
1. The bars label "Grid operator's plan · 19%" sits at y≈1885 when the bars group is parked 900 px down, under Instagram's caption zone and cut off (16.3–18 s, `.label`) → park the bars and the chart 1100 px down in `chartY`/`barsY`.
2. At every cut the old lines and the new ones share the frame ("62" over "hour by hour." at 4.3 s, "851" over "90% sure" at 8.1 s), because both move at the cut in different masks → the old lines leave half a beat before the cut and the new ones rise half a beat after it (`HALF` in the line tracks).
3. "grid.md" at 340 px runs off the right edge at 16.9 s, and nothing moves in the first 2.5 s (hook and dead-air warnings) → drop it to 280 px; draw the line with `ease.out`, add a head dot, a slow push and a beat kick on the chart.

## Round 2
check: 0 errors, 13 warnings
scores: composition 8, legibility 8, motion 8, brand 8 (lowest still: t=12.40 s, the pan to the bars)
1. The 13 reading-time warnings are the counter's digits and lines leaving or arriving for 0.27 s each → leave it for a render; the counter is meant to run, and the exits are the transition. If a client wants zero warnings, slow the count to whole beats.
2. The pan down at 12.4 s leaves the left half of the frame empty for about a beat before the bars grow → start the plan bar at `cue.cut3 + B(0.5)` instead of `B(2.5)`.
3. The last section holds the lockup for only 2.5 s with the chart returning under it → move `cut4` to `B(31)` and keep `DURATION` at B(37) so the URL stays up for 3 s.
