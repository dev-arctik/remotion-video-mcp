# Flow: Beat Detection System (v2)

**Last Updated:** 2026-04-23
**Status:** Active
**Type:** End-to-End Flow

---

## Overview

The beat detection system lets Claude create music-driven videos where scene cuts and element entrances land on exact beat boundaries. It has two parts:

1. **`analyze_beats` MCP tool** — server-side analysis. Detects BPM, beat positions, downbeats, phrase structure, and per-beat confidence. Writes a sidecar JSON file. Returns a compact summary for Claude to use in `create_scene` calls.

2. **`BeatSync` primitive + `useBeat` hook** — client-side reactivity. A React context provider that gives any Remotion component tier-aware beat pulse data at every frame during preview and render.

This is **v2** of the system. The original v1 (planned in `docs/planning/beat-detection-and-audio-sync.md`) used `music-tempo` alone and returned only `bpm` + a flat `beats[]` array. Phase 8 rewrote the entire system: downbeat detection, phrase ranges, per-beat confidence, and a tier-aware hook API. The v1 data schema is still accepted by `BeatSync` for backward compatibility.

For background on why v1 was insufficient and the research behind the approach, see `docs/research/audio-driven-video-transitions.md`.

---

## System Architecture

```
Part 1 — Server-side analysis (MCP server, Node.js)
───────────────────────────────────────────────────

User imports audio via import_asset
    │  user says "background music"
    ▼
analyze_beats({ projectPath, audioFile })
    │
    ├── validateProjectPath()
    ├── validate extension (.mp3/.wav/.aac/.ogg/.m4a)
    ├── check file exists at assets/audio/<audioFile>
    ├── 50MB size guard
    ├── readComposition() → settings.fps
    └── analyzeBeats(audioPath, fps, bpmRange?)
         │   src/utils/beat-analysis.ts
         │
         ├── 1. decodeAudio(fileBuffer) → mono Float32Array + sampleRate
         │       AudioContext from web-audio-api + stereo-to-mono averaging
         │
         ├── 2. MusicTempo(pcm, params) → bpm + beatTimes[]
         │       Beatroot algorithm — works on 4/4 pop/EDM/rock
         │
         ├── 3. bassEnergyAt(pcm, sampleRate, time) per beat
         │       50ms RMS window around each beat — kick drum dominated
         │
         ├── 4. detectDownbeatPhase(bassEnergies)
         │       Score 4 candidate phases (0/1/2/3) by avg bass energy
         │       Phase with highest avg = most likely kick = downbeat
         │
         ├── 5. computeConfidences(beatTimes, idealInterval)
         │       Per-beat gap consistency → 0..1 confidence score
         │
         ├── 6. Build BeatV2[] — beatNumber/barNumber/isDownbeat/confidence/bassEnergy
         │
         ├── 7. buildPhrases(beats, beatsPerPhrase)
         │       bar (4 beats), fourBar (16), eightBar (32), sixteenBar (64)
         │
         └── 8. Return BeatDataV2

    → write sidecar JSON: assets/audio/<name>-beats.json
    → return compact summary (tiers, quality verdict, suggestedSceneDurations)


Part 2 — Client-side reactivity (Remotion project, browser/headless)
──────────────────────────────────────────────────────────────────────

<BeatSync data={beatData}>   src/primitives/BeatSync.tsx
    │
    ├── normalize(data, fps) — accepts v1 OR v2 schema
    │     v2: use as-is
    │     v1: synthesize downbeatFrames (every 4th), synthesize BeatV2 shape
    │
    └── BeatContext.Provider({ normalized })
          │
          └── children call: useBeat({ tier, every, tolerance, decayFrames })
                │
                ├── selectTierFrames(normalized, tier) → number[]
                │     'beat'      → beatFrames
                │     'downbeat'  → downbeatFrames
                │     'phrase-1'  → downbeatFrames
                │     'phrase-4'  → phrases.fourBar[].startFrame
                │     'phrase-8'  → phrases.eightBar[].startFrame
                │     'phrase-16' → phrases.sixteenBar[].startFrame
                │
                └── return UseBeatResult { pulse, isOnBeat, isDownbeat, barIndex,
                                           framesSinceLast, framesUntilNext, confidence }
```

---

## BeatDataV2 Schema

Written to `assets/audio/<name>-beats.json` and also returned inline in the `analyze_beats` response (truncated to 8 beats preview; full data is in the sidecar).

**Defined in:** `src/utils/beat-analysis.ts:14–87`

```typescript
interface BeatDataV2 {
  schemaVersion: 2;
  bpm: number;
  beatCount: number;
  beatIntervalMs: number;
  durationSeconds: number;
  fps: number;

  beats: BeatV2[];          // Full array with downbeat + confidence per beat
  beatFrames: number[];     // Flat array — frame index per beat
  downbeatFrames: number[]; // Frame index of each bar's beat 1 only

  phrases: {
    bar: PhraseRange[];        // every 4 beats (1 bar)
    fourBar: PhraseRange[];    // every 16 beats
    eightBar: PhraseRange[];   // every 32 beats
    sixteenBar: PhraseRange[]; // every 64 beats
  };

  suggestedSceneDurations: {
    '4-beat':  { frames: number; seconds: number };
    '8-beat':  { frames: number; seconds: number };
    '16-beat': { frames: number; seconds: number };
  };

  stats: {
    avgConfidence: number;    // 0..1 — overall detection quality
    minBeatGap: number;
    maxBeatGap: number;
    beatGapStdDev: number;    // high = tempo drift / rubato
    downbeatPhase: number;    // offset (0..3) of the detected kick phase
    downbeatStrength: number; // >1.15 = reliable, ≤1 = weak/uncertain
  };
}

interface BeatV2 {
  time: number;        // seconds from start
  frame: number;       // Remotion frame number
  beatNumber: number;  // 1..4 within the bar
  barNumber: number;   // 0-indexed bar
  isDownbeat: boolean; // true when beatNumber === 1
  confidence: number;  // 0..1 interval consistency score
  bassEnergy: number;  // 0..1 RMS at this beat — exposed for visual effects
}
```

---

## analyze_beats Tool Response

The tool returns a compact summary rather than the full beat array (which can be 30k+ tokens for a long track). Claude reads the sidecar JSON if it needs individual beat frames.

**File:** `src/tools/analyze-beats.ts`

Key fields in the response:

```json
{
  "status": "success",
  "schemaVersion": 2,
  "bpm": 128,
  "beatCount": 261,
  "durationSeconds": 122.3,
  "fps": 30,
  "tiers": {
    "beats": 261,
    "downbeats": 65,
    "bars": 65,
    "fourBarPhrases": 16,
    "eightBarPhrases": 8,
    "sixteenBarPhrases": 4
  },
  "quality": {
    "verdict": "high",
    "avgConfidence": 0.91,
    "tempoStability": "stable",
    "downbeatDetection": "strong",
    "downbeatStrength": 1.42
  },
  "suggestedSceneDurations": {
    "4-beat":  { "frames": 56,  "seconds": 1.875 },
    "8-beat":  { "frames": 113, "seconds": 3.75 },
    "16-beat": { "frames": 225, "seconds": 7.5 }
  },
  "beatsPreview": [ ...first 8 BeatV2 objects... ],
  "beatsJsonPath": "assets/audio/my-track-beats.json"
}
```

**Quality verdict logic** (`src/tools/analyze-beats.ts:121–130`):

| Verdict | Condition |
|---------|-----------|
| `"high"` | avgConfidence >= 0.8 AND beatGapStdDev < 0.03 |
| `"medium"` | avgConfidence >= 0.6 AND (stable OR stdDev < 0.06) |
| `"low"` | anything else — Claude should warn user and suggest manual duration overrides |

---

## BeatSync Primitive and useBeat Hook

**File:** `src/primitives/BeatSync.tsx` (in MCP server; copied to user projects at `init_project`)

### BeatSync Provider

```tsx
import beatData from './assets/audio/my-track-beats.json';

<BeatSync data={beatData}>
  <MyScene />
</BeatSync>
```

Props: `data` (v2 preferred) or `beats` (legacy alias), `fps` hint for v1 data, optional `pulseScale` for wrapper-level scaling.

### useBeat Hook

```typescript
const { pulse, isOnBeat, isDownbeat, barIndex, confidence } = useBeat({
  tier: 'downbeat',   // 'beat' | 'downbeat' | 'phrase-1' | 'phrase-4' | 'phrase-8' | 'phrase-16'
  every: 1,           // select every Nth beat in the tier
  offset: 0,          // skip the first N beats
  tolerance: 1,       // frames considered "on the beat" (default 1)
  decayFrames: 8,     // pulse decay time (default 8 frames)
});
```

**Tier selection** (`src/primitives/BeatSync.tsx:281–315`):

| Tier | Frame source |
|------|-------------|
| `'beat'` | `beatFrames` — every detected beat |
| `'downbeat'` / `'phrase-1'` | `downbeatFrames` — bar 1 of each bar |
| `'phrase-4'` | `phrases.fourBar[].startFrame` (fallback: every 16th beat) |
| `'phrase-8'` | `phrases.eightBar[].startFrame` (fallback: every 32nd beat) |
| `'phrase-16'` | `phrases.sixteenBar[].startFrame` (fallback: every 64th beat) |

### UseBeatResult Fields

| Field | Type | Description |
|-------|------|-------------|
| `pulse` | `number 0..1` | 1 at the beat, decays linearly over `decayFrames` |
| `isOnBeat` | `boolean` | true within ±tolerance of a tier beat |
| `isDownbeat` | `boolean` | true if the current beat (any tier) is a bar downbeat |
| `barIndex` | `number` | 0-indexed bar number |
| `framesSinceLast` | `number` | frames since last tier beat (Infinity before first) |
| `framesUntilNext` | `number` | frames until next tier beat |
| `bpm` | `number` | detected BPM |
| `confidence` | `number 0..1` | confidence of the most recent beat |

### useBeatGrid

```typescript
const grid = useBeatGrid();
// Returns full NormalizedBeats object — beatFrames[], downbeatFrames[], phrases, etc.
// For power users driving Stagger delays from beat positions.
```

---

## Backward Compatibility

`BeatSync` accepts the v1 schema (`{ bpm, beats: number[] | { frame }[] }`) and synthesizes the missing v2 fields:
- `downbeatFrames`: every 4th beat from index 0
- `confidence`: 0.7 for all beats (conservative fallback)
- `phrases`: empty (phrase tiers fall back to filtering beatFrames)

The `BeatData` type alias (`src/utils/beat-analysis.ts:344`) is `= BeatDataV2` — old code importing `BeatData` still type-checks.

---

## Example Usage in componentCode

```tsx
// Inside a scene written with write_file or create_scene componentCode:
import React from 'react';
import { AbsoluteFill, staticFile } from 'remotion';
import { BeatSync, useBeat } from '../src/primitives/BeatSync';
import beatData from '../assets/audio/my-track-beats.json';

const TitlePulse: React.FC = () => {
  const { pulse, isDownbeat } = useBeat({ tier: 'downbeat', decayFrames: 6 });
  const scale = 1 + pulse * 0.08;
  const glow = isDownbeat ? '0 0 40px rgba(255,200,0,0.8)' : 'none';
  return (
    <div style={{ transform: `scale(${scale})`, textShadow: glow }}>
      Beat-Synced Title
    </div>
  );
};

export const Scene001: React.FC = () => (
  <AbsoluteFill>
    <BeatSync data={beatData}>
      <TitlePulse />
    </BeatSync>
  </AbsoluteFill>
);
```

---

## Sidecar JSON Location

```
{project}/assets/audio/<audioName>-beats.json
```

NOT stored in `composition.json`. Claude reads it conversationally to choose `durationFrames` for `create_scene` calls. It is also referenced via `staticFile()` in `componentCode` for client-side reactivity.

---

## How Claude Uses Beat Data

After `analyze_beats` returns:

1. **Scene durations** — use `suggestedSceneDurations['8-beat'].frames` as `durationFrames` for standard scenes; use `'4-beat'` for high-energy cuts; use `'16-beat'` for slow cinematic scenes.
2. **Major scene boundaries** — use `downbeatFrames` to align the first frame of a new scene with a bar downbeat. The difference between consecutive downbeat frames is exactly the 8-beat phrase duration.
3. **Element entrances** — use individual `beats[N].frame` values as the target landing frame for element entrances inside a scene.
4. **Quality gate** — if verdict is `"low"`, warn the user and suggest manual duration inputs instead of trusting phrase boundaries.

---

## Dependencies

| Package | Role |
|---------|------|
| `music-tempo` | Beatroot algorithm — BPM detection + beat positions |
| `web-audio-api` | Node.js AudioContext polyfill — decodes audio to PCM |

Both are imported via TypeScript stubs in `src/types/` (`music-tempo.d.ts`, `web-audio-api.d.ts`) since they ship no `.d.ts` files.

---

## Related Docs

- `docs/research/audio-driven-video-transitions.md` — research behind downbeat detection approach and future upgrade path (Beat This! ONNX)
- `docs/feature_flow/import-asset-flow.md` — how audio files get into the project before analysis
- `docs/feature_flow/audio-event-detection-and-reactivity-flow.md` — the complementary `analyze_audio` tool for dramatic event detection (bass drops, impacts)
- `docs/issues/2026-03-02-beat-animation-integration-gap.md` — original issue (now resolved)
