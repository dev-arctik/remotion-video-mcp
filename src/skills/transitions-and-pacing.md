# Scene Transitions + Pacing

## Use `add_transition` between scenes — don't hard-cut everything

By default scenes hard-cut. To wrap consecutive scenes in `<TransitionSeries>`, call
`add_transition` and set the OUT-transition for each scene (last scene is ignored).

```
add_transition({
  projectPath,
  sceneId: 'scene-001',
  presentation: 'slide',
  direction: 'from-right',
  timing: 'spring',
  durationFrames: 18,
})
```

`Root.tsx` is regenerated automatically. The composition flips from `<Series>` to
`<TransitionSeries>` once any scene has a `transitionOut`.

## Picking a transition

| Presentation | Feel | Use for |
|---|---|---|
| `fade` | Universal, safe | Default if unsure |
| `slide` | Energetic, directional | Same-axis content (next/prev) |
| `wipe` | Bold, designy | Section breaks, headers |
| `flip` | Playful, brand | Reveal, before/after |
| `iris` | Cinematic | Hero moments, intros |
| `clock-wipe` | Dramatic | Time-related, countdowns |

## Spring vs Linear timing

Use `timing: 'spring'` for organic, modern feel. Use `timing: 'linear'` for clean, predictable.
M3 default is spring with damping 200.

## Transition Duration Heuristics

- 12–15 frames @ 30fps (~400–500ms) — quick punchy cut
- 18–24 frames @ 30fps (~600–800ms) — standard scene change
- 30+ frames — slow, cinematic (use sparingly)

## Audio-locked Pacing

For narration: scene durations should land on speech boundaries (sentence breaks). Use the
`audioSegmentIds` field on Scene to associate scenes with narration segments — `analyze_audio`
gives you those segment IDs.

For music: use `analyze_beats` then set scene durations to multiples of the beat interval
(4-beat or 8-beat phrases). Element entrances should land on beats — pass beat frame numbers
as `delay` on primitive animations.

## Pacing Anti-patterns

- ❌ Every scene the same duration — feels robotic
- ❌ Every transition is the same — visual monotony
- ❌ Long transitions (>30 frames) on short scenes — they overshadow content
- ❌ Heavy transitions every cut — motion fatigue. Save them for SECTION breaks.
