# Feature: Beat Detection and Audio Sync

**Version:** v1.0
**Status:** Draft
**Type:** Implementation Guide
**Created:** 2026-03-02
**Last Modified:** 2026-03-02

---

## Problem Statement

The current audio system in remotion-video-mcp handles one scenario: narration-driven videos. `audio-utils.ts` parses Whisper/AssemblyAI timestamp JSON files (`src/utils/audio-utils.ts:19`) and converts speech segment boundaries to `durationFrames` (`src/utils/audio-utils.ts:28`). This works well for voiceover-led content.

It does nothing for the other dominant video type: **music-driven videos** — product trailers, social media ads, highlight reels, and title sequences that use instrumental background tracks. For these videos, the natural unit of time is not a speech segment but a **beat** — a rhythmic pulse that professional video editors have always aligned cuts and entrances to.

Without beat data, Claude must guess scene durations when working with music. The result is scenes that feel visually disconnected from the audio: cuts land off-beat, entrance animations fire at arbitrary moments, and the video lacks the kinetic energy the music is trying to convey.

This feature closes that gap with two additions:

1. An `analyze_beats` MCP tool that detects BPM and exact beat timestamps from audio files and converts them to Remotion frame numbers — giving Claude precise timing data to align scene transitions and entrance animations to the beat.
2. A smarter `import_asset` response that guides Claude to ask the user about the audio type before proceeding, so beat analysis is triggered only when the audio is actually music (not narration).

A third change — universal filename sanitization on import — is bundled here because it is a prerequisite for reliable beats JSON file naming and prevents broken `staticFile()` paths that arise from user-uploaded files with spaces and special characters in their names.

---

## Goals & Success Criteria

- Claude can create a music-driven video where scene transitions land on exact beat boundaries, using only natural-language direction from the user
- `analyze_beats` returns BPM, a frame-indexed beat array, and pre-calculated suggested scene durations at 4-beat, 8-beat, and 16-beat multiples
- Beat data is saved to a sidecar JSON file in `assets/audio/` and does not touch `composition.json`
- `import_asset` sanitizes all filenames to kebab-case by default, eliminating broken `staticFile()` calls caused by spaces and special characters
- `import_asset` next_steps for audio files guide Claude to ask the user whether the audio is narration or music before proceeding — the user always makes that call
- No changes to existing template components, `composition.json` schema, or `audio-utils.ts`
- `npm run build` compiles clean with zero TypeScript errors after all changes

**Definition of done:**

- [ ] `src/utils/beat-analysis.ts` implemented with `analyzeBeats()` function
- [ ] `src/tools/analyze-beats.ts` implemented and registered in `src/server.ts`
- [ ] `src/tools/import-asset.ts` updated: filename sanitization + audio-type next_steps
- [ ] `src/server.ts` updated: `analyze_beats` registered in Phase 3 block
- [ ] `package.json` updated with `music-tempo` and `web-audio-api` dependencies
- [ ] `CLAUDE.md` updated to document the beat analysis system and workflow
- [ ] TypeScript builds clean (`npm run build`)

---

## Requirements

### Functional Requirements

- **FR-001:** `analyze_beats` accepts a `projectPath`, an `audioFile` filename (relative to `assets/audio/`), and an optional `bpmRange` `{ min, max }` hint
- **FR-002:** `analyze_beats` reads `composition.json` to obtain `settings.fps` for frame number calculations — it does not accept fps as a parameter
- **FR-003:** `analyze_beats` decodes the audio file to PCM float32 via `web-audio-api`'s `AudioContext.decodeAudioData()`, averages stereo channels to mono, then passes the data to `music-tempo`
- **FR-004:** `analyze_beats` returns: `bpm`, `beatCount`, `beatIntervalMs`, a `beats` array of `{ time: number; frame: number }` objects, and `suggestedSceneDurations` for 4-beat, 8-beat, and 16-beat multiples (each expressed in both frames and seconds)
- **FR-005:** `analyze_beats` saves the beat data as a JSON file at `assets/audio/<audioName>-beats.json` (strip the original audio extension, append `-beats.json`)
- **FR-006:** `import_asset` sanitizes every imported filename to kebab-case using the existing `toSafeFilename()` helper (`src/utils/file-ops.ts:273`) when no custom `destFilename` is provided
- **FR-007:** `import_asset` next_steps for audio imports (category `audio`, extension not `.json`) must instruct Claude to ask the user whether the audio is narration, background music/beats, or music with lyrics before taking any further action
- **FR-008:** The `analyze_beats` tool is registered in `src/server.ts` in the Phase 3 — Assets block alongside `scan_assets` and `import_asset`

### Non-Functional Requirements

- `music-tempo` and `web-audio-api` must be pure JS — no native bindings, no FFmpeg dependency, no system-level tooling required from the user
- Beat analysis runs in-process (not a child process) and must not block the MCP server's stdio transport
- The beats sidecar JSON is a reference artifact only — Claude reads it to inform scene creation calls; it does not need to be tracked in `composition.json`
- Filename sanitization is backward-compatible: if `destFilename` is explicitly provided by Claude, it is used as-is (no sanitization applied)
- Error handling must be specific: missing audio file, undecodable audio, zero beats detected, and invalid `bpmRange` each return distinct `{ status: "error", message, suggestion }` responses

### Assumptions

- `music-tempo` npm package implements the Beatroot algorithm and returns `{ tempo: number; beats: number[] }` (BPM + array of beat times in seconds)
- `web-audio-api` npm package provides a Node.js-compatible `AudioContext` with `decodeAudioData()`
- Audio files imported via `import_asset` are always in `assets/audio/` — `analyze_beats` only needs the filename, not the full path
- `settings.fps` in `composition.json` is always an integer (30, 24, 60, etc.) — no fractional frame rates in scope
- Beat detection accuracy is sufficient for most commercial music (120–180 BPM range); edge cases like complex jazz or ambient audio may produce unreliable results and should be documented in the tool's description

---

## User Stories

| Priority | Story | Acceptance Criteria |
|----------|-------|---------------------|
| Must | As a user, I want to upload a trailer soundtrack and have Claude sync scene cuts to the beat, so the video feels professionally produced | `import_asset` → user says "music" → `analyze_beats` → `create_scene` calls use suggested durations |
| Must | As a user, I want my uploaded audio files to have clean, predictable names so `staticFile()` references never break | All imported filenames with spaces or special chars are sanitized to kebab-case automatically |
| Must | As a user, I want Claude to ask me what kind of audio I uploaded rather than assuming, so I control whether beat analysis happens | `import_asset` next_steps include explicit audio-type question for all audio imports |
| Should | As a user, I want to see the BPM and beat data Claude detected, so I can decide whether to use 4-beat or 8-beat scene lengths | `analyze_beats` returns human-readable summary including BPM, beat count, and suggested durations |
| Could | As a user, I want to constrain the BPM detection range, so beat detection is more accurate for specific genres | `bpmRange: { min, max }` optional parameter on `analyze_beats` |

---

## Technical Design

### Architecture Overview

```
Claude (MCP client)
       │
       │  import_asset (audio file from temp upload)
       ▼
┌──────────────────────────────────────────────────────────────┐
│  src/tools/import-asset.ts                                   │
│                                                              │
│  1. toSafeFilename(sourceName) → sanitized kebab filename    │
│  2. fs.copy(source → assets/audio/<clean-name>.mp3)          │
│  3. parseFile() → duration metadata                          │
│  4. next_steps: "Ask user: narration / music-beats / lyrics" │
└──────────────────────────┬───────────────────────────────────┘
                           │ user says "music/beats"
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  src/tools/analyze-beats.ts                                  │
│                                                              │
│  1. readComposition() → get settings.fps                     │
│  2. fs.readFile(assets/audio/<clean-name>.mp3) → ArrayBuffer │
│  3. AudioContext.decodeAudioData() → AudioBuffer (PCM)       │
│  4. avg stereo channels → Float32Array (mono)                │
│  5. new MusicTempo(pcmData) → { tempo, beats[] }             │
│  6. beats.map(t => { time: t, frame: Math.round(t * fps) })  │
│  7. calculate 4/8/16-beat suggested durations                │
│  8. fs.writeJson(assets/audio/<name>-beats.json, data)       │
│  9. return BeatData + saved path + next_steps                │
└──────────────────────────┬───────────────────────────────────┘
                           │ Claude uses beat data
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  src/tools/create-scene.ts  (unchanged)                      │
│                                                              │
│  Claude sets durationFrames = suggestedSceneDurations['8-beat'].frames
│  Claude picks entrancePreset based on tempo (fast → drop-in) │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
              Scenes snapped to beat boundaries
```

### Component Breakdown

| Component | File | Change | Purpose |
|-----------|------|--------|---------|
| Beat analysis utility | `src/utils/beat-analysis.ts` | **NEW** | Core detection logic: decode audio, run Beatroot, convert to frames |
| analyze_beats tool | `src/tools/analyze-beats.ts` | **NEW** | MCP tool handler: validation, orchestration, JSON sidecar write |
| import_asset tool | `src/tools/import-asset.ts` | **MODIFY** | Sanitize filenames (line 105) + update audio next_steps (line 192) |
| Server registration | `src/server.ts` | **MODIFY** | Import and register `analyze_beats` in Phase 3 block (line 17–18, 50) |
| Project dependencies | `package.json` | **MODIFY** | Add `music-tempo` and `web-audio-api` to `dependencies` |
| Project docs | `CLAUDE.md` | **MODIFY** | Document beat analysis system, workflow, and new tool |

### Data Models

#### `BeatData` interface — returned by `analyzeBeats()` and written to sidecar JSON

```typescript
// src/utils/beat-analysis.ts
interface BeatData {
  bpm: number;                          // Detected tempo (beats per minute)
  beatCount: number;                    // Total number of detected beats
  beatIntervalMs: number;               // Average ms between beats (1000 / bpm * 60)
  beats: Array<{
    time: number;                       // Beat timestamp in seconds
    frame: number;                      // Corresponding Remotion frame number
  }>;
  suggestedSceneDurations: {
    '4-beat': { frames: number; seconds: number };
    '8-beat': { frames: number; seconds: number };
    '16-beat': { frames: number; seconds: number };
  };
}
```

Beat durations are calculated as: `Math.round((beatsPerPhrase / bpm) * 60 * fps)` — rounding to the nearest frame.

#### Sidecar JSON — saved to `assets/audio/<audioName>-beats.json`

```json
{
  "bpm": 128,
  "beatCount": 261,
  "beatIntervalMs": 468.75,
  "beats": [
    { "time": 0.124, "frame": 4 },
    { "time": 0.593, "frame": 18 },
    { "time": 1.062, "frame": 32 }
  ],
  "suggestedSceneDurations": {
    "4-beat": { "frames": 56, "seconds": 1.875 },
    "8-beat": { "frames": 113, "seconds": 3.75 },
    "16-beat": { "frames": 225, "seconds": 7.5 }
  }
}
```

This file is written to `assets/audio/` alongside the source audio. It is **not** referenced in `composition.json`. Claude reads it during the conversation to choose `durationFrames` when calling `create_scene`.

#### Filename sanitization — existing `toSafeFilename()` applied to imports

The `toSafeFilename()` function already exists at `src/utils/file-ops.ts:273`:

```typescript
export function toSafeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
```

Currently this function is only called for scene IDs in `create-scene.ts`. The change extends its application to asset filenames in `import-asset.ts` at line 105, where the filename is resolved from `destFilename` or `path.basename(file.sourcePath)`.

### API Contracts

#### `analyze_beats` — new MCP tool

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | Absolute path to the Remotion project root |
| `audioFile` | `string` | Yes | Filename only (e.g., `my-track.mp3`) — tool resolves full path as `assets/audio/<audioFile>` |
| `bpmRange` | `{ min: number; max: number }` | No | Hint to constrain tempo detection range (e.g., `{ min: 120, max: 180 }` for EDM) |

**Success response:**

```json
{
  "status": "success",
  "audioFile": "my-epic-trailer-music-v2.mp3",
  "beatsJsonPath": "assets/audio/my-epic-trailer-music-v2-beats.json",
  "bpm": 128,
  "beatCount": 261,
  "beatIntervalMs": 468.75,
  "fps": 30,
  "beats": [
    { "time": 0.124, "frame": 4 },
    { "time": 0.593, "frame": 18 }
  ],
  "suggestedSceneDurations": {
    "4-beat": { "frames": 56, "seconds": 1.875 },
    "8-beat": { "frames": 113, "seconds": 3.75 },
    "16-beat": { "frames": 225, "seconds": 7.5 }
  },
  "next_steps": "Beat data saved. Use suggestedSceneDurations['8-beat'].frames as durationFrames for standard scenes. Use beats[N].frame values as startFrame offsets for entrances that must land exactly on a beat."
}
```

**Error response (example — file not found):**

```json
{
  "status": "error",
  "message": "Audio file not found: assets/audio/my-track.mp3",
  "suggestion": "Run import_asset first to copy the audio into the project, or verify the audioFile filename matches exactly."
}
```

#### `import_asset` — modified next_steps for audio

Existing tool signature is unchanged. Only the `next_steps` string in the success response changes for audio imports (when `category === 'audio'` and `ext !== '.json'`):

```
"Before using this audio file, ask the user: What type of audio is this?
(a) Narration or voiceover — spoken words synced to scenes
(b) Background music or beats — instrumental track with no lyrics
(c) Music with lyrics — songs where lyrics are part of the content

If the user says (b) or is unsure: explain that you can analyze the beats to
align scene transitions and animations to the rhythm, then ask if they want
that. If yes, call analyze_beats."
```

### Integration Points

**`import_asset` → `analyze_beats`:** The import tool establishes the clean filename that the beats tool relies on. The sanitization change ensures that `<audioName>-beats.json` is always a valid, predictable path. If sanitization were omitted, a file imported as `My Track (Final).mp3` would not match a beats file named `my-epic-trailer-music-v2-beats.json` because the beats tool strips the extension from the asset filename.

**`analyze_beats` → `create_scene`:** No code coupling. The beats tool returns data that Claude uses conversationally to set `durationFrames` and select `entrancePreset` values when calling `create_scene`. The `create_scene` tool (`src/tools/create-scene.ts`) and its Zod schema are unchanged.

**`analyzeBeats()` → `readComposition()`:** The utility function does not call `readComposition()` directly. The tool handler (`analyze-beats.ts`) calls `readComposition()` (`src/state/project-state.ts:68`) to retrieve `settings.fps`, then passes fps as a parameter to `analyzeBeats()`. This keeps the utility function pure and testable.

---

## Implementation Plan

### Phase 1 — Dependencies

Install the two new packages:

```bash
npm install music-tempo web-audio-api
```

Verify TypeScript types are available or write local `declare module` stubs if needed (both packages are pure JS without bundled `.d.ts` files — check at install time and add stubs to `src/types/` if required).

### Phase 2 — Core Utility (`src/utils/beat-analysis.ts`)

1. Import `AudioContext` from `web-audio-api` and `MusicTempo` from `music-tempo`
2. Define the `BeatData` interface (exported — the tool handler and tests import it)
3. Implement `analyzeBeats(audioPath: string, fps: number, bpmRange?: { min: number; max: number }): Promise<BeatData>`:
   - Read file as `Buffer` → convert to `ArrayBuffer`
   - Instantiate `new AudioContext()`, call `decodeAudioData(arrayBuffer)`
   - Average left and right channel `Float32Array` data to mono
   - Pass mono data + sample rate to `new MusicTempo(pcmData, { sampleRate })`
   - Map `tempo.beats` (seconds) to `{ time, frame }` pairs using `Math.round(time * fps)`
   - Calculate suggested durations: `Math.round((n / bpm) * 60 * fps)` for n = 4, 8, 16
   - Return `BeatData` object

### Phase 3 — Tool Handler (`src/tools/analyze-beats.ts`)

Follow the exact pattern established by other tool files (see `src/tools/import-asset.ts:50`):

1. Export `registerAnalyzeBeats(server: McpServer): void`
2. Define Zod schema with `projectPath`, `audioFile`, optional `bpmRange`
3. In handler:
   - Call `validateProjectPath(args.projectPath)` (`src/utils/file-ops.ts:12`)
   - Verify audio file exists at `assets/audio/<audioFile>`
   - Call `readComposition(args.projectPath)` (`src/state/project-state.ts:68`) → get `settings.fps`
   - Call `analyzeBeats(audioPath, fps, args.bpmRange)`
   - Derive beats JSON filename: strip extension from `audioFile`, append `-beats.json`
   - Write JSON to `assets/audio/<beatsFilename>` via `fs.writeJson()`
   - Return success response with full `BeatData` + `beatsJsonPath` + `next_steps`

### Phase 4 — import_asset Changes (`src/tools/import-asset.ts`)

**Change 1 — Filename sanitization (line 105):**

Current code at line 105:
```typescript
let filename = file.destFilename ?? path.basename(file.sourcePath);
```

Updated logic:
```typescript
// Sanitize filename to kebab-case when no custom destFilename is provided.
// Prevents broken staticFile() calls from uploaded filenames with spaces/parens.
const rawFilename = path.basename(file.sourcePath);
let filename = file.destFilename ?? toSafeFilename(rawFilename.replace(/\.[^.]+$/, ''))
  + path.extname(rawFilename);
```

Import `toSafeFilename` from `'../utils/file-ops.js'` (already imported for `validateProjectPath`).

**Change 2 — Audio next_steps (line 192):**

Current `next_steps` string is generic for all asset types. Add a conditional: if any successfully imported file has `category === 'audio'` and the extension is not `.json`, override `next_steps` with the audio-type guidance string (see API Contracts section above).

### Phase 5 — Server Registration (`src/server.ts`)

Add to the Phase 3 block (after line 17):

```typescript
import { registerAnalyzeBeats } from './tools/analyze-beats.js';
```

And in `setupServer()` after line 50 (`registerImportAsset(server)`):

```typescript
registerAnalyzeBeats(server);
```

### Suggested Build Order

1. Install dependencies → verify `npm install` succeeds
2. Write `src/utils/beat-analysis.ts` → run `npm run typecheck` on the utility alone
3. Write `src/tools/analyze-beats.ts` → run `npm run typecheck`
4. Modify `src/tools/import-asset.ts` → run `npm run typecheck`
5. Modify `src/server.ts` → run `npm run build` (full compile)
6. Manual integration test (see Verification section)

---

## Testing Strategy

- [ ] Unit: `analyzeBeats()` with a short (5-second) known-BPM WAV file — assert detected BPM is within ±5 of expected
- [ ] Unit: `analyzeBeats()` with a mono file (single channel) — assert no crash, same output shape
- [ ] Unit: `toSafeFilename()` called with `"My Track (Final Mix v2).mp3"` → `"my-track-final-mix-v2.mp3"` (verify existing function behavior)
- [ ] Integration: call `import_asset` with a file named `"My Epic Trailer Music (v2).mp3"` → verify `filename` in response is `"my-epic-trailer-music-v2.mp3"`, verify file exists at `assets/audio/my-epic-trailer-music-v2.mp3`
- [ ] Integration: call `import_asset` with an audio file → verify `next_steps` contains the audio-type question text
- [ ] Integration: call `analyze_beats` with the imported file → verify JSON sidecar created at `assets/audio/my-epic-trailer-music-v2-beats.json`, verify `bpm > 0`, `beats.length > 0`, `suggestedSceneDurations['8-beat'].frames > 0`
- [ ] Edge case: `analyze_beats` on a <5-second clip → should succeed or return a specific error (not crash)
- [ ] Edge case: `analyze_beats` on a `.json` file mistakenly passed as `audioFile` → must return a clear error
- [ ] Edge case: `import_asset` with `destFilename` explicitly set → verify sanitization is NOT applied (custom name preserved)
- [ ] `npm run build` — zero TypeScript errors after all changes

---

## Rollout & Deployment

This is a server-side feature — no migration or user action required. After `npm run build`, Claude connects to the rebuilt server and the new tools are immediately available.

If `music-tempo` or `web-audio-api` require native compilation on the user's machine, add a note to `README.md` and `CLAUDE.md` that `npm install` may take longer than usual on first setup. Both libraries are targeted to be pure JS — verify this at install time.

No feature flag needed. The `analyze_beats` tool only fires when Claude explicitly calls it; there is no automatic behavior change to the import flow beyond the updated `next_steps` text.

---

## Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| `music-tempo` or `web-audio-api` lack TypeScript types, blocking `npm run build` | High | Medium | Write minimal `declare module` stubs in `src/types/`; these only need to expose the APIs we call |
| Beat detection is inaccurate on non-4/4 time signatures (waltz, jazz, irregular EDM) | Medium | Medium | Document in tool description: "Works best with 4/4 time signature music. Results may be unreliable for jazz, classical, or irregular rhythms." Return raw `beats[]` so Claude/user can inspect and override |
| `web-audio-api` Node.js polyfill behavior differs from browser AudioContext for certain codec paths | Medium | Low | Test with MP3 and WAV at integration time. If MP3 decoding fails, document that WAV is the recommended format for beat analysis |
| Large audio files (>10 min) cause memory pressure during PCM decode | Low | Low | Add a file size check in the tool handler — reject files >50MB with a clear error message and suggestion to trim the audio |
| Filename sanitization strips characters that were intentionally meaningful (e.g., version numbers like `v2`) | Low | Medium | `toSafeFilename()` at `src/utils/file-ops.ts:273` preserves digits and hyphens — `v2` becomes `v2`, `(v2)` becomes `v2`. Acceptable. The `destFilename` escape hatch is always available. |

---

## Open Questions

- [ ] Do `music-tempo` and `web-audio-api` ship TypeScript declaration files? — check at `npm install` time; if not, write stubs before `analyze-beats.ts`
- [ ] Should `analyze_beats` expose the raw `music-tempo` sample-rate parameter, or always use the AudioBuffer's native sample rate? — default to native; no reason to expose this to Claude
- [ ] What is the right file size limit for beat analysis (currently proposed: 50MB)? — confirm with a real-world large file test

---

## References

- `src/utils/audio-utils.ts` — existing narration timestamp parsing (separate concern, not modified)
- `src/utils/file-ops.ts:273` — `toSafeFilename()` function that will be reused for import sanitization
- `src/tools/import-asset.ts:105` — filename resolution line that receives the sanitization change
- `src/tools/import-asset.ts:192` — `next_steps` field that receives the audio-type guidance update
- `src/state/project-state.ts:5` — `Composition` interface; `settings.fps` read by `analyze_beats` handler
- `src/state/project-state.ts:68` — `readComposition()` called by the tool handler
- `src/server.ts:15–18` — Phase 3 import block where `registerAnalyzeBeats` is added
- `src/server.ts:49–50` — Phase 3 registration block where `registerAnalyzeBeats(server)` is called
- `docs/planning/remotion-mcp-server.md` — master project spec and original audio system design
- [music-tempo npm package](https://www.npmjs.com/package/music-tempo) — Beatroot beat detection
- [web-audio-api npm package](https://www.npmjs.com/package/web-audio-api) — Node.js AudioContext polyfill
