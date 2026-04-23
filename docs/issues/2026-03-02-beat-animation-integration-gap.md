# Issue: Beat Analysis → Scene Animation Integration Gap

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** Critical
**Affected Area:** Backend + Templates
**Affected Component(s):** `src/tools/analyze-beats.ts`, `src/utils/beat-analysis.ts`, `src/templates/utils/animations.ts`, `src/templates/components/TitleCard.tsx`, `src/templates/components/TextScene.tsx`, `src/templates/components/ImageScene.tsx`, `src/templates/components/TextWithImage.tsx`, `src/utils/file-ops.ts`

---

## Problem

The `analyze_beats` tool detects BPM and beat timestamps from audio files and returns frame-indexed beat data, but there is a complete disconnect between that data and the scene animation system. After calling `analyze_beats`, Claude receives a JSON payload with beat information but has no tools, utilities, or template props to act on it. Every beat-synced video requires the user to manually build infrastructure from scratch.

**Expected:** After `analyze_beats` runs, the project should have ready-to-use TypeScript utilities and template support that let Claude immediately author beat-synced scenes — snapping entrances to beat frames, pulsing elements on downbeats, and staggering content across beat boundaries.

**Actual:** Claude receives raw beat JSON (BPM, frame numbers, suggested scene durations) and is left with nothing. No utility file is generated in the user's project. No beat-aware component exists in the template library. No template prop accepts a beat frame. The user must manually write all of this for every project.

## Steps to Reproduce

1. Run `start_session` → `init_project` → `import_asset` (background music file)
2. Run `analyze_beats` on the imported audio file
3. Attempt to author a 12-scene beat-synced video where scene elements land on beat boundaries
4. Observe: the `next_steps` in the `analyze_beats` response instructs Claude to use `beats[N].frame` values, but there is no mechanism in the codebase to consume those values — no utility functions, no template props, no component that responds to beat timing
5. Observe: every beat-aware behavior (pulse on beat, snap entrance to beat, stagger across beats) must be implemented from scratch via `write_file` for every project

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerAnalyzeBeats` tool handler | `src/tools/analyze-beats.ts` | 110–135 | Saves `<name>-beats.json` sidecar and returns beat data to Claude. Never writes any `.ts` utility file into the user project. The `next_steps` text at line 126–134 tells Claude to use beat frame values, but no utility exists to use them with. |
| `analyzeBeats` function | `src/utils/beat-analysis.ts` | 62–98 | Core beat detection — returns `BeatData` with `bpm`, `beatIntervalMs`, and `beats[]` array of `{ time, frame }`. This data never reaches the project's TypeScript code. |
| `BeatData` interface | `src/utils/beat-analysis.ts` | 5–15 | Defines the beat data shape. Has no corresponding TypeScript utility output path. |
| `computeEntrance` | `src/templates/utils/animations.ts` | 53–102 | Accepts `preset, frame, fps, delay` — `delay` is a fixed frame offset, not a beat-aligned offset. No way to say "land on beat frame N". |
| `EntrancePreset` type | `src/templates/utils/animations.ts` | 37–43 | Six presets: `fade-up`, `fly-from-left`, `fly-from-right`, `fly-from-bottom`, `zoom-in`, `drop-in`. Zero beat-aware variants. No `beat-drop` or `on-beat` entry point. |
| `springEntrance` | `src/templates/utils/animations.ts` | 26–32 | Generic spring helper. `delay` param shifts animation start by a fixed number of frames but has no concept of beat alignment. |
| `TitleCard` props | `src/templates/components/TitleCard.tsx` | 6–17 | Accepts `entrancePreset?: EntrancePreset` (line 16) but no `beatFrame`, `beatSync`, or beat-pulse props. All animation timing is frame-0-relative. |
| `TextScene` props | `src/templates/components/TextScene.tsx` | 6–18 | Accepts `entrancePreset?: EntrancePreset` (line 17). Bullet stagger is hardcoded to 8-frame intervals (line 111) — no beat-aware stagger. |
| `ImageScene` props | `src/templates/components/ImageScene.tsx` | 6–18 | Accepts `entrancePreset?: EntrancePreset` (line 17). Ken Burns effect ignores beat timing entirely. |
| `TextWithImage` props | `src/templates/components/TextWithImage.tsx` | 6–17 | Accepts `entrancePreset?: EntrancePreset` (line 16). No beat-frame support. |
| `KineticTypography` props | `src/templates/components/KineticTypography.tsx` | 10–20 | The only template with audio-aware timing — `audioWords?: AudioWord[]` (line 12) lets word entrances sync to timestamps. This is the closest existing pattern to beat sync but not extended to other templates or beat data. |
| `regenerateRootTsx` | `src/utils/file-ops.ts` | 160–270 | Generates `Root.tsx` from `composition.json`. Never emits a `src/utils/beats.ts` utility. Beat data has no path into this code generation flow. |
| `copyTemplates` | `src/utils/file-ops.ts` | 74–97 | Copies the template library into new projects. No `BeatPulse` component exists to copy. |

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `analyze-beats.ts` output block (lines 116–135) | Confirmed: tool returns beat data and saves a JSON sidecar (`<name>-beats.json` in `assets/audio/`). The `next_steps` string at line 133 explicitly says to use `beats[N].frame` values, but nothing in the MCP toolchain consumes or scaffolds around those values. No `fs.writeFile` for a `.ts` utility file exists anywhere in the handler. |
| `beat-analysis.ts` return value (lines 87–98) | Confirmed: `analyzeBeats()` returns `BeatData` with accurate `bpm`, `beatIntervalMs`, and per-beat `{ time, frame }` entries. This object is serialized to JSON only. No TypeScript representation is ever written into the user's Remotion project. |
| `animations.ts` — `computeEntrance` signature (lines 53–58) | Confirmed: `delay: number = 0` is the only timing parameter. It shifts the animation by a fixed frame count (`effectiveFrame = Math.max(0, frame - delay)` at line 59). It has no concept of a target landing frame, making beat alignment impossible without manual frame math outside the template. |
| `animations.ts` — `EntrancePreset` type (lines 37–43) | Confirmed: all six preset values are positional motion styles, none are beat-aware or timing-aware. There is no `enterOnBeat` helper anywhere in the file. |
| `TitleCard.tsx`, `TextScene.tsx`, `ImageScene.tsx`, `TextWithImage.tsx` — prop interfaces | Confirmed: all four templates have `entrancePreset?: EntrancePreset` as their only animation hook. None accept a `beatFrame`, `beatSync`, or pulse-related prop. Animation calculations in all four are anchored to frame 0 with fixed delays. |
| `KineticTypography.tsx` — `audioWords` pattern (lines 46–54) | Confirmed: `getWordFrame()` at line 46 reads `audioWords[wordIndex].start * fps` to produce a frame-accurate word entrance. This is the only timestamp-to-frame sync pattern in the codebase. It is not generalized and not connected to beat data. |
| `src/templates/components/` — `BeatPulse` search | Confirmed: no file named `BeatPulse.tsx`, `BeatEnergy.tsx`, or similar exists. No radial glow, flash overlay, or beat-response component is present in the template library. |
| `file-ops.ts` — `regenerateRootTsx` and `copyTemplates` (lines 74–97, 160–270) | Confirmed: `copyTemplates` copies everything under `src/templates/` into the user project. `regenerateRootTsx` generates `Root.tsx` from scene and overlay data only. Neither function has any awareness of beat data or a beats utility file. |

### Root Cause

The `analyze_beats` tool was built as a data-extraction tool only. It detects beat timing and returns it as a JSON payload and sidecar file, but was never connected to the downstream code generation layer. Three independent gaps compound the problem:

1. **No utility scaffolding.** `analyze-beats.ts` (lines 110–114) writes one file: the JSON sidecar. It does not call `writeFile` to generate a `src/utils/beats.ts` module with the helper functions a developer would need. The `next_steps` response (line 133) tells Claude to use beat frame values, but no mechanism exists to make that practical.

2. **No beat-aware animation primitives.** `computeEntrance` in `animations.ts` (lines 53–58) accepts a fixed `delay` offset — not a beat-aligned landing frame. There is no `enterOnBeat()` function, no `beatPulse()` calculator, and no `isOnBeat()` helper anywhere in the codebase. Building beat-responsive animation requires reimplementing these from scratch per project.

3. **No beat-responsive template component.** The template library (`src/templates/components/`) has no `BeatPulse` or `BeatEnergy` component. The most common visual need for beat-synced video — a radial glow or flash on each downbeat — must be authored from scratch every time. `KineticTypography` shows the correct pattern (`audioWords` prop for timestamp sync) but this design was never extended to beat data or to other templates.

## Proposed Fix

### Fix 1 — Auto-generate `src/utils/beats.ts` after `analyze_beats` runs

Modify `src/tools/analyze-beats.ts` (after line 114, alongside the JSON sidecar write) to also write a TypeScript utility module into the user's Remotion project at `src/utils/beats.ts`. The generated file should export:

- `BPM: number` — detected BPM constant
- `BEAT_INTERVAL_FRAMES: number` — frames per beat at the project's FPS (`Math.round((60 / BPM) * fps)`)
- `BEAT_INTERVAL_MS: number` — milliseconds per beat
- `beats: Array<{ time: number; frame: number }>` — imported from the JSON sidecar
- `snapToBeat(beatNumber: number): number` — returns the frame number for the Nth beat (0-indexed)
- `isOnBeat(frame: number, tolerance?: number): boolean` — true when frame is within `tolerance` frames of any beat
- `beatPulse(frame: number, intensity?: number): number` — returns `1.0 + intensity * decayFactor` where decayFactor is 1.0 at a beat and 0.0 by the next beat. Drives scale/glow pulse.
- `nearestBeat(frame: number): { beatNumber: number; frame: number; distance: number }` — finds the closest beat entry
- `beatEnergy(frame: number): number` — returns 0–1 value based on proximity to the nearest beat (1.0 on beat, decays to 0.0 over the beat interval)

If `analyze_beats` is run again on a new file, the existing `src/utils/beats.ts` should be overwritten.

### Fix 2 — Add `BeatPulse` to the template component library

Create `src/templates/components/BeatPulse.tsx` — a full-duration overlay component that reads `useCurrentFrame()` and produces beat-reactive visuals. It should accept props:

- `bpm: number` — required
- `fps: number` — required (or read from `useVideoConfig()`)
- `intensity?: number` — pulse strength, default `0.05` (scale 1.0 → 1.05 on beat)
- `color?: string` — glow color, default `'#FFFFFF'`
- `showFlash?: boolean` — white flash overlay, default `true`
- `showLines?: boolean` — accent lines that expand from center on beat, default `false`
- `glowRadius?: number` — radial glow size in px, default `300`

The component should be:
1. Added to `src/templates/components/BeatPulse.tsx` in the MCP server's template library
2. Copied into user projects via `copyTemplates` (`file-ops.ts:74–97`)
3. Listed in the `list_templates` tool response so Claude knows it exists

This component should be usable both as a scene-level element and as a global overlay registered via `add_overlay`.

### Fix 3 — Add `beatFrame` support to entrance presets

Extend `computeEntrance` in `src/templates/utils/animations.ts` (line 53) to accept an optional fifth parameter: `beatFrame?: number`. When provided, the animation timing is adjusted so the element reaches its final position at `beatFrame` rather than at frame 0. Implementation: calculate `animationStartFrame = beatFrame - estimatedAnimationDuration` (default 20 frames) and pass `Math.max(0, frame - animationStartFrame)` as `effectiveFrame`.

Add an exported `enterOnBeat` wrapper function:

```typescript
export function enterOnBeat(
  preset: EntrancePreset,
  frame: number,
  fps: number,
  beatFrame: number,
  entranceDurationFrames?: number, // default 20
): EntranceValues
```

### Fix 4 — Add `beatFrame` and `beatSync` props to templates

Templates that already accept `entrancePreset` should also accept:

- `beatFrame?: number` — when set, passes through to `enterOnBeat()` so the entrance lands on the given beat frame. Templates: `TitleCard` (props line 6–17), `TextScene` (props line 6–18), `ImageScene` (props line 6–18), `TextWithImage` (props line 6–17).
- `beatSync?: { bpm: number; staggerBeats?: number }` — for `TextScene` bullet lists, auto-stagger bullets across consecutive beats rather than using the hardcoded 8-frame interval at `TextScene.tsx:111`.

## Related

- Files: `src/tools/analyze-beats.ts`, `src/utils/beat-analysis.ts`, `src/templates/utils/animations.ts`, `src/templates/components/TitleCard.tsx`, `src/templates/components/TextScene.tsx`, `src/templates/components/ImageScene.tsx`, `src/templates/components/TextWithImage.tsx`, `src/templates/components/KineticTypography.tsx`, `src/utils/file-ops.ts`
- Related issues: `docs/issues/2026-03-02-animation-presets-and-template-docs.md` — covers missing documentation for existing preset system

---

## Resolution

**Resolved in:** Phase 8 (beat analysis v2 + BeatSync rewrite)
**Resolved on:** 2026-04-23

The three root-cause gaps identified in this issue were addressed by taking a fundamentally different approach in Phase 8 rather than patching the original v1 system:

**1. No utility scaffolding** — The original proposed fix was to write a `src/utils/beats.ts` module into the user project with helper functions. Phase 8 superseded this with the `BeatSync` primitive and `useBeat` hook, which are already present in every user project (copied at `init_project` via `copyPrimitives()`). Claude doesn't need to scaffold anything — the tools are already there.

**2. No beat-aware animation primitives** — `useBeat({ tier, every, tolerance, decayFrames })` at `src/primitives/BeatSync.tsx:321` provides a tier-aware API that replaces the proposed `enterOnBeat()` function. The hook returns `pulse` (0..1 decay value), `isOnBeat`, `isDownbeat`, `barIndex`, `framesSinceLast`, and `framesUntilNext` — sufficient to drive any beat-synchronized animation without manual frame math. Claude writes `componentCode` using these hooks directly.

**3. No beat-responsive template component** — The proposed `BeatPulse.tsx` template was not shipped. Instead, the composable primitives approach makes templates obsolete: Claude writes `componentCode` using `BeatSync` + `useBeat` + other primitives (`AnimatedText`, `Background`, `Glow`, etc.) rather than selecting pre-built templates. This is strictly more flexible.

**BeatDataV2 schema** (`src/utils/beat-analysis.ts:42–87`): The v1 flat `beats[]` array was replaced with a rich schema including `isDownbeat`, `beatNumber`, `barNumber`, `confidence`, `bassEnergy` per beat, plus `downbeatFrames[]` and phrase ranges (`bar`, `fourBar`, `eightBar`, `sixteenBar`).

**Quality verdicts** (`src/tools/analyze-beats.ts:121–130`): The tool now surfaces a `high/medium/low` quality verdict based on avgConfidence and beatGapStdDev, so Claude can warn the user when beat detection is unreliable.

For the full current system, see `docs/feature_flow/beat-detection-flow.md` and `docs/research/audio-driven-video-transitions.md`.
