# Feature: Audio Event Detection & Real-Time Audio Reactivity

**Version:** v1.0
**Status:** Draft
**Type:** Feature Spec
**Created:** 2026-03-26
**Last Modified:** 2026-03-26

---

## Problem Statement

The current beat analysis system (`analyze_beats` tool + `music-tempo` library) has three fundamental limitations that make it unsuitable for the video types users actually want to create.

**Limitation 1 — Rhythm-only detection misses dramatic moments.** `music-tempo` implements the Beatroot algorithm. It detects periodic pulse (BPM) and evenly-spaced beat positions in 4/4 time signatures. This works for EDM and pop, but entirely misses the moments that define visually compelling video: the bass drop at 0:08 in a trailer, the orchestral impact at a reveal, the swoosh before a title card, the silence before a climax. These events are not on evenly-spaced beats — they are irregular energy events that require amplitude and frequency analysis to detect.

**Limitation 2 — Static JSON data, no real-time reactivity.** Beat data is written to a sidecar JSON file and read by Claude during conversation. The Remotion components themselves have no awareness of audio energy during playback. The `BeatSync` primitive (`src/primitives/BeatSync.tsx:46`) reads pre-computed frame numbers and produces a binary "on beat / off beat" signal. This is fundamentally different from an element that actually responds to the live audio signal — expanding to bass frequency energy, brightening on high-frequency transients, dimming during silence.

**Limitation 3 — CJS polyfill brittleness.** `web-audio-api` is a Node.js polyfill of the browser's `AudioContext` API, published as a CommonJS package in 2014 (v0.2.2, last updated 2019). It works for WAV but fails silently or throws opaque errors on many MP3s. `music-tempo` is similarly aged (last publish: 2019). Both are imported via hand-written `declare module` stubs in `src/types/` because they ship no TypeScript types. These packages are technical debt at the core of the audio analysis pipeline.

**Connection to existing issue:** `docs/issues/2026-03-02-beat-animation-integration-gap.md` identified that `analyze_beats` produces data with no consumption path — the proposed fix there (scaffolding `beats.ts` utilities) is superseded by this feature. This feature replaces the entire approach rather than patching it.

---

## Goals & Success Criteria

- Claude can identify the exact frame of a bass drop in a trailer soundtrack and use it as a scene cut point
- Claude can identify a silence-break (dramatic pause) and begin a scene or element entrance on the frame the audio returns
- The `AudioReactive` primitive gives Remotion components live access to bass, mid, and high frequency energy at every frame — without pre-computed data
- `AudioReactive` works correctly in both Remotion Studio preview AND during `render_video` — it must use Remotion's own audio APIs, not any custom sampling
- Replacing `analyze_beats` → `analyze_audio` is backward-compatible at the MCP protocol level: same inputs, richer outputs
- `npm run build` compiles clean after all changes
- No new native binaries, no FFmpeg dependency on the user's system

**Definition of done:**

- [ ] `src/utils/audio-analysis.ts` replaces `src/utils/beat-analysis.ts`
- [ ] `src/tools/analyze-audio.ts` replaces `src/tools/analyze-beats.ts`
- [ ] `src/primitives/AudioReactive.tsx` replaces `src/primitives/BeatSync.tsx`
- [ ] `src/primitives/index.ts` exports updated
- [ ] `src/server.ts` registers `analyze_audio`, unregisters `analyze_beats`
- [ ] `package.json` dependencies updated (add `meyda`, remove `music-tempo` and `web-audio-api`)
- [ ] `src/types/` stubs updated (add `meyda.d.ts`, remove old stubs)
- [ ] `CLAUDE.md` updated to document the new audio analysis system
- [ ] TypeScript builds clean

---

## Requirements

### Functional Requirements

- **FR-001:** `analyze_audio` accepts `projectPath`, `audioFile` (filename in `assets/audio/`), and an optional `sensitivity` object `{ bassThreshold, transientThreshold, silenceThreshold }` — all defaulting to sensible values
- **FR-002:** `analyze_audio` reads `composition.json` to get `settings.fps` — same pattern as `analyze_beats`
- **FR-003:** `analyze_audio` decodes the audio file to PCM data and computes per-frame frequency band energies (bass, mids, highs, air) using FFT windowed at the video frame rate
- **FR-004:** `analyze_audio` detects named audio events (`bass-drop`, `impact`, `build-start`, `build-peak`, `transient`, `silence-break`, `energy-shift`) from frame-over-frame deltas in band energy
- **FR-005:** `analyze_audio` returns `events[]` (each with `type`, `frame`, `time`, `intensity`, `description`) and `suggestedSceneCuts[]` (cut points derived from high-significance events)
- **FR-006:** `analyze_audio` returns backward-compatible beat data (`bpm`, `beats[]`, `suggestedSceneDurations`) so Claude can still use beat-aligned scene durations alongside event data
- **FR-007:** `analyze_audio` writes a sidecar JSON at `assets/audio/<name>-analysis.json` (replaces `<name>-beats.json`)
- **FR-008:** `AudioReactive` is a React component that wraps children and provides per-frame audio frequency data via React Context
- **FR-009:** `AudioReactive` uses `useWindowedAudioData()` and `visualizeAudio()` from `@remotion/media-utils` — the same APIs used by Remotion Studio and the render pipeline
- **FR-010:** `useAudioReactive()` hook exposes `bassIntensity`, `midIntensity`, `highIntensity`, `overallEnergy`, `isDropping`, `isSilent` — all values normalized to `[0, 1]`
- **FR-011:** `analyze_beats` tool name remains registered in `server.ts` but as a thin wrapper that calls `analyze_audio` — ensures Claude prompts that reference `analyze_beats` still work during transition period

### Non-Functional Requirements

- Frequency analysis must complete within 30 seconds for a typical 90-second music file (3MB MP3)
- The `AudioReactive` context hook must not cause re-renders outside of the Remotion frame loop — it reads from stable per-frame data, not from event listeners
- The sidecar JSON file must not grow unbounded — only store the detected events and cut points, not the raw per-frame FFT arrays
- Error handling follows the project pattern: every error returns `{ status: "error", message: string, suggestion: string }` with distinct messages per failure mode

### Assumptions

- `meyda` (v5+) supports offline Node.js usage via `Meyda.extract()` — verified via Context7 docs (`/meyda/meyda` — the offline-node guide confirms `require('meyda')` usage with signal arrays)
- `@remotion/media-utils` is already in the scaffolded project's `package.json` — confirmed in `CLAUDE.md`; `AudioReactive` can import it directly
- Audio files are always in `assets/audio/` — no change from current tool convention
- `visualizeAudio()` from `@remotion/media-utils` returns a `number[]` where index 0 is bass and the last index is high frequencies — verified via Context7: "left side represents bass and right side represents high frequencies"
- `useWindowedAudioData()` returns `null` while loading — `AudioReactive` renders children immediately but passes zero values until audio data is available, matching the null-guard pattern in Remotion examples

---

## User Stories

| Priority | Story | Acceptance Criteria |
|----------|-------|---------------------|
| Must | As a user creating a product trailer, I want Claude to identify the bass drop in my soundtrack and cut the scene exactly at that frame | `analyze_audio` returns a `bass-drop` event with a precise frame number; Claude uses that frame as a scene boundary |
| Must | As a user, I want visual elements in my video to scale up slightly when bass frequencies peak | `useAudioReactive()` returns `bassIntensity`; child components can `const scale = 1 + bassIntensity * 0.3` |
| Must | As a user with ambient/non-4/4 music, I want audio analysis to still find meaningful cut points | `energy-shift` and `silence-break` events work regardless of time signature |
| Should | As a user, I want to see BPM alongside event data so I can still use beat-aligned durations for regular scenes | `analyze_audio` response includes `bpm` and `suggestedSceneDurations` |
| Should | As a user, I want the audio analysis to work reliably on MP3 files, not just WAV | Replacing `web-audio-api` with `meyda`'s decode path resolves MP3 decode failures |
| Could | As a user, I want to tune sensitivity thresholds for quiet ambient tracks vs loud trailer music | Optional `sensitivity` parameter on `analyze_audio` |

---

## Technical Design

### Architecture Overview

```
Part 1 — Server-side analysis (runs in MCP server, Node.js)
─────────────────────────────────────────────────────────────

Claude (MCP client)
       │
       │  analyze_audio({ projectPath, audioFile })
       ▼
┌──────────────────────────────────────────────────────┐
│  src/tools/analyze-audio.ts                          │
│  ├── validateProjectPath()                           │
│  ├── readComposition() → fps                         │
│  └── analyzeAudio(audioPath, fps, sensitivity)       │
│       │                                              │
│       ▼                                              │
│  src/utils/audio-analysis.ts                         │
│  ├── decodeAudio(buffer) → Float32Array (PCM mono)   │
│  │   └── meyda-based decode OR ffmpeg fallback       │
│  ├── computePerFrameFFT(pcm, sampleRate, fps)        │
│  │   └── windows pcm by frame duration               │
│  │   └── Meyda.extract(['rms','mfcc','spectralFlux'])│
│  │       per window                                  │
│  ├── computeBandEnergies(fftData) → per-frame bands  │
│  ├── computeDeltas(bands) → frame-over-frame rates   │
│  ├── detectEvents(bands, deltas, sensitivity)        │
│  │   ├── bass-drop:     bass delta > threshold       │
│  │   ├── impact:        all-band spike simultaneously│
│  │   ├── build-start:   rising RMS over N frames     │
│  │   ├── build-peak:    RMS starts declining after   │
│  │   │                  a build                      │
│  │   ├── transient:     high-freq spike + fast decay │
│  │   ├── silence-break: RMS → 0 then returns         │
│  │   └── energy-shift:  large adjacent RMS delta     │
│  ├── deriveCutPoints(events) → suggestedSceneCuts[]  │
│  └── detectBPM(pcm) → bpm + beats[] (via Beatroot)  │
│       (kept as secondary output for scene durations) │
│                                                      │
│  → writes assets/audio/<name>-analysis.json          │
│  → returns AudioAnalysisResult to Claude             │
└──────────────────────────────────────────────────────┘

Part 2 — Client-side reactivity (runs inside Remotion, browser/headless)
──────────────────────────────────────────────────────────────────────────

src/primitives/AudioReactive.tsx          (written to user project via copyTemplates)
  │
  ├── useWindowedAudioData({ src, frame, fps, windowInSeconds: 30 })
  │     └── @remotion/media-utils — loads audio in 30-second windows
  │
  ├── visualizeAudio({ fps, frame, audioData, numberOfSamples: 128,
  │                    dataOffsetInSeconds, optimizeFor: 'speed' })
  │     └── returns Float32Array[128] — 0=bass … 127=highs
  │
  ├── computeBands(frequencies)
  │   ├── bassIntensity   = avg(frequencies[0..31])
  │   ├── midIntensity    = avg(frequencies[32..95])
  │   ├── highIntensity   = avg(frequencies[96..127])
  │   └── overallEnergy   = avg(frequencies[0..127])
  │
  ├── isDropping  = bassIntensity > prevBassIntensity + 0.15
  ├── isSilent    = overallEnergy < 0.02
  │
  └── AudioContext.Provider → children read via useAudioReactive()
```

### Component Breakdown

| Component | File | Action | Purpose |
|-----------|------|--------|---------|
| Audio analysis utility | `src/utils/audio-analysis.ts` | **NEW** (replaces `beat-analysis.ts`) | Core FFT + event detection. Exports `analyzeAudio()`, `AudioAnalysisResult` interface |
| analyze_audio tool | `src/tools/analyze-audio.ts` | **NEW** (replaces `analyze-beats.ts`) | MCP tool handler: validate → decode → detect events → write sidecar → return result |
| analyze_beats tool | `src/tools/analyze-beats.ts` | **MODIFY** (thin wrapper) | Proxy to `analyze_audio` for backward compatibility; maps old output shape |
| AudioReactive primitive | `src/primitives/AudioReactive.tsx` | **NEW** (replaces `BeatSync.tsx`) | React Context + `useWindowedAudioData` + `visualizeAudio` → exposes band energies |
| BeatSync primitive | `src/primitives/BeatSync.tsx` | **DEPRECATE** | Mark as deprecated with JSDoc; keep exporting for one release cycle |
| Primitives barrel | `src/primitives/index.ts` | **MODIFY** | Export `AudioReactive`, `useAudioReactive`; deprecate-export `BeatSync` |
| Server registration | `src/server.ts` | **MODIFY** | Import and register `registerAnalyzeAudio`; keep `registerAnalyzeBeats` as wrapper |
| Package dependencies | `package.json` | **MODIFY** | Add `meyda`. Keep `music-tempo` + `web-audio-api` until wrapper is confirmed working |
| Type stubs | `src/types/meyda.d.ts` | **NEW** | Declare module stubs for meyda (check if v5+ ships types — may not be needed) |
| Old type stubs | `src/types/web-audio-api.d.ts`, `src/types/music-tempo.d.ts` | **DELETE** (after wrapper tested) | Remove once `analyze_beats` wrapper no longer needs the old dependencies |

### Data Models

#### `AudioAnalysisResult` — returned by `analyzeAudio()` and written to sidecar JSON

```typescript
// src/utils/audio-analysis.ts

export interface AudioEvent {
  type: 'bass-drop' | 'impact' | 'build-start' | 'build-peak' |
        'transient' | 'silence-break' | 'energy-shift';
  frame: number;       // Remotion frame number
  time: number;        // seconds from start
  intensity: number;   // 0–1 relative strength of this event
  description: string; // human-readable, e.g. "Major bass drop at 3.0s"
}

export interface SceneCutPoint {
  frame: number;
  reason: string; // e.g. "Bass drop — strong visual transition point"
}

export interface AudioAnalysisResult {
  // Frequency profile summary
  frequencyProfile: {
    framesAnalyzed: number;
    bands: ['bass', 'mids', 'highs', 'air'];
    summary: {
      avgBassEnergy: number;
      avgRMS: number;
      peakFrame: number;  // frame with highest overall energy
    };
  };

  // Detected events — the core output
  events: AudioEvent[];

  // Suggested scene boundaries derived from event significance
  suggestedSceneCuts: SceneCutPoint[];

  // Duration metadata
  duration: {
    seconds: number;
    frames: number;
  };

  // Backward-compatible beat data
  bpm: number;
  beatCount: number;
  beatIntervalMs: number;
  beats: Array<{ time: number; frame: number }>;
  suggestedSceneDurations: {
    '4-beat': { frames: number; seconds: number };
    '8-beat': { frames: number; seconds: number };
    '16-beat': { frames: number; seconds: number };
  };
}
```

#### `AudioReactiveContextValue` — React Context shape

```typescript
// src/primitives/AudioReactive.tsx

export interface AudioReactiveContextValue {
  bassIntensity: number;    // 0–1, avg of low frequency bins
  midIntensity: number;     // 0–1, avg of mid frequency bins
  highIntensity: number;    // 0–1, avg of high frequency bins
  overallEnergy: number;    // 0–1, avg of all frequency bins
  isDropping: boolean;      // bassIntensity increased > 0.15 vs previous frame
  isSilent: boolean;        // overallEnergy < 0.02
  isLoaded: boolean;        // false while useWindowedAudioData returns null
}
```

### API Contracts

#### `analyze_audio` — new MCP tool

**Input schema (Zod):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | Absolute path to the Remotion project root |
| `audioFile` | `string` | Yes | Filename in `assets/audio/` (e.g., `trailer-music.mp3`) |
| `sensitivity` | `object` | No | Detection thresholds — all optional with defaults |
| `sensitivity.bassThreshold` | `number` | No | Delta in bass energy to trigger bass-drop (default: `0.35`) |
| `sensitivity.transientThreshold` | `number` | No | High-freq delta to trigger transient (default: `0.40`) |
| `sensitivity.silenceThreshold` | `number` | No | RMS floor for silence detection (default: `0.02`) |

**Success response:**

```json
{
  "status": "success",
  "audioFile": "trailer-music.mp3",
  "analysisJsonPath": "assets/audio/trailer-music-analysis.json",
  "duration": { "seconds": 45.2, "frames": 1356 },
  "frequencyProfile": {
    "framesAnalyzed": 1356,
    "bands": ["bass", "mids", "highs", "air"],
    "summary": { "avgBassEnergy": 0.35, "avgRMS": 0.42, "peakFrame": 450 }
  },
  "events": [
    { "type": "bass-drop", "frame": 90, "time": 3.0, "intensity": 0.92, "description": "Major bass drop" },
    { "type": "build-start", "frame": 45, "time": 1.5, "intensity": 0.60, "description": "Energy build begins" },
    { "type": "transient", "frame": 300, "time": 10.0, "intensity": 0.78, "description": "High-frequency swoosh" },
    { "type": "silence-break", "frame": 201, "time": 6.7, "intensity": 1.0, "description": "Dramatic pause ends" }
  ],
  "suggestedSceneCuts": [
    { "frame": 0, "reason": "Start" },
    { "frame": 90, "reason": "Bass drop — strong visual transition point" },
    { "frame": 201, "reason": "Silence break — dramatic scene change" },
    { "frame": 450, "reason": "Peak energy — climax scene" }
  ],
  "bpm": 128,
  "beatCount": 261,
  "beatIntervalMs": 468.75,
  "beats": [
    { "time": 0.124, "frame": 4 },
    { "time": 0.593, "frame": 18 }
  ],
  "suggestedSceneDurations": {
    "4-beat": { "frames": 56, "seconds": 1.875 },
    "8-beat": { "frames": 113, "seconds": 3.75 },
    "16-beat": { "frames": 225, "seconds": 7.5 }
  },
  "next_steps": "..."
}
```

**Error responses — distinct per failure mode:**

| Condition | `message` | `suggestion` |
|-----------|-----------|--------------|
| File not found | `"Audio file not found: assets/audio/X"` | `"Run import_asset first..."` |
| Unsupported extension | `"Invalid extension '.xyz'"` | `"Use mp3, wav, aac, ogg, or m4a"` |
| File too large | `"File is NNmb — exceeds 50MB limit"` | `"Trim or compress before importing"` |
| Decode failure | `"Failed to decode audio: <reason>"` | `"Try converting to WAV before analysis"` |
| No events detected | `"No audio events detected"` | `"Check sensitivity thresholds or try a more dynamic audio file"` |

#### `AudioReactive` — React component (client-side)

```tsx
// Usage in any Remotion scene component
import { AudioReactive, useAudioReactive } from '../primitives/AudioReactive';
import { staticFile } from 'remotion';

// Option A: wrapper — all children can call useAudioReactive()
<AudioReactive src={staticFile('audio/trailer-music.mp3')}>
  <MyReactiveTitle />
</AudioReactive>

// Option B: hook inside a child
const { bassIntensity, highIntensity, isSilent } = useAudioReactive();
const scale = 1 + bassIntensity * 0.3;
const glow = highIntensity > 0.5 ? `0 0 ${highIntensity * 40}px cyan` : 'none';
```

### Integration Points

**Part 1 → Claude conversation:** `analyze_audio` returns `suggestedSceneCuts[]` that Claude uses to call `create_scene` with event-aligned `durationFrames`. This is conversational — no code coupling between the MCP tool and the scene creation tool.

**Part 2 → Remotion project:** `AudioReactive.tsx` is copied into user projects by `copyTemplates()` (`src/utils/file-ops.ts:74–97`). It becomes a template component like `BeatSync.tsx`. Claude can reference it in `componentCode` when writing scene TSX.

**Parts 1 & 2 together:** The server-side analysis helps Claude plan WHICH events to visualize. The client-side primitive provides the LIVE signal to visualize them with. They are independent — a user can use just the analysis for planning, or just `AudioReactive` for visual effects, or both.

---

## Implementation Plan

### Phase 1 — Dependency Research & Selection

Before writing any code, verify the audio decode path for `meyda` in Node.js:

1. **Install meyda:** `npm install meyda`
2. **Check if meyda ships TypeScript types:** `ls node_modules/meyda/dist/*.d.ts` — if yes, no stub needed. If no, write `src/types/meyda.d.ts`
3. **Verify offline decode path:** Meyda's offline guide uses signal arrays directly (`Meyda.extract(features, signal)`). This means we need a separate audio decode step. Options ranked by reliability:
   - **Option A (recommended):** Use `ffmpeg` via `execa` to decode to raw PCM (WAV stdout), then pass PCM buffers to Meyda. FFmpeg is available in virtually all developer environments and handles every codec reliably. The MCP server already uses `execa` (`src/utils/process-manager.ts`).
   - **Option B:** Keep `web-audio-api` for decode only (strip `music-tempo`). The polyfill works for WAV and most MP3s — the brittleness is with exotic codecs. This is the minimal-change path.
   - **Option C:** Use `music-metadata` (already in `package.json` as a dependency) to get audio metadata, then shell out to a Node audio package for raw PCM. `music-metadata` v11 can read PCM directly from some formats.
4. Verify `npm run typecheck` passes after adding meyda before writing any analysis logic

> **Decision checkpoint:** If FFmpeg is not reliably present in users' environments, fall back to Option B. The key win is replacing `music-tempo` with Meyda's feature extraction — the decode step is secondary.

### Phase 2 — Core Utility (`src/utils/audio-analysis.ts`)

1. Define and export all interfaces: `AudioEvent`, `SceneCutPoint`, `AudioAnalysisResult`, `SensitivityOptions`
2. Implement `decodeAudio(audioPath: string): Promise<{ pcm: Float32Array; sampleRate: number; durationSeconds: number }>`
   - Use the selected Option (A/B/C) from Phase 1
   - Always returns mono float32 data
3. Implement `computePerFrameFFT(pcm, sampleRate, fps)`:
   - Calculate `samplesPerFrame = Math.floor(sampleRate / fps)` — window size
   - For each frame, extract the window of PCM samples
   - Call `Meyda.extract(['rms', 'spectralFlux', 'mfcc', 'powerSpectrum'], window)`
   - Map power spectrum bins to bass/mids/highs/air ranges
4. Implement `detectEvents(perFrameData, fps, sensitivity): AudioEvent[]` with separate detector for each event type:
   - `detectBassDrops`: `bassDelta[frame] > bassThreshold` — only fire once per drop (suppress for 10 frames after)
   - `detectImpacts`: `bassDelta + midDelta + highDelta > impactThreshold` simultaneously
   - `detectBuilds`: RMS increases monotonically over `>= 30` frames → mark start; first frame RMS declines after a build → mark peak
   - `detectTransients`: `highDelta > transientThreshold` AND `highDelta[frame+5] < highDelta[frame] * 0.3` (fast decay)
   - `detectSilenceBreaks`: RMS drops below `silenceThreshold` for `>= 5` frames, then returns above — mark the return frame
   - `detectEnergyShifts`: `|rms[frame] - rms[frame-1]| > energyShiftThreshold` (catch-all for major RMS jumps)
5. Implement `deriveCutPoints(events, totalFrames): SceneCutPoint[]`:
   - Always include frame 0 ("Start") and the peak energy frame
   - Include all events with `intensity >= 0.7`
   - Sort by frame number
   - Remove cut points closer than 15 frames to each other (deduplicate near-simultaneous events)
6. Keep BPM/beat detection via `music-tempo` — call as a secondary pass. The beat data is still useful for scene duration suggestions.
7. Export `analyzeAudio(audioPath, fps, sensitivity?): Promise<AudioAnalysisResult>`

### Phase 3 — Tool Handler (`src/tools/analyze-audio.ts`)

Follow the exact registration pattern of `src/tools/analyze-beats.ts`:

1. Export `registerAnalyzeAudio(server: McpServer): void`
2. Zod input schema: `projectPath`, `audioFile`, optional `sensitivity` object
3. Handler body:
   - `validateProjectPath(args.projectPath)` — `src/utils/file-ops.ts:12`
   - Validate extension and file existence (same guards as `analyze-beats.ts:44–88`)
   - File size guard — same 50MB limit (`analyze-beats.ts:74–88`)
   - `readComposition(args.projectPath)` → get `settings.fps` — `src/state/project-state.ts:68`
   - Call `analyzeAudio(audioPath, fps, args.sensitivity)`
   - Derive sidecar filename: strip extension → append `-analysis.json`
   - Write sidecar via `fs.writeJson()`
   - Build and return the success response with the complete `AudioAnalysisResult`
4. `next_steps` guidance for Claude:
   - Explain event types found (sorted by intensity)
   - List the top 3–5 `suggestedSceneCuts` frames with reasons
   - Remind Claude that `AudioReactive` can be used in scenes for live reactivity

### Phase 4 — Backward Compatibility Wrapper (`src/tools/analyze-beats.ts`)

Convert the existing file to a thin proxy:

```typescript
// analyze-beats.ts — backward compat wrapper
import { registerAnalyzeAudio } from './analyze-audio.js';

// analyze_beats is now an alias for analyze_audio with the same input schema.
// Kept for backward compatibility with saved Claude prompts.
// The response shape is a superset of the old BeatData — all old fields present.
export function registerAnalyzeBeats(server: McpServer): void {
  registerAnalyzeAudio(server);  // registers as analyze_audio
  // Also register the old name pointing to the same handler
  server.registerTool('analyze_beats', /* ... same schema ... */, async (args) => {
    // delegate to analyzeAudio, return old-shaped subset of result
  });
}
```

> If the MCP SDK does not support two tool names with the same handler, register them as separate tools that call the same `analyzeAudio()` function.

### Phase 5 — AudioReactive Primitive (`src/primitives/AudioReactive.tsx`)

This component lives in the MCP server repo at `src/primitives/` and is copied to user projects via `copyTemplates()`.

```tsx
import React, { createContext, useContext, useMemo } from 'react';
import { useWindowedAudioData, visualizeAudio } from '@remotion/media-utils';
import { useCurrentFrame, useVideoConfig } from 'remotion';

// Context value shape — see AudioReactiveContextValue in Data Models
const AudioReactiveContext = createContext<AudioReactiveContextValue>(defaultValue);

export const AudioReactive: React.FC<{
  src: string;
  windowInSeconds?: number; // default 30 — how much audio to load at once
  numberOfSamples?: number; // default 128 — must be power of 2
  children: React.ReactNode;
}> = ({ src, windowInSeconds = 30, numberOfSamples = 128, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src,
    frame,
    fps,
    windowInSeconds,
  });

  const contextValue = useMemo<AudioReactiveContextValue>(() => {
    if (!audioData) {
      // Not loaded yet — return zero values, isLoaded = false
      return defaultValue;
    }

    const frequencies = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples,
      optimizeFor: 'speed',
      dataOffsetInSeconds,
    });

    // Split 128 bins into 4 bands — indices based on Context7 docs:
    // "left side represents bass and right side represents high frequencies"
    const bassSlice   = frequencies.slice(0, Math.floor(numberOfSamples * 0.25));
    const midSlice    = frequencies.slice(Math.floor(numberOfSamples * 0.25), Math.floor(numberOfSamples * 0.75));
    const highSlice   = frequencies.slice(Math.floor(numberOfSamples * 0.75), Math.floor(numberOfSamples * 0.875));
    const airSlice    = frequencies.slice(Math.floor(numberOfSamples * 0.875));

    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

    const bassIntensity  = avg(bassSlice);
    const midIntensity   = avg(midSlice);
    const highIntensity  = avg(highSlice);
    const overallEnergy  = avg(frequencies);

    return {
      bassIntensity,
      midIntensity,
      highIntensity,
      overallEnergy,
      isDropping: bassIntensity > 0.15,  // threshold tunable via prop in v2
      isSilent:   overallEnergy < 0.02,
      isLoaded:   true,
    };
  }, [audioData, frame, fps, numberOfSamples, dataOffsetInSeconds]);

  return (
    <AudioReactiveContext.Provider value={contextValue}>
      {children}
    </AudioReactiveContext.Provider>
  );
};

export function useAudioReactive(): AudioReactiveContextValue {
  return useContext(AudioReactiveContext);
}
```

**Key Remotion API notes (verified via Context7):**
- `useWindowedAudioData` accepts `{ src, frame, fps, windowInSeconds }` and returns `{ audioData, dataOffsetInSeconds }` — `dataOffsetInSeconds` must be passed to `visualizeAudio`
- `visualizeAudio` requires `numberOfSamples` to be a power of 2
- `optimizeFor: 'speed'` avoids the default logarithmic frequency scaling which is better for spectrum displays but wastes computation here
- Both functions import from `@remotion/media-utils` — NOT from `remotion`

### Phase 6 — Update Barrel and Server

**`src/primitives/index.ts`:**
```typescript
// Add new exports
export { AudioReactive, useAudioReactive } from './AudioReactive';
export type { AudioReactiveContextValue, AudioReactiveProps } from './AudioReactive';

// Deprecated — use AudioReactive instead
/** @deprecated Use AudioReactive and useAudioReactive instead */
export { BeatSync, useBeat } from './BeatSync';
export type { BeatSyncProps, BeatData } from './BeatSync';
```

**`src/server.ts`:**
```typescript
// Phase 3 — Assets & Audio Analysis
import { registerScanAssets } from './tools/scan-assets.js';
import { registerImportAsset } from './tools/import-asset.js';
import { registerAnalyzeAudio } from './tools/analyze-audio.js';  // NEW
import { registerAnalyzeBeats } from './tools/analyze-beats.js';  // wrapper

// In setupServer():
registerAnalyzeAudio(server);   // primary tool
registerAnalyzeBeats(server);   // backward compat alias
```

### Phase 7 — copyTemplates Update

`src/utils/file-ops.ts:74–97` — the `copyTemplates()` function copies everything under `src/templates/` and `src/primitives/` into user projects. Since `AudioReactive.tsx` lives at `src/primitives/AudioReactive.tsx`, it will be automatically included in the copy without any changes to `copyTemplates()`.

Verify that `src/primitives/` is in the copy source paths (check `file-ops.ts:74–97` at implementation time).

### Phase 8 — CLAUDE.md Update

Replace the "Beat Analysis System" section in `CLAUDE.md` with an updated "Audio Analysis System" section documenting:
- The two-part architecture (server-side event detection + client-side reactivity)
- The `analyze_audio` tool workflow
- The `AudioReactive` component usage pattern
- The `analyze_beats` deprecation notice

### Suggested Build Order

1. Install `meyda` → verify TypeScript types → write stub if needed → `npm run typecheck`
2. Implement `decodeAudio()` in `audio-analysis.ts` → unit test with a real audio file
3. Implement `computePerFrameFFT()` → log output to verify band shapes look reasonable
4. Implement `detectEvents()` → test each detector independently
5. Implement `analyzeAudio()` wrapper → run on a real trailer soundtrack
6. Write `analyze-audio.ts` tool → `npm run build`
7. Write `AudioReactive.tsx` → visual inspection in a test Remotion project
8. Update `analyze-beats.ts` wrapper → `npm run build`
9. Update `primitives/index.ts` → `npm run build`
10. Update `server.ts` → full build and manual tool test

---

## Testing Strategy

### Part 1 — Server-side analysis

- [ ] Unit: `decodeAudio()` on a 5-second WAV → verify PCM length ≈ `duration * sampleRate`
- [ ] Unit: `decodeAudio()` on an MP3 → must not throw or return empty array
- [ ] Unit: `computePerFrameFFT()` on silence (all-zero PCM) → all band energies must be 0
- [ ] Unit: `detectEvents()` on a synthetic PCM with a manufactured spike at frame 90 → must return `bass-drop` at frame 90
- [ ] Unit: `detectEvents()` on a silence segment → must return `silence-break` event when audio returns
- [ ] Integration: call `analyze_audio` tool via MCP on a real 30-second trailer MP3 → verify `events.length > 0`, `suggestedSceneCuts.length >= 2`, `bpm > 0`
- [ ] Integration: run `analyze_beats` (wrapper) after `analyze_audio` is registered → verify response includes `beats[]` and `suggestedSceneDurations` (backward compat)
- [ ] Edge case: audio file with silent intro (10 seconds of silence then music) → should return `silence-break` event, not `bass-drop` on first beat
- [ ] Edge case: ambient/drone music with no discernible beats → `bpm` may be 0, but `energy-shift` events should still be detected
- [ ] Edge case: 50MB audio file → must return file-size error, not crash
- [ ] Build: `npm run build` → zero TypeScript errors

### Part 2 — Client-side AudioReactive

- [ ] Visual: render a Remotion composition with `<AudioReactive>` wrapping a div that scales with `bassIntensity` → verify it moves in sync with audio during studio preview
- [ ] Visual: verify `isSilent` is true during silent sections (e.g., a gap between audio chapters)
- [ ] Visual: verify `isLoaded = false` on frame 0 (before audio window loads) → component renders with default zero values, no crash
- [ ] Render: run `render_video` on a composition using `<AudioReactive>` → verify render completes without errors and audio reactivity is baked into output frames
- [ ] TypeScript: `useAudioReactive()` called outside `<AudioReactive>` returns the default context (zero values, not an exception)

---

## Rollout & Deployment

This is a server-side feature addition. No user action is required beyond `npm install` and `npm run build`.

**Migration path for existing projects using `BeatSync`:**
1. `BeatSync` remains functional — it is deprecated but not removed in this version
2. The deprecation JSDoc comment will surface in IDE tooltips for users who write their own scene code
3. The `analyze_beats` MCP tool continues to work — its response is now a superset of the old shape; all old fields are present

**Rollback plan:** If the Meyda decode path proves unreliable, the `decodeAudio()` function is isolated to one module. Roll back by reverting `audio-analysis.ts` to the `web-audio-api` decode path and `music-tempo` BPM detection — no other files change.

---

## Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Meyda does not ship TypeScript types, causing `tsc` to fail | High | Medium | Write `src/types/meyda.d.ts` stub before implementing — stub only needs `Meyda.extract()` signature |
| FFmpeg is not available on all user machines (Option A decode path) | High | Medium | Default to Option B (keep `web-audio-api` for decode, add Meyda for FFT) — FFmpeg is optional enhancement |
| Event detection threshold defaults produce too many false positives on quiet tracks | Medium | High | Default thresholds should be conservative (high values). Include `sensitivity` override param so users can tune. Log event count in response — if > 20 events, add a suggestion to increase thresholds |
| `isDropping` detection in `AudioReactive` uses frame-to-frame comparison which is unreliable at component boundaries | Medium | Medium | Use a short EMA (exponential moving average) over 3–5 frames rather than a single frame delta. This smooths the signal without adding memory overhead |
| `visualizeAudio()` returns different results in Studio vs render (different audio decoders) | Medium | Low | This is a known Remotion issue for certain codecs. Mitigate by recommending WAV or high-quality MP3 for music used with `AudioReactive`. Document in the tool description |
| Replacing `analyze_beats` with a wrapper breaks existing Claude prompts that hardcode field names from the old response | Low | Low | The new response is a strict superset — `bpm`, `beats`, `suggestedSceneDurations` are all preserved at the top level. No field renamed or removed |
| Meyda's `spectralFlux` feature is not sufficient for transient detection on all genres | Low | Medium | Fall back to raw high-frequency bin delta if `spectralFlux` is too smooth. Implement both and compare during testing phase |

---

## Open Questions

- [ ] Does Meyda v5+ ship TypeScript declaration files? Check `node_modules/meyda/dist/` after `npm install meyda` — if `.d.ts` files exist, skip writing a stub
- [ ] Is `ffmpeg` reliably available in the MCP server's execution environment? If Claude Desktop launches the MCP server without a user shell, PATH may not include ffmpeg — test at implementation time
- [ ] Should `AudioReactive` expose a `prevBassIntensity` via context so children can compute their own delta without an external store? Or is `isDropping` a sufficient abstraction?
- [ ] Should `analyze_audio` offer a `--fast` mode that skips per-frame FFT and only runs BPM detection? Useful for users who just need beat-aligned cuts without full event detection

---

## Relationship to Existing Docs

| Document | Relationship |
|----------|-------------|
| `docs/planning/beat-detection-and-audio-sync.md` | Superseded for the server-side analysis approach. The file will remain valid as a record of Phase 3 implementation. This feature replaces its core with a richer system. |
| `docs/issues/2026-03-02-beat-animation-integration-gap.md` | The `AudioReactive` primitive (Part 2) directly addresses Fix 1 (no real-time reactivity) from this issue. Fix 2 (`BeatPulse` component) and Fix 3 (`enterOnBeat` in templates) remain relevant and are not superseded by this feature. |

---

## References

- `src/utils/beat-analysis.ts` — existing file being replaced; reference for BPM detection logic to preserve
- `src/tools/analyze-beats.ts` — existing tool handler being replaced; reference for validation guards and error shape
- `src/primitives/BeatSync.tsx:46–98` — existing primitive being deprecated; reference for Context pattern
- `src/primitives/useAnimation.ts:147–197` — existing animation engine; `AudioReactive` values can feed `opacity`, `transform` etc via this hook
- `src/utils/file-ops.ts:74–97` — `copyTemplates()` — confirms `AudioReactive.tsx` at `src/primitives/` will be auto-copied to user projects
- `src/server.ts:15–18, 49–51` — Phase 3 import and registration block where new tools are added
- `docs/issues/2026-03-02-beat-animation-integration-gap.md` — context for why BeatSync fell short
- [Meyda offline Node.js guide](https://meyda.sound.gatech.edu/guides/offline-node) — confirmed `Meyda.extract()` API for offline signal processing
- [Remotion useWindowedAudioData docs](https://www.remotion.dev/docs/use-windowed-audio-data) — confirmed `{ src, frame, fps, windowInSeconds }` input, `{ audioData, dataOffsetInSeconds }` output
- [Remotion visualizeAudio docs](https://www.remotion.dev/docs/visualize-audio) — confirmed `numberOfSamples` must be power of 2; bass on left, highs on right
- [Remotion audio visualization guide](https://www.remotion.dev/docs/audio/visualization) — confirms bass extraction pattern: `frequencies.slice(0, 32)` for 128-sample output
