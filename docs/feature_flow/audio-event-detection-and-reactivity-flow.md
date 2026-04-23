# Flow: Audio Event Detection and AudioReactive Primitive

**Last Updated:** 2026-04-23
**Status:** Active
**Type:** End-to-End Flow

---

## Overview

The audio event detection system has two independent but complementary parts:

1. **`analyze_audio` MCP tool** — server-side frequency analysis. Identifies named dramatic events (bass drops, impacts, swooshes, silence breaks, energy shifts) and returns frame-numbered scene cut points. Also includes backward-compatible beat data from `analyze_beats`.

2. **`AudioReactive` primitive** — client-side React context provider. Gives Remotion components real-time frequency band data (bass, mids, highs, ratios, event flags) at every frame during preview and render. Uses Remotion's own `@remotion/media-utils` APIs — same path taken by Remotion Studio and the render pipeline.

These two parts are independent. Claude can use just the server-side analysis for planning scene cuts, just `AudioReactive` for visual frequency effects, or both together.

**Phase 8 note:** The `AudioReactive` primitive shipped in this phase with a significant bug fix. The original `isDropping` detection (`bassIntensity > 0.15`) fired constantly on any compressed music track. It was replaced with ratio-based detection requiring bass to be both loud AND dominant, renamed to `isBassHit`. The old field is kept as a deprecated alias for backward compatibility.

---

## Part 1 — analyze_audio Tool

**File:** `src/tools/analyze-audio.ts`
**Utility:** `src/utils/audio-analysis.ts`

### Architecture

```
Claude calls analyze_audio({ projectPath, audioFile, sensitivity? })
    │
    ├── validateProjectPath()                    src/utils/file-ops.ts:12
    ├── validate extension (mp3/wav/aac/ogg/m4a)
    ├── verify file at assets/audio/<audioFile>
    ├── 50MB size guard
    ├── readComposition() → settings.fps
    └── analyzeAudio(audioPath, fps, sensitivity?)
         │   src/utils/audio-analysis.ts
         │
         ├── decodeAudio() → mono Float32Array + sampleRate
         ├── computePerFrameFFT() → per-frame band energies
         ├── detectEvents(bands, deltas, sensitivity)
         │     bass-drop:      bass delta > bassThreshold
         │     impact:         all-band spike simultaneously
         │     build-start:    rising RMS over >= 30 frames
         │     build-peak:     RMS starts declining after a build
         │     transient:      high-freq spike + fast decay
         │     silence-break:  RMS → 0 then returns
         │     energy-shift:   large adjacent RMS delta (catch-all)
         ├── deriveCutPoints(events) → suggestedSceneCuts[]
         └── detectBPM() → bpm + beats[] (Beatroot, back-compat)

    → write sidecar: assets/audio/<name>-analysis.json
    → return AudioAnalysisResult to Claude (compact — events + cuts + beat summary)
```

### AudioEvent Interface

Each detected event in the response:

```typescript
interface AudioEvent {
  type: 'bass-drop' | 'impact' | 'build-start' | 'build-peak' |
        'transient' | 'silence-break' | 'energy-shift';
  frame: number;       // Remotion frame number
  time: number;        // seconds from start
  intensity: number;   // 0..1 relative strength
  description: string; // e.g. "Major bass drop at 3.0s"
}
```

### Response Shape (abbreviated)

```json
{
  "status": "success",
  "audioFile": "trailer-music.mp3",
  "analysisJsonPath": "assets/audio/trailer-music-analysis.json",
  "duration": { "seconds": 45.2, "frames": 1356 },
  "events": [
    { "type": "bass-drop", "frame": 90,  "time": 3.0,  "intensity": 0.92 },
    { "type": "build-start","frame": 45, "time": 1.5,  "intensity": 0.60 },
    { "type": "transient",  "frame": 300,"time": 10.0, "intensity": 0.78 },
    { "type": "silence-break","frame": 201,"time": 6.7,"intensity": 1.0 }
  ],
  "suggestedSceneCuts": [
    { "frame": 0,   "reason": "Start" },
    { "frame": 90,  "reason": "Bass drop — strong visual transition point" },
    { "frame": 201, "reason": "Silence break — dramatic scene change" },
    { "frame": 450, "reason": "Peak energy — climax scene" }
  ],
  "bpm": 128,
  "suggestedSceneDurations": {
    "4-beat":  { "frames": 56,  "seconds": 1.875 },
    "8-beat":  { "frames": 113, "seconds": 3.75 },
    "16-beat": { "frames": 225, "seconds": 7.5 }
  }
}
```

The sidecar JSON at `assets/audio/<name>-analysis.json` stores the full per-frame frequency profile and all events. The inline response is kept compact to avoid token overflow.

### Sensitivity Parameters

Optional `sensitivity` object to tune detection per track:

| Parameter | Default | Tunes |
|-----------|---------|-------|
| `bassThreshold` | 0.35 | Bass energy delta to trigger `bass-drop` |
| `transientThreshold` | 0.40 | High-freq delta to trigger `transient` |
| `silenceThreshold` | 0.02 | RMS floor for silence detection |

---

## Part 2 — AudioReactive Primitive

**File:** `src/primitives/AudioReactive.tsx` (in MCP server; copied to user projects at `init_project`)

### Architecture

```
<AudioReactive src={staticFile('audio/track.mp3')}>
    │
    ├── useWindowedAudioData({ src, frame, fps, windowInSeconds: 30 })
    │     @remotion/media-utils — loads audio in 30-second windows
    │     returns { audioData, dataOffsetInSeconds }
    │
    ├── visualizeAudio({ fps, frame, audioData, numberOfSamples: 128,
    │                   dataOffsetInSeconds, optimizeFor: 'speed' })
    │     returns Float32Array[128] — bin 0 = bass, bin 127 = highs
    │
    ├── Split bins into frequency bands:
    │     bins 0..31   → bassIntensity   (avg of low 25%)
    │     bins 32..95  → midIntensity    (avg of middle 50%)
    │     bins 96..127 → highIntensity   (avg of top 25%)
    │     bins 0..127  → overallEnergy   (avg of all)
    │
    ├── Compute ratios (guarded against /0 with epsilon 1e-6):
    │     bassRatio  = bass / (mid + high)
    │     midRatio   = mid  / (bass + high)
    │     highRatio  = high / (bass + mid)
    │
    ├── Event detection (Phase 8 — ratio-based, fixes constant-fire bug):
    │     isBassHit: bass >= bassHitThreshold(0.45) AND bass >= mid * 1.3 AND bass >= high * 1.3
    │     isHighHit: high >= highHitThreshold(0.50) AND high >= bass
    │     isPeak:    overallEnergy >= peakThreshold(0.55)
    │     isSilent:  overallEnergy < silenceThreshold(0.02)
    │
    └── AudioReactiveContext.Provider → children read via useAudioReactive()
```

### AudioReactiveContextValue

```typescript
interface AudioReactiveContextValue {
  bassIntensity: number;   // 0..1
  midIntensity: number;    // 0..1
  highIntensity: number;   // 0..1
  overallEnergy: number;   // 0..1

  bassRatio: number;       // bass / (mid + high)
  midRatio: number;        // mid / (bass + high)
  highRatio: number;       // high / (bass + mid)

  isBassHit: boolean;      // bass is loud AND dominant — true kick/drop
  isHighHit: boolean;      // highs spike (cymbal, swoosh)
  isPeak: boolean;         // overall energy above threshold (loud moment)
  isSilent: boolean;       // near-silence

  isDropping: boolean;     // deprecated alias for isBassHit
  isLoaded: boolean;       // false while audio data loads
}
```

### Configurable Thresholds

All detection thresholds are props on `<AudioReactive>`, allowing per-track tuning:

```tsx
<AudioReactive
  src={staticFile('audio/ambient-track.mp3')}
  bassHitThreshold={0.3}      // lower for quiet ambient tracks
  bassDominanceRatio={1.2}
  highHitThreshold={0.40}
  peakThreshold={0.45}
  silenceThreshold={0.01}
>
  {children}
</AudioReactive>
```

### Phase 8 Bug Fix: isBassHit Replaces isDropping

The original implementation (`isDropping: bassIntensity > 0.15`) was measuring bass presence, not a bass event. Compressed modern music has bass energy above 0.15 at nearly all times, so the flag was permanently true. The fix requires three conditions simultaneously:

```typescript
// src/primitives/AudioReactive.tsx:152–155
const isBassHit =
  bassIntensity >= bassHitThreshold &&          // bass must be loud
  bassIntensity >= midIntensity * bassDominanceRatio &&   // AND dominate mids
  bassIntensity >= highIntensity * bassDominanceRatio;    // AND dominate highs
```

`isDropping` is kept as a deprecated alias (`isDropping: isBassHit`) so old code does not break.

---

## Using AudioReactive in componentCode

```tsx
import React from 'react';
import { AbsoluteFill, staticFile } from 'remotion';
import { AudioReactive, useAudioReactive } from '../src/primitives/AudioReactive';

const ReactiveTitle: React.FC = () => {
  const { bassIntensity, isBassHit, highIntensity, isSilent } = useAudioReactive();

  // Scale up on bass hit, fade during silence
  const scale = 1 + bassIntensity * 0.2;
  const opacity = isSilent ? 0.3 : 1;
  const glow = isBassHit ? `0 0 ${bassIntensity * 60}px rgba(255,100,0,0.9)` : 'none';

  return (
    <div style={{
      transform: `scale(${scale})`,
      opacity,
      textShadow: glow,
      fontSize: 80,
      color: '#FFFFFF',
    }}>
      Reactive Title
    </div>
  );
};

export const Scene001: React.FC = () => (
  <AbsoluteFill>
    <AudioReactive src={staticFile('audio/my-track.mp3')}>
      <ReactiveTitle />
    </AudioReactive>
  </AbsoluteFill>
);
```

`useAudioReactive()` must be called inside a component that is a descendant of `<AudioReactive>`. Calling it outside returns the default context (all zeros, all false).

---

## How Claude Uses Event Detection

After `analyze_audio` returns:

1. **Scene cuts** — use `suggestedSceneCuts[].frame` as the start frame boundaries for `create_scene` calls. Each entry has a `reason` explaining the signal.
2. **Dramatic reveals** — use `bass-drop` events to trigger scene-level entrances (set `durationFrames` to start just before the drop frame).
3. **Title cards** — use `silence-break` events to start text appearing right as audio returns from a pause.
4. **Build sequences** — use `build-start` to `build-peak` frame range as a scene duration for escalating visual intensity.
5. **Live reactivity** — pair event analysis with `AudioReactive` in `componentCode`: the server analysis tells Claude WHICH moments to visualize; the primitive provides the LIVE signal.

---

## Compact Response Policy

The `analyze_audio` response deliberately returns a compact summary rather than the full per-frame FFT array. Early versions of the tool returned 30k+ tokens. Now:

- Inline response: named events + cut points + beat summary + frequency profile summary
- Full data: sidecar JSON at `assets/audio/<name>-analysis.json`

Claude reads the sidecar directly when it needs specific frame numbers not surfaced in the compact summary.

---

## Error Scenarios

| Condition | Error message |
|-----------|--------------|
| File not found | `"Audio file not found: assets/audio/X"` |
| Unsupported extension | `"Invalid audio file extension '.xyz'..."` |
| File > 50MB | `"Audio file is NNmb — exceeds the 50MB limit for analysis."` |
| Decode failure | `"Failed to decode audio: <reason>"` |
| No events detected | `"No audio events detected..."` |

---

## Related Docs

- `docs/feature_flow/beat-detection-flow.md` — rhythm-aligned beat detection (BPM, phrases, `BeatSync` + `useBeat`)
- `docs/feature_flow/import-asset-flow.md` — how audio files get into the project
- `docs/research/audio-driven-video-transitions.md` — research behind frequency analysis approach
- `src/primitives/AudioReactive.tsx` — full component source
- `src/utils/audio-analysis.ts` — server-side frequency analysis utility
