// Beat detection v2 — keeps music-tempo for BPM/beat positions, ADDS:
//   • Downbeat detection via bass-energy phase scoring (which beat-of-4 carries the kick?)
//   • Per-beat confidence based on interval consistency
//   • Phrase ranges (bar / 4-bar / 8-bar / 16-bar) with frame indices
//   • Tempo stability stats (gap stddev — flags rubato / drift)
//   • V1 schema fields preserved for backward compatibility
//
// Future upgrade path: swap detectBeatsCore() with Beat This! (ONNX) without
// changing the public schema. See docs/research/audio-driven-video-transitions.md.
import fs from 'fs-extra';
import { AudioContext } from 'web-audio-api';
import MusicTempo from 'music-tempo';

// ─── PUBLIC SCHEMA — v2 ────────────────────────────────────────────────

export interface BeatV2 {
  /** seconds from start of audio */
  time: number;
  /** rounded frame index at composition fps */
  frame: number;
  /** position in the bar (1..4 assuming 4/4) — 1 = downbeat */
  beatNumber: number;
  /** 0-indexed bar number this beat belongs to */
  barNumber: number;
  /** true when beatNumber === 1 (start of a bar) */
  isDownbeat: boolean;
  /** 0..1 — based on how regular the surrounding interval is */
  confidence: number;
  /** 0..1 — bass energy at this beat (used for downbeat detection, exposed for visuals) */
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

  /** Full beat array with downbeat + confidence info */
  beats: BeatV2[];

  /** Convenience flat arrays — frame indices only — for fast filtering in primitives */
  beatFrames: number[];
  downbeatFrames: number[];

  /** Phrase ranges grouped by length */
  phrases: {
    bar: PhraseRange[];        // every 1 bar (4 beats)
    fourBar: PhraseRange[];    // every 4 bars (16 beats)
    eightBar: PhraseRange[];   // every 8 bars (32 beats)
    sixteenBar: PhraseRange[]; // every 16 bars (64 beats)
  };

  /** Pre-computed scene durations for direct use in create_scene */
  suggestedSceneDurations: {
    '4-beat': { frames: number; seconds: number };
    '8-beat': { frames: number; seconds: number };
    '16-beat': { frames: number; seconds: number };
  };

  /** Tempo / detection quality stats */
  stats: {
    /** mean confidence across all beats (0..1) */
    avgConfidence: number;
    /** shortest gap between consecutive beats (seconds) */
    minBeatGap: number;
    /** longest gap (seconds) */
    maxBeatGap: number;
    /** standard deviation of beat gaps — high value = tempo drift / rubato */
    beatGapStdDev: number;
    /** offset (0..3) where downbeats start in the beat sequence */
    downbeatPhase: number;
    /** bass energy concentration ratio at the chosen downbeat phase (>1 = strong, ≤1 = weak/uncertain) */
    downbeatStrength: number;
  };
}

// ─── DECODE ────────────────────────────────────────────────────────────

interface DecodedAudio {
  pcm: Float32Array;
  sampleRate: number;
  durationSeconds: number;
}

function decodeAudio(fileBuffer: Buffer): Promise<DecodedAudio> {
  return new Promise((resolve, reject) => {
    const ctx = new AudioContext();
    ctx.decodeAudioData(
      fileBuffer,
      (audioBuffer) => {
        let pcm: Float32Array;
        if (audioBuffer.numberOfChannels >= 2) {
          const left = audioBuffer.getChannelData(0);
          const right = audioBuffer.getChannelData(1);
          pcm = new Float32Array(left.length);
          for (let i = 0; i < left.length; i++) pcm[i] = (left[i] + right[i]) / 2;
        } else {
          pcm = audioBuffer.getChannelData(0);
        }
        resolve({
          pcm,
          sampleRate: audioBuffer.sampleRate,
          durationSeconds: audioBuffer.duration,
        });
      },
      (err) => reject(new Error(`Failed to decode audio: ${err?.message ?? err}`)),
    );
  });
}

// ─── BASS ENERGY (for downbeat detection) ──────────────────────────────
// Computes RMS amplitude in a short window around each beat. Beats with
// higher bass energy are more likely to be on the kick (downbeat in pop/EDM).
//
// We compute on the full signal (not band-passed) — kick drums dominate the
// short-window RMS in most modern music. For acoustic / classical / ambient
// where kick isn't dominant, this heuristic is weaker but never worse than
// the simple "every 4th beat from 0" fallback.

function bassEnergyAt(pcm: Float32Array, sampleRate: number, timeSeconds: number, windowMs: number = 50): number {
  const center = Math.floor(timeSeconds * sampleRate);
  const half = Math.floor((windowMs / 1000) * sampleRate * 0.5);
  const start = Math.max(0, center - half);
  const end = Math.min(pcm.length, center + half);
  if (end <= start) return 0;
  let sumSq = 0;
  for (let i = start; i < end; i++) sumSq += pcm[i] * pcm[i];
  return Math.sqrt(sumSq / (end - start));
}

// ─── DOWNBEAT PHASE DETECTION ──────────────────────────────────────────
// For each candidate phase (0, 1, 2, 3), sum bass energy of beats at that phase.
// Phase with highest total is most likely the downbeat phase.

interface DownbeatResult {
  phase: number;
  strength: number; // ratio of best phase total / mean of others
}

function detectDownbeatPhase(beatBassEnergies: number[]): DownbeatResult {
  if (beatBassEnergies.length < 4) return { phase: 0, strength: 1 };

  const phaseSums = [0, 0, 0, 0];
  const phaseCounts = [0, 0, 0, 0];
  for (let i = 0; i < beatBassEnergies.length; i++) {
    const phase = i % 4;
    phaseSums[phase] += beatBassEnergies[i];
    phaseCounts[phase] += 1;
  }
  // Normalize to per-beat averages so phases with fewer beats aren't penalized
  const phaseAvgs = phaseSums.map((sum, i) => (phaseCounts[i] > 0 ? sum / phaseCounts[i] : 0));

  let bestPhase = 0;
  let bestAvg = phaseAvgs[0];
  for (let p = 1; p < 4; p++) {
    if (phaseAvgs[p] > bestAvg) {
      bestAvg = phaseAvgs[p];
      bestPhase = p;
    }
  }

  // Strength = best phase avg / mean of other 3 phases
  const otherAvg = phaseAvgs.filter((_, i) => i !== bestPhase).reduce((a, b) => a + b, 0) / 3;
  const strength = otherAvg > 0 ? bestAvg / otherAvg : 1;

  return { phase: bestPhase, strength };
}

// ─── CONFIDENCE SCORING ────────────────────────────────────────────────
// A beat's confidence is high when its surrounding gaps match the ideal interval.
// Endpoints get a fixed mid-confidence since they have no neighbor pair.

function computeConfidences(beatTimes: number[], idealInterval: number): number[] {
  return beatTimes.map((time, i) => {
    if (i === 0 || i === beatTimes.length - 1) return 0.85;
    const prevGap = time - beatTimes[i - 1];
    const nextGap = beatTimes[i + 1] - time;
    const avgGap = (prevGap + nextGap) / 2;
    const error = Math.abs(avgGap - idealInterval) / idealInterval;
    // 0% error → 1.0 confidence, 25% error → 0.0 confidence
    return Math.max(0, Math.min(1, 1 - error * 4));
  });
}

// ─── PHRASE COMPUTATION ────────────────────────────────────────────────
// Group beats into bars/phrases starting at the first downbeat.
// Phrases shorter than the requested length at the tail end are dropped.

function buildPhrases(beats: BeatV2[], beatsPerPhrase: number): PhraseRange[] {
  const phrases: PhraseRange[] = [];
  // Find first downbeat
  const firstDownbeatIdx = beats.findIndex((b) => b.isDownbeat);
  if (firstDownbeatIdx === -1) return phrases;

  for (let i = firstDownbeatIdx; i + beatsPerPhrase <= beats.length; i += beatsPerPhrase) {
    const start = beats[i];
    const end = beats[i + beatsPerPhrase - 1];
    phrases.push({
      startFrame: start.frame,
      endFrame: end.frame,
      startTime: start.time,
      endTime: end.time,
      startBeatIndex: i,
      endBeatIndex: i + beatsPerPhrase - 1,
    });
  }
  return phrases;
}

// ─── PHRASE DURATION HELPER (back-compat with v1) ──────────────────────

function beatPhraseDuration(beatsPerPhrase: number, bpm: number, fps: number): { frames: number; seconds: number } {
  const seconds = (beatsPerPhrase / bpm) * 60;
  return {
    frames: Math.round(seconds * fps),
    seconds: Math.round(seconds * 1000) / 1000,
  };
}

// ─── PUBLIC API ────────────────────────────────────────────────────────

/**
 * Analyze an audio file for BPM, beat positions, downbeats, and phrase structure.
 * Returns rich beat data ready for tier-aware consumption by BeatSync / useBeat.
 *
 * Algorithm summary:
 *   1. Decode audio → mono PCM
 *   2. Run music-tempo (BeatRoot) for BPM + beat positions
 *   3. Compute bass energy at each beat (50ms RMS window)
 *   4. Score 4 candidate downbeat phases (0/1/2/3) by per-beat avg bass energy
 *   5. Assign beatNumber + barNumber + isDownbeat to each beat
 *   6. Compute per-beat confidence from interval consistency
 *   7. Build phrase ranges (bar / 4-bar / 8-bar / 16-bar)
 */
export async function analyzeBeats(
  audioPath: string,
  fps: number,
  bpmRange?: { min?: number; max?: number },
): Promise<BeatDataV2> {
  const fileBuffer = await fs.readFile(audioPath);
  const { pcm, sampleRate, durationSeconds } = await decodeAudio(fileBuffer);

  // BPM detection — music-tempo expects beat intervals (seconds)
  const params: Record<string, number> = {};
  if (bpmRange?.max) params.minBeatInterval = 60 / bpmRange.max;
  if (bpmRange?.min) params.maxBeatInterval = 60 / bpmRange.min;
  const mt = new MusicTempo(pcm, params);

  const bpm = Math.round(mt.tempo * 10) / 10;
  const beatTimes = mt.beats as number[];
  const idealInterval = 60 / bpm;

  // Bass energy per beat — used for both downbeat detection AND visual reactivity
  const bassEnergies = beatTimes.map((time) => bassEnergyAt(pcm, sampleRate, time, 50));

  // Downbeat phase detection
  const { phase: downbeatPhase, strength: downbeatStrength } = detectDownbeatPhase(bassEnergies);

  // Per-beat confidence
  const confidences = computeConfidences(beatTimes, idealInterval);

  // Build BeatV2 array
  // Floor (not round) to avoid frame drift over long tracks; preserve sub-frame
  // info via the time field if consumers need it.
  const beats: BeatV2[] = beatTimes.map((time, i) => {
    // beatNumber is 1..4 — calculated relative to detected downbeat phase
    const positionInBar = (i - downbeatPhase + 4) % 4;
    const beatNumber = positionInBar + 1;
    const isDownbeat = positionInBar === 0;
    return {
      time: Math.round(time * 1000) / 1000,
      frame: Math.round(time * fps),
      beatNumber,
      barNumber: Math.floor((i - downbeatPhase) / 4) + (downbeatPhase > 0 && i < downbeatPhase ? -1 : 0),
      isDownbeat,
      confidence: Math.round(confidences[i] * 100) / 100,
      bassEnergy: Math.round(bassEnergies[i] * 1000) / 1000,
    };
  });

  // Convenience flat arrays
  const beatFrames = beats.map((b) => b.frame);
  const downbeatFrames = beats.filter((b) => b.isDownbeat).map((b) => b.frame);

  // Phrase ranges
  const phrases = {
    bar: buildPhrases(beats, 4),
    fourBar: buildPhrases(beats, 16),
    eightBar: buildPhrases(beats, 32),
    sixteenBar: buildPhrases(beats, 64),
  };

  // Stats — gap consistency tells you whether tempo is stable or drifting
  const gaps: number[] = [];
  for (let i = 1; i < beatTimes.length; i++) gaps.push(beatTimes[i] - beatTimes[i - 1]);
  const gapMean = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const gapStdDev =
    gaps.length > 0
      ? Math.sqrt(gaps.map((g) => (g - gapMean) ** 2).reduce((a, b) => a + b, 0) / gaps.length)
      : 0;
  const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  return {
    schemaVersion: 2,
    bpm,
    beatCount: beats.length,
    beatIntervalMs: Math.round((60000 / bpm) * 100) / 100,
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    fps,
    beats,
    beatFrames,
    downbeatFrames,
    phrases,
    suggestedSceneDurations: {
      '4-beat': beatPhraseDuration(4, bpm, fps),
      '8-beat': beatPhraseDuration(8, bpm, fps),
      '16-beat': beatPhraseDuration(16, bpm, fps),
    },
    stats: {
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      minBeatGap: gaps.length > 0 ? Math.round(Math.min(...gaps) * 1000) / 1000 : 0,
      maxBeatGap: gaps.length > 0 ? Math.round(Math.max(...gaps) * 1000) / 1000 : 0,
      beatGapStdDev: Math.round(gapStdDev * 1000) / 1000,
      downbeatPhase,
      downbeatStrength: Math.round(downbeatStrength * 100) / 100,
    },
  };
}

// ─── BACKWARD COMPAT TYPE ALIAS ────────────────────────────────────────
// Old code that imported `BeatData` still type-checks; the shape is now richer.
export type BeatData = BeatDataV2;
