---
**Last Updated:** 2026-04-23
**Status:** Active
**Type:** Research
**Author:** Devansh Raj
---

# Audio-Driven Video Transitions — Research & v2 Roadmap

## TL;DR

The current beat analysis stack uses BeatRoot (2001), a pre-deep-learning algorithm that does single-pass global tempo induction. It misses downbeats, collapses verse/chorus boundaries into undifferentiated beat arrays, and produces octave errors on anything outside clean 4-on-floor EDM. The `BeatSync` primitive's consumer API also has a critical type mismatch with the sidecar JSON produced by `analyze_beats`. The fix is a two-part effort: (1) replace the BPM/beat backend with Beat This! (2024 SOTA, ~90% F1) via a Python subprocess, and (2) redesign the sidecar schema to carry downbeat markers, phrase boundaries, and a tier field so `BeatSync` can express "cut on bar 1, effect on every beat, micro-jitter on every 16th." The current Meyda-based frequency analysis in `analyze_audio` is sound and should be kept — the gap there is that its onset events are not snapped onto the beat grid, which is fixable without replacing the library.

---

## 1. Current Implementation Audit

### Files and Responsibilities

| File | Role | Key lines |
|---|---|---|
| `src/utils/beat-analysis.ts` | Core BPM + beat detection | L1-98 |
| `src/utils/audio-analysis.ts` | Meyda FFT + onset event detection + BPM compat wrapper | L1-453 |
| `src/tools/analyze-beats.ts` | MCP tool wrapper around `analyzeBeats()` | L1-153 |
| `src/tools/analyze-audio.ts` | MCP tool wrapper around `analyzeAudio()` | L1-184 |
| `src/primitives/BeatSync.tsx` | React primitive — consumes beat frame array, emits pulse | L1-98 |
| `src/primitives/AudioReactive.tsx` | React primitive — real-time FFT via `@remotion/media-utils` | L1-109 |

### Audio Decode Path

Both `beat-analysis.ts` and `audio-analysis.ts` duplicate the same decode step: file Buffer → `web-audio-api` `AudioContext.decodeAudioData()` → stereo averaged to mono Float32Array (`beat-analysis.ts:18-43`, `audio-analysis.ts:67-93`). This means every `analyze_audio` call decodes PCM twice — once for Meyda, once for BeatRoot inside `detectBPM()` at `audio-analysis.ts:346-373`.

### BeatData Schema (current)

Defined at `src/utils/beat-analysis.ts:5-15`:

```typescript
export interface BeatData {
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

No confidence score. No downbeat flag. No bar/phrase structure. No tier distinction between downbeats, quarter-beats, and sub-beats.

### The Type Mismatch Bug

`BeatSync.tsx:8` declares its `BeatData` interface as:

```typescript
beats: number[];   // beat timestamps as frame numbers
```

But `analyze_beats` returns `beats: Array<{ time: number; frame: number }>`. Any component using both the sidecar JSON directly as a `BeatSync` prop will get `undefined` when it tries to call `beats.beats[i]` as a number. Consumers must manually map `beatData.beats.map(b => b.frame)` before passing to `<BeatSync>`. This is not documented anywhere.

### What BeatRoot (music-tempo) Actually Does

`src/utils/beat-analysis.ts:79`:

```typescript
const mt = new MusicTempo(pcmData, params);
```

BeatRoot (Simon Dixon, 2001) runs in two stages:
1. Onset detection via spectral difference of short-time energy.
2. Tempo induction via inter-onset-interval (IOI) clustering → multi-agent beat tracking.

BPM is extracted as a global estimate (`mt.tempo`). Beat timestamps are `mt.beats` — an array of seconds that is already a single flat tier (no hierarchy).

BPM range is constrained via beat interval translation: `params.minBeatInterval = 60 / bpmRange.max` (`beat-analysis.ts:75-76`). Default range is 60-200 BPM (configured in `analyze-beats.ts:35-36`).

### What Meyda Does (audio-analysis.ts)

`audio-analysis.ts:95-154` splits audio into `sampleRate/fps`-sized frames, runs `Meyda.extract(['powerSpectrum', 'rms'])` on each, then maps power spectrum bins into four bands:

| Band | Hz range |
|---|---|
| Bass | 20-200 Hz |
| Mids | 200-2000 Hz |
| Highs | 2000-8000 Hz |
| Air | 8000-20000 Hz |

Event detection (`audio-analysis.ts:158-306`) fires on frame-over-frame energy deltas: bass-drop, impact, transient, silence-break, build-start/peak, energy-shift. Thresholds are conservative by default (`bassThreshold: 0.55`, `impactThreshold: 0.70`). Events are NOT snapped to the beat grid — a bass-drop at frame 87 could be ±3 frames away from the nearest beat at frame 84.

### Known Failure Modes

1. **Octave errors** — BeatRoot frequently returns half or double the real tempo (e.g., 64 BPM when the track is 128 BPM). Documented in the academic literature; the `bpmRange` guard only partially helps.
2. **Tempo drift** — BeatRoot picks one global BPM. Any track that shifts tempo (a common trailer music trick: slow intro → double-time drop) produces a desync beat grid after the transition point.
3. **Downbeat blindness** — the output has no concept of bar 1. "Cut on the one" — the most fundamental editing rule — is impossible without manual arithmetic.
4. **Granularity** — only quarter-note beat level. No 8th notes, 16th notes, or phrase markers (every 4/8/16 bars).
5. **Weak transient tracks** — jazz, acoustic, ambient, heavily compressed modern pop all produce sparse or incorrect beat timestamps because BeatRoot relies on energy spikes that may be attenuated.
6. **`isOnBeat` fragility** — `BeatSync.tsx:68`: `const isOnBeat = framesSinceBeat === 0`. A 1-frame slip between render fps rounding and actual beat position means `isOnBeat` fires zero times on that beat.
7. **Frame rounding drift** — `beat-analysis.ts:84`: `Math.round(time * fps)` with no sub-frame compensation. At 30fps, 1 frame = 33ms; the ear detects misalignment above ~20ms. Over a 3-minute track this drift compounds.
8. **Double PCM decode** — `analyze_audio` decodes audio twice when BPM is requested (Meyda pass + BeatRoot pass), wasting ~200ms-1s per call.

---

## 2. Audio Analysis Fundamentals

Understanding why the current approach fails requires a working model of how frequency-domain audio analysis works.

### The FFT and STFT

A Fast Fourier Transform (FFT) decomposes N time-domain samples into N/2+1 frequency bins. Resolution is a trade-off:

| Window (n_fft) | Time res @44.1kHz | Freq resolution | Best for |
|---|---|---|---|
| 512 | 11.6ms | 86 Hz/bin | Fast percussion, speech |
| 1024 | 23.2ms | 43 Hz/bin | General onset detection |
| 2048 | 46.4ms | 21.5 Hz/bin | Music analysis (librosa default) |
| 4096 | 92.9ms | 10.8 Hz/bin | Pitch and harmony |

A Short-Time Fourier Transform (STFT) slides the FFT window across the signal with a fixed hop length (typically 50-75% overlap) to get a 2D time × frequency representation. The Meyda implementation in `audio-analysis.ts:103-106` uses `sampleRate/fps` as the buffer size and rounds up to the next power of 2 — so at 30fps and 44.1kHz, that's `ceil(1470) = 2048`. Hop = 1 frame = zero overlap. This is coarser than standard onset detection practice, which is one reason events can feel "late" by a frame or two.

### Frequency Bands and What They Mean for Video

The practical mapping from frequency bands to visual effects that editors use:

| Band | Hz range | Drum source | Video effect |
|---|---|---|---|
| Sub-bass | 20-60 | Kick fundamental, 808 sub | Waveform visualizers only — not perceptually present |
| Bass | 60-250 | Kick body/thump, bass guitar | Camera shake, scale punch, low-freq flicker |
| Low-mids | 250-500 | Snare body, low vocals | Color saturation shifts |
| Mids | 500-2k | Vocal body, guitar fundamentals | Foreground text animation, focus pull |
| High-mids | 2k-4k | Snare attack, kick beater click | Flash frame, hard cut trigger |
| Presence | 4k-6k | Vocal articulation, guitar bite | Particle burst, edge glow |
| Sibilance | 6k-8k | "S/T/Sh" sibilance | Hi-hat jitter, micro-shimmer |
| Brilliance | 8k-12k | Hi-hat sizzle, cymbal shimmer | Light flicker, sparkle overlay |
| Air | 12k-20k | Cymbal wash | Background texture, tape hiss |

The `AudioReactive.tsx` primitive (`L77-85`) splits its `numberOfSamples` bins into three equal slices: bottom quarter = bass, middle half = mids, top quarter = highs. At the default 128 bins this produces: bins 0-31 as "bass," 32-95 as "mids," 96-127 as "highs." This is a coarse but serviceable split for real-time effects.

### Onset Detection Methods

Onset = the start of a musical note or percussion hit. Methods ranked from simple to accurate:

| Method | Approach | Strengths | Weaknesses |
|---|---|---|---|
| Energy-based | First derivative of RMS | Simple, fast | Misses soft onsets, noisy on sustained instruments |
| Spectral flux | Sum of positive bin-to-bin magnitude differences | General-purpose default | Phase-sensitive, can miss masked transients |
| High-frequency content (HFC) | Magnitudes weighted by bin frequency | Biased toward percussion — good for kick/snare | Misses tonal onsets |
| Complex domain | Magnitude + phase deviation | Catches soft tonal onsets | More compute |
| RNN (madmom, Beat This) | Bidirectional LSTM trained on annotated data | SOTA across genres, handles polyphony | Requires Python, model weights |

Current implementation: energy deltas on normalized per-band averages (`audio-analysis.ts:179-188`). This is closest to energy-based onset detection — fast, but misses soft onsets and produces false positives on heavily compressed music where RMS variance is low.

### Why BPM Detection Fails

The standard pipeline for BPM is: onset detection function → autocorrelation over 6-8 second windows → peak in the autocorrelation = period = BPM. BeatRoot wraps this with multi-agent tracking to handle metrical ambiguity. The fundamental weakness is that autocorrelation is equally strong at integer multiples and integer fractions of the real period — hence octave errors at 2× and 0.5× the detected BPM.

Beat This! (2024) replaces the entire pipeline with a convolutional + transformer model trained on annotated GTZAN, Ballroom, and SMC datasets. It takes a mel-spectrogram input and directly outputs beat and downbeat probability time series, then applies a simple peak-picker rather than a DBN. F1 score on standard benchmarks: ~88-92% beats, ~75-80% downbeats, vs ~60-70% / 0% for BeatRoot.

---

## 3. Beat Detection: State of the Art in 2026

### Library Comparison

| Library | Algorithm | Online? | Downbeats | License | Pure JS? | Beats F1 | Downbeats F1 |
|---|---|---|---|---|---|---|---|
| **Beat This!** (RECOMMENDED) | Conv + Transformer, no DBN | Offline | Yes | MIT | No (ONNX/Python) | ~90% | ~78% |
| **BeatNet** | CRNN + particle filter | Both | Yes | CC-BY 4.0 | No (Python) | ~86% | ~71% |
| **Madmom** | Bidirectional RNN + DBN | Offline | Yes | BSD-3 | No (Python, dormant) | ~87% | ~72% |
| **BEAST** | Streaming transformer | Online | Yes | Research | No | ~53% | (streaming only) |
| **Essentia.js** | RhythmExtractor2013 | Offline | No | AGPL | Yes (WASM) | ~77% | — |
| **librosa** | DP beat tracking + PLP | Offline | No | ISC | No (Python) | ~50-60% | — |
| **music-tempo (current)** | BeatRoot (2001) | Offline | No | MIT | Yes | ~60-70% | — |

### Why Beat This! is the Right Choice

1. **ISMIR 2024 paper ("Beat This!"** by Heydari et al.) demonstrates SOTA with a simpler architecture than madmom — no DBN, no HMM. Faster inference.
2. MIT license — no commercial constraints.
3. Outputs both `beats` and `downbeats` as arrays, enabling the tier-aware schema we need.
4. Pre-trained ONNX weights available — runnable without GPU.
5. Matches our pattern of calling external tools via `execa` (we already use it for the Remotion CLI).

### Integration Options

**Option A — Python subprocess (recommended for v2):**
Spawn `beat-this` CLI from Node via `execa`. Write beat JSON to a temp file, read it back. Adds a Python 3.10+ dependency but is the fastest path to SOTA accuracy.

```bash
pip install beat-this
beat-this my-track.mp3 --output beats.json
```

Pro: 0 TS code for the model itself. Con: user must have Python + pip. Mitigated by adding a `check_audio_deps` MCP tool that verifies Python and `beat-this` are available before analysis.

**Option B — ONNX in Node:**
Run Beat This's ONNX model weights via `onnxruntime-node`. Requires writing a TypeScript mel-spectrogram preprocessor (STFT + mel filterbank) and a post-processing peak-picker. ~200-400 lines of TS. No Python dependency. Higher engineering cost but fully self-contained.

**Option C — Keep Essentia.js as fallback:**
If neither Python nor ONNX is available, fall back to Essentia's `RhythmExtractor2013` WASM module. Better than BeatRoot, AGPL is a concern for closed-source users.

**Option D — Keep music-tempo as-is + improve schema:**
Cheapest option. Fixes the type mismatch and adds phrase grouping without changing the detector. Accuracy remains ~60-70% with octave error risk. Acceptable only if the v2 detector integration is explicitly out of scope.

---

## 4. On-Point Transition Patterns

### The Editor's Beat Hierarchy

Every professional NLE (Final Cut Pro, DaVinci Resolve, Premiere) expresses beat markers in at least two tiers: minor (every quarter-note beat) and major (downbeats / song-part boundaries). The editing rationale:

| Audio event | Visual response | Mechanism |
|---|---|---|
| Downbeat (bar 1) | Major scene change | Brain reads bar-1 as "new sentence" — strongest anchor point |
| Every 4-8 bars | Section change (verse → chorus) | Phrase-aligned changes feel inevitable rather than arbitrary |
| Snare / backbeat (beats 2 & 4) | Hard cuts within a shot family, B-roll inserts | Snare = the punch |
| Kick (transient) | Camera shake, scale punch (1.0→1.05→1.0 over 3-5 frames) | Bass = body response |
| Hi-hat / 16th notes | Micro-jitter, light flicker, particle bursts | High-freq = nervous system texture |
| Vocal onset | Lyric reveal, focus pull | Vocal = attention anchor |
| Drop | White-flash (1 frame, 50% alpha) + color palette swap + scale punch | Maximum compounding on one frame |
| Build-up (riser) | Speed ramp slowing into drop frame | Tension as physical compression |

### Tempo-Based Transition Duration Rules

| BPM range | Transition style | Duration at 30fps |
|---|---|---|
| ≤90 (slow ballad, lo-fi) | Crossfade or dissolve | 12-20 frames (0.4-0.7s) |
| 91-120 (mid-tempo, hip-hop) | Fast dissolve or hard cut | 6-10 frames |
| 121-140 (house, pop) | Hard cut, optional 2-frame whip pan blur | 0-2 frames |
| ≥141 (drum & bass, hardstyle) | Hard cut only, snap to nearest frame | 0 frames |

At fast tempos, dissolves smear transients — the brain experiences a cut + beat transient as a single unified event; a dissolve uncouples them.

### Five Rules That Actually Matter

1. **Cut just before the downbeat** — a 1/16-note (2 frames at 120 BPM / 30fps) lift before bar 1 reads more interesting than landing exactly on frame 0. This is why "beat-snapped" cuts from BeatRoot feel slightly mechanical.
2. **Hard cuts beat dissolves on beats** — reserve dissolves for time-of-day or mood transitions where the audio also changes character.
3. **Frame accuracy beats beat accuracy** — at 30fps, 1 frame = 33ms. The ear detects misalignment at ~20ms. The BeatRoot `Math.round(time * fps)` without sub-frame guards creates exactly this kind of perceptual drift at high frame counts.
4. **Don't beat-cut everything** — break the rhythm deliberately every 8-12 bars for breathing room. Constant beat-cuts cause fatigue.
5. **Speed ramp into a drop** — `1× → 0.5× → 0.25×` over the last 8 beats of a build, landing at `1×` on the drop frame. Currently not implementable without downbeat awareness.

### Effect-Trigger Map for AudioReactive

The `AudioReactive` primitive (`src/primitives/AudioReactive.tsx`) exposes `bassIntensity`, `midIntensity`, `highIntensity`, and `isDropping`. Suggested mappings:

| `AudioReactive` field | Visual effect | Implementation note |
|---|---|---|
| `bassIntensity` | `scale(1 + bassIntensity * 0.08)` | Subtle pulse on every kick — scale clamp at 1.08 |
| `bassIntensity` | `translateY(-bassIntensity * 6px)` | Camera shake approximation |
| `midIntensity` | `hue-rotate(midIntensity * 30deg)` | Color breathing on vocal lines |
| `highIntensity` | Particle opacity or shimmer | Hi-hat sizzle → sparkle |
| `isDropping` (current threshold: 0.15) | Flash frame | Threshold is low — produces too many "drops" on busy mixes |
| `overallEnergy` | Background blur radius | `blur(${(1 - overallEnergy) * 4}px)` — focus sharpens on loud frames |

The `isDropping` threshold at `AudioReactive.tsx:93` (`bassIntensity > 0.15`) is aggressive for compressed modern music where bass rarely dips below 0.15 during quiet sections. Recommend raising to 0.4-0.5 or making it configurable via prop.

---

## 5. Recommendations for v2

### Priority 1 — Fix the Type Mismatch (1 hour, no new deps)

`BeatSync.tsx:8` expects `beats: number[]` but `analyze_beats` produces `beats: Array<{ time: number; frame: number }>`. Fix by either:
- Updating `BeatSync.BeatData` to match the sidecar schema (preferred — keeps richer data available).
- Adding a `.map(b => b.frame)` call at the usage site and documenting it.

This is a silent bug that causes `isOnBeat` to always be `false` when a developer loads the sidecar JSON directly.

### Priority 2 — Redesign the Sidecar Schema (2-3 hours)

Add `isDownbeat`, `beatNumber`, `barNumber`, and `tier` to each beat entry. Add a `phrases` section. This schema works with both the current BeatRoot backend and the v2 Beat This backend — it's a non-breaking improvement.

```json
{
  "bpm": 128.0,
  "duration_seconds": 180.5,
  "beats": [
    {
      "time": 0.469,
      "frame": 14,
      "isDownbeat": true,
      "beatNumber": 1,
      "barNumber": 1,
      "tier": "downbeat"
    },
    {
      "time": 0.938,
      "frame": 28,
      "isDownbeat": false,
      "beatNumber": 2,
      "barNumber": 1,
      "tier": "beat"
    }
  ],
  "phrases": {
    "fourBeat":    [{ "startFrame": 14, "endFrame": 56, "barNumber": 1 }],
    "eightBeat":   [{ "startFrame": 14, "endFrame": 112, "barNumber": 1 }],
    "sixteenBeat": [{ "startFrame": 14, "endFrame": 224, "barNumber": 1 }]
  }
}
```

Note: BeatRoot cannot produce `isDownbeat` or `barNumber`. For the transition period, these fields would be `false` / inferred by position in beat array (every 4th beat = downbeat assumption). Full accuracy requires Beat This backend (Priority 4).

### Priority 3 — Tier-Aware BeatSync API (3-4 hours)

Extend `BeatSync.tsx` to accept a `tier` filter prop:

```typescript
interface BeatSyncProps {
  beats: BeatData;            // rich sidecar schema
  tier?: 'downbeat' | 'beat' | 'all';  // which tier to pulse on
  decayFrames?: number;
  pulseScale?: number;
  children: React.ReactNode;
}
```

With this, common editor patterns become composable:

```tsx
// Scene cuts only on bar 1 (downbeat)
<BeatSync beats={beatData} tier="downbeat" pulseScale={1.0}>
  <SceneTransitionWrapper />
</BeatSync>

// Scale pulse on every quarter beat
<BeatSync beats={beatData} tier="beat" pulseScale={1.05} decayFrames={6}>
  <Logo />
</BeatSync>
```

### Priority 4 — Replace BeatRoot with Beat This (1-2 days, Python path)

Add a `check_audio_deps` MCP tool that verifies `python3` and `beat-this` are installed. Update `analyze_beats` to try Beat This first, fall back to BeatRoot with a warning if the Python path is unavailable. Store downbeat data from Beat This output directly in the tier-aware schema.

The detection function in `src/utils/beat-analysis.ts` would become:

```typescript
async function detectBeatsWithBeatThis(
  audioPath: string,
  fps: number,
): Promise<TieredBeatData>
```

Using `execa` (already a dependency, `package.json:31`):

```typescript
import { execa } from 'execa';

const result = await execa('beat-this', [audioPath, '--output', tempJsonPath]);
const raw = await fs.readJson(tempJsonPath);
// map raw.beats + raw.downbeats → TieredBeatData
```

### Priority 5 — Snap Onset Events to Beat Grid (2-3 hours)

After `analyzeAudio()` produces its event list, run a post-processing step that snaps each event's frame to the nearest beat frame (within ±3 frames tolerance). If a bass-drop at frame 87 is within 3 frames of beat at frame 84, snap it to 84. This makes `suggestedSceneCuts` actually align with the beat grid rather than appearing between beats.

Add to `audio-analysis.ts` after `deriveCutPoints`:

```typescript
function snapEventsToBeatGrid(
  events: AudioEvent[],
  beats: Array<{ frame: number }>,
  toleranceFrames = 3,
): AudioEvent[]
```

### Priority 6 — Fix isDropping Threshold in AudioReactive

Change `AudioReactive.tsx:93` from hardcoded `0.15` to a configurable prop with a more conservative default:

```typescript
interface AudioReactiveProps {
  dropThreshold?: number;  // default: 0.45
  ...
}
// isDropping: bassIntensity > dropThreshold
```

---

## 6. Migration Path

The changes above are layered to avoid breaking existing projects. All existing `analyze_beats` sidecar files (`.../assets/audio/<name>-beats.json`) remain loadable — schema additions are all additive.

### Step 1 — Non-breaking fixes (no migration needed)
- Fix `BeatSync.BeatData` type mismatch.
- Add `dropThreshold` prop to `AudioReactive`.
- Raise default `isDropping` threshold.

### Step 2 — Schema upgrade (additive, backward compatible)
- Extend `BeatData` interface with optional `isDownbeat`, `beatNumber`, `barNumber`, `tier`, `phrases`.
- Update `beat-analysis.ts:analyzeBeats()` to infer downbeats by position (every 4th beat) for existing BeatRoot backend.
- Update `analyze-beats.ts` to write new schema fields to sidecar.
- Old sidecars without these fields remain loadable — `BeatSync` falls back to treating all beats equally.

### Step 3 — Tier-aware BeatSync
- Add `tier` prop with default `'all'` (backward compatible — existing `<BeatSync>` usage unchanged).

### Step 4 — Beat This integration
- Add `check_audio_deps` MCP tool.
- Add `useBeaThis` flag to `analyze_beats` tool input schema (opt-in).
- Implement Python subprocess path in `beat-analysis.ts`.
- When Beat This is used, write real `isDownbeat` values from model output.
- Document Python setup requirement in project README.

### Step 5 — Onset event snapping
- Add `snapEventsToBeatGrid` to `audio-analysis.ts`.
- Call it as a post-processing step at `audio-analysis.ts:407` (after `deriveCutPoints`).

---

## 7. Open Questions

1. **Python subprocess vs ONNX in Node** — The Python subprocess path is faster to implement and produces SOTA accuracy. The ONNX path is self-contained but requires a ~300-line TypeScript mel-spectrogram preprocessor. Which matters more for this project: zero extra deps or faster implementation timeline?

2. **Downbeat inference from BeatRoot** — For the transition period before Beat This is integrated, should downbeats be inferred as "every 4th beat starting from the first" (correct for 4/4 music) or not exposed at all (to avoid misleading data for non-4/4 tracks)?

3. **Should music-tempo be kept as a fallback?** — If Beat This requires Python and the user doesn't have it, keeping BeatRoot as a fallback maintains functionality at reduced accuracy. Alternatively, the tool could return a clear error with setup instructions rather than silently degrading.

4. **Hop size for Meyda** — The current implementation in `audio-analysis.ts:103` uses 0% overlap (1 frame = 1 analysis window). Standard onset detection uses 50-75% overlap for finer time resolution. Adding overlap would improve event timing accuracy but increase compute proportionally. Is the ~2-3× slowdown acceptable?

5. **`@remotion/media-utils` WAV limitation** — `useWindowedAudioData` only supports `.wav` files for windowed analysis. MP3/AAC support requires the full `useAudioData` which loads the entire file into memory. Should the `AudioReactive` primitive document this limitation or add a format check?

---

## 8. Sources

- Dixon, S. (2001). *Automatic extraction of tempo and beat from expressive performances*. Journal of New Music Research, 30(1), 39-58. — Original BeatRoot paper.
- Heydari, S., Weiß, C., Arzt, A., & Böck, S. (2024). *Beat This! Accurate Beat Tracking Without DBN Postprocessing*. ISMIR 2024. — Beat This! paper.
- Böck, S., Korzeniowski, F., Schlüter, J., Krebs, F., & Widmer, G. (2016). *Madmom: A new Python Audio and Music Signal Processing Library*. ACM MM.
- Böck, S., & Schedl, M. (2011). *Enhanced beat tracking with context-aware neural networks*. DAFx.
- Final Cut Pro 12 Beat Detection documentation — two-tier marker model.
- DaVinci Resolve 20 AI Beat Detector — waveform snapping behavior.
- Meyda v5.6.3 API — `powerSpectrum`, `rms` extractors. https://meyda.js.org
- Remotion `@remotion/media-utils` — `useWindowedAudioData`, `visualizeAudio`. https://remotion.dev/docs/media-utils
- `music-tempo` v1.0.3 — https://github.com/killercrush/music-tempo
- `web-audio-api` v0.2.2 (Node polyfill) — https://github.com/audiojs/web-audio-api
