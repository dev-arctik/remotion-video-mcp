// BeatSync v2 — tier-aware pulse provider for music-driven video.
// Accepts BeatDataV2 from analyze_beats (new schema) OR legacy v1 shapes.
// Pairs with useBeat() hook for filtered, tier-specific reactivity:
//
//   <BeatSync data={beatData}>
//     <Scene />
//   </BeatSync>
//
//   // inside Scene:
//   const { pulse, isOnBeat, isDownbeat } = useBeat({ tier: 'downbeat', tolerance: 2 });
//   const { pulse: subPulse } = useBeat({ tier: 'beat', decayFrames: 4 });
//
// Backward compatibility:
//   • Old prop name `beats` still accepted (aliased to `data`)
//   • Old data shape `{ bpm, beats: number[] }` auto-upgraded
//   • Old `useBeat()` (no args) returns same pulse + isOnBeat as before, just with ±1 frame tolerance instead of exact match
import React, { createContext, useContext, useMemo } from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

// ─── PUBLIC TYPES ──────────────────────────────────────────────────────

/** Full v2 schema — what analyze_beats writes today */
export interface BeatV2 {
  time: number;
  frame: number;
  beatNumber: number;
  barNumber: number;
  isDownbeat: boolean;
  confidence: number;
  bassEnergy: number;
}

export interface PhraseRange {
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  startBeatIndex: number;
  endBeatIndex: number;
}

export interface BeatDataV2 {
  schemaVersion: 2;
  bpm: number;
  beatCount: number;
  beatIntervalMs: number;
  durationSeconds: number;
  fps: number;
  beats: BeatV2[];
  beatFrames: number[];
  downbeatFrames: number[];
  phrases: {
    bar: PhraseRange[];
    fourBar: PhraseRange[];
    eightBar: PhraseRange[];
    sixteenBar: PhraseRange[];
  };
  suggestedSceneDurations: Record<string, { frames: number; seconds: number }>;
  stats: {
    avgConfidence: number;
    minBeatGap: number;
    maxBeatGap: number;
    beatGapStdDev: number;
    downbeatPhase: number;
    downbeatStrength: number;
  };
}

/** Legacy shape — preserved for back-compat with old sidecar JSONs */
export interface BeatDataV1 {
  bpm: number;
  beats: number[] | Array<{ time?: number; frame: number }>;
}

export type BeatData = BeatDataV2 | BeatDataV1;

// ─── NORMALIZATION ─────────────────────────────────────────────────────

interface NormalizedBeats {
  bpm: number;
  fps: number;
  beatFrames: number[];
  downbeatFrames: number[];
  beats: BeatV2[];
  phrases: BeatDataV2['phrases'];
  raw: BeatData;
}

function isV2(data: BeatData): data is BeatDataV2 {
  return (data as BeatDataV2).schemaVersion === 2;
}

function normalize(data: BeatData, fpsHint: number): NormalizedBeats {
  if (isV2(data)) {
    return {
      bpm: data.bpm,
      fps: data.fps,
      beatFrames: data.beatFrames,
      downbeatFrames: data.downbeatFrames,
      beats: data.beats,
      phrases: data.phrases,
      raw: data,
    };
  }
  // V1 — synthesize the missing fields
  const rawBeats = data.beats;
  const beatFrames: number[] = rawBeats.map((b: number | { frame: number }) =>
    typeof b === 'number' ? b : b.frame,
  );
  // Synthesize downbeats as every 4th beat starting from index 0 (no bass info available)
  const downbeatFrames = beatFrames.filter((_, i) => i % 4 === 0);
  const beats: BeatV2[] = beatFrames.map((frame, i) => ({
    time: frame / fpsHint,
    frame,
    beatNumber: (i % 4) + 1,
    barNumber: Math.floor(i / 4),
    isDownbeat: i % 4 === 0,
    confidence: 0.7,
    bassEnergy: 0,
  }));
  return {
    bpm: data.bpm,
    fps: fpsHint,
    beatFrames,
    downbeatFrames,
    beats,
    phrases: { bar: [], fourBar: [], eightBar: [], sixteenBar: [] },
    raw: data,
  };
}

// ─── CONTEXT ───────────────────────────────────────────────────────────

interface BeatContextValue {
  normalized: NormalizedBeats | null;
}

const BeatContext = createContext<BeatContextValue>({ normalized: null });

// ─── BeatSync PROVIDER ─────────────────────────────────────────────────

export interface BeatSyncProps {
  /** Beat data — pass v2 (preferred) or legacy v1 shape */
  data?: BeatData;
  /** Legacy alias for `data` — kept for back-compat */
  beats?: BeatData;
  /** Optional fps hint when passing v1 data without it (defaults to 30) */
  fps?: number;
  /** Optional scale pulse on the wrapper itself (1.0 = no scaling) */
  pulseScale?: number;
  /** Scale pulse decay frames (default 8) */
  pulseDecayFrames?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const BeatSync: React.FC<BeatSyncProps> = ({
  data,
  beats,
  fps = 30,
  pulseScale = 1.0,
  pulseDecayFrames = 8,
  children,
  style = {},
}) => {
  const beatData = data ?? beats;
  const frame = useCurrentFrame();

  const normalized = useMemo(() => {
    if (!beatData) return null;
    return normalize(beatData, fps);
  }, [beatData, fps]);

  // Optional wrapper-level scale pulse (unchanged from v1 behavior)
  let scale = 1;
  if (pulseScale !== 1.0 && normalized) {
    const last = lastBeatBefore(normalized.beatFrames, frame);
    const since = last >= 0 ? frame - normalized.beatFrames[last] : Infinity;
    if (since <= pulseDecayFrames) {
      const p = interpolate(since, [0, pulseDecayFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      scale = 1 + (pulseScale - 1) * p;
    }
  }

  return (
    <BeatContext.Provider value={{ normalized }}>
      <div
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          willChange: pulseScale !== 1.0 ? 'transform' : undefined,
          ...style,
        }}
      >
        {children}
      </div>
    </BeatContext.Provider>
  );
};

// ─── useBeat HOOK — tier-aware filtering ───────────────────────────────

export type BeatTier =
  | 'beat'        // every detected beat (default)
  | 'downbeat'    // only beat 1 of each bar (4/4 assumed)
  | 'phrase-1'    // every 1 bar (= every 4 beats from first downbeat) — same as downbeat
  | 'phrase-4'    // every 4 bars (16 beats)
  | 'phrase-8'    // every 8 bars (32 beats)
  | 'phrase-16'  // every 16 bars (64 beats)
  ;

export interface UseBeatOptions {
  /** Which beat tier to track (default: 'beat') */
  tier?: BeatTier;
  /** Subselect every Nth beat in the chosen tier (e.g. every: 2 with tier: 'beat' = every other beat) */
  every?: number;
  /** Offset (in tier units) before the first beat fires (default: 0) */
  offset?: number;
  /** Frames considered "on the beat" — pulse is 1 within this window (default: 1) */
  tolerance?: number;
  /** Frames the pulse takes to decay back to 0 after a beat (default: 8) */
  decayFrames?: number;
}

export interface UseBeatResult {
  /** 0..1 pulse — 1 at the beat (within tolerance), decays linearly over decayFrames */
  pulse: number;
  /** True when current frame is within ±tolerance of a beat in the selected tier */
  isOnBeat: boolean;
  /** Index of the most recent beat in the selected tier (-1 before first beat) */
  beatIndex: number;
  /** True if the current beat (in any tier) is a downbeat (beat 1 of a bar) */
  isDownbeat: boolean;
  /** Current bar number (0-indexed) — derived from the underlying beat track, NOT the selected tier */
  barIndex: number;
  /** Frames since the last beat in the selected tier (Infinity before first beat) */
  framesSinceLast: number;
  /** Frames until the next beat in the selected tier (Infinity after last beat) */
  framesUntilNext: number;
  /** Detected BPM */
  bpm: number;
  /** Confidence (0..1) of the most recent beat — useful to fade effects when beat tracking is uncertain */
  confidence: number;
  /** Beat frames matching the chosen tier (read-only convenience) */
  tierFrames: number[];
}

const EMPTY_RESULT: UseBeatResult = {
  pulse: 0,
  isOnBeat: false,
  beatIndex: -1,
  isDownbeat: false,
  barIndex: -1,
  framesSinceLast: Infinity,
  framesUntilNext: Infinity,
  bpm: 0,
  confidence: 0,
  tierFrames: [],
};

function lastBeatBefore(frames: number[], current: number): number {
  // Binary search for the largest index where frames[i] <= current
  let lo = 0;
  let hi = frames.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid] <= current) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function selectTierFrames(
  normalized: NormalizedBeats,
  tier: BeatTier,
  every: number,
  offset: number,
): number[] {
  let base: number[];
  switch (tier) {
    case 'beat':
      base = normalized.beatFrames;
      break;
    case 'downbeat':
    case 'phrase-1':
      base = normalized.downbeatFrames;
      break;
    case 'phrase-4':
      base = normalized.phrases.fourBar.map((p) => p.startFrame);
      // Fallback: if v2 data missing, derive every 16 beats from beatFrames
      if (base.length === 0) base = normalized.beatFrames.filter((_, i) => i % 16 === 0);
      break;
    case 'phrase-8':
      base = normalized.phrases.eightBar.map((p) => p.startFrame);
      if (base.length === 0) base = normalized.beatFrames.filter((_, i) => i % 32 === 0);
      break;
    case 'phrase-16':
      base = normalized.phrases.sixteenBar.map((p) => p.startFrame);
      if (base.length === 0) base = normalized.beatFrames.filter((_, i) => i % 64 === 0);
      break;
    default:
      base = normalized.beatFrames;
  }
  if (every === 1 && offset === 0) return base;
  const out: number[] = [];
  for (let i = offset; i < base.length; i += every) out.push(base[i]);
  return out;
}

/**
 * Returns reactive beat state for the current frame, filtered to the chosen tier.
 * Must be called inside a <BeatSync> wrapper.
 */
export function useBeat(opts: UseBeatOptions = {}): UseBeatResult {
  const { tier = 'beat', every = 1, offset = 0, tolerance = 1, decayFrames = 8 } = opts;
  const { normalized } = useContext(BeatContext);
  const frame = useCurrentFrame();

  if (!normalized || normalized.beatFrames.length === 0) return EMPTY_RESULT;

  const tierFrames = selectTierFrames(normalized, tier, every, offset);
  if (tierFrames.length === 0) return { ...EMPTY_RESULT, bpm: normalized.bpm };

  const idx = lastBeatBefore(tierFrames, frame);
  const lastFrame = idx >= 0 ? tierFrames[idx] : -Infinity;
  const nextFrame = idx + 1 < tierFrames.length ? tierFrames[idx + 1] : Infinity;
  const framesSinceLast = idx >= 0 ? frame - lastFrame : Infinity;
  const framesUntilNext = nextFrame - frame;

  // isOnBeat: within ±tolerance of either the previous or upcoming beat
  const onPrevious = framesSinceLast <= tolerance;
  const onNext = framesUntilNext <= tolerance;
  const isOnBeat = onPrevious || onNext;

  // Pulse: 1 within tolerance window, decays linearly over decayFrames after that.
  // We measure decay from the last beat (or the next beat if we're approaching it).
  let pulse = 0;
  if (onPrevious) {
    pulse = framesSinceLast <= decayFrames
      ? interpolate(framesSinceLast, [0, decayFrames], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;
  } else if (framesSinceLast <= decayFrames) {
    pulse = interpolate(framesSinceLast, [0, decayFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  // Look up the underlying BeatV2 entry (in the full beats array, not the filtered tier)
  // for richer fields like isDownbeat, confidence, barIndex.
  const fullBeatIdx = lastBeatBefore(normalized.beatFrames, frame);
  const fullBeat = fullBeatIdx >= 0 ? normalized.beats[fullBeatIdx] : null;

  return {
    pulse,
    isOnBeat,
    beatIndex: idx,
    isDownbeat: fullBeat ? fullBeat.isDownbeat : false,
    barIndex: fullBeat ? fullBeat.barNumber : -1,
    framesSinceLast,
    framesUntilNext,
    bpm: normalized.bpm,
    confidence: fullBeat ? fullBeat.confidence : 0,
    tierFrames,
  };
}

/**
 * Returns the full normalized beat data — for power users who need the raw
 * arrays (e.g. to drive Stagger delays from beat positions).
 */
export function useBeatGrid(): NormalizedBeats | null {
  return useContext(BeatContext).normalized;
}

// ─── BACKWARD-COMPAT EXPORTS ───────────────────────────────────────────
// Old code that imported BeatContextValue or used the old ctx shape.
export interface BeatContextValueLegacy {
  pulse: number;
  isOnBeat: boolean;
  beatIndex: number;
  beatData: { bpm: number; beats: number[] };
}
