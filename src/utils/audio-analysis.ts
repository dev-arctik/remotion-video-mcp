import fs from 'fs-extra';
import { AudioContext } from 'web-audio-api';
import Meyda from 'meyda';
import MusicTempo from 'music-tempo';

// --- Interfaces ---

export interface AudioEvent {
  type: 'bass-drop' | 'impact' | 'build-start' | 'build-peak' |
        'transient' | 'silence-break' | 'energy-shift';
  frame: number;
  time: number;        // seconds from start
  intensity: number;   // 0–1 strength
  description: string;
}

export interface SceneCutPoint {
  frame: number;
  reason: string;
}

export interface SensitivityOptions {
  bassThreshold?: number;       // delta in bass energy to trigger bass-drop (default: 0.35)
  transientThreshold?: number;  // high-freq delta to trigger transient (default: 0.40)
  silenceThreshold?: number;    // RMS floor for silence detection (default: 0.02)
  impactThreshold?: number;     // all-band combined delta for impact (default: 0.50)
  buildMinFrames?: number;      // minimum frames of rising RMS to count as build (default: 30)
}

export interface AudioAnalysisResult {
  frequencyProfile: {
    framesAnalyzed: number;
    bands: ['bass', 'mids', 'highs', 'air'];
    summary: {
      avgBassEnergy: number;
      avgRMS: number;
      peakFrame: number;
    };
  };
  events: AudioEvent[];
  suggestedSceneCuts: SceneCutPoint[];
  duration: { seconds: number; frames: number };
  // backward-compatible beat data
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

// Per-frame energy data computed from FFT
interface FrameEnergy {
  bass: number;
  mids: number;
  highs: number;
  air: number;
  rms: number;
}

// --- Audio Decode ---

// Decode audio file to mono PCM Float32Array via web-audio-api
function decodeAudio(fileBuffer: Buffer): Promise<{ pcm: Float32Array; sampleRate: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const ctx = new AudioContext();
    ctx.decodeAudioData(
      fileBuffer,
      (audioBuffer) => {
        let monoData: Float32Array;
        if (audioBuffer.numberOfChannels >= 2) {
          const left = audioBuffer.getChannelData(0);
          const right = audioBuffer.getChannelData(1);
          monoData = new Float32Array(left.length);
          for (let i = 0; i < left.length; i++) {
            monoData[i] = (left[i] + right[i]) / 2;
          }
        } else {
          monoData = audioBuffer.getChannelData(0);
        }
        resolve({
          pcm: monoData,
          sampleRate: audioBuffer.sampleRate,
          durationSeconds: audioBuffer.duration,
        });
      },
      (err) => reject(new Error(`Failed to decode audio: ${err?.message ?? err}`)),
    );
  });
}

// --- Per-Frame FFT Analysis ---

// Split audio into frame-sized windows and extract frequency band energies
function computePerFrameEnergies(
  pcm: Float32Array,
  sampleRate: number,
  fps: number,
): FrameEnergy[] {
  const samplesPerFrame = Math.floor(sampleRate / fps);
  // Meyda needs bufferSize to be power of 2 — find nearest >= samplesPerFrame
  const bufferSize = nextPowerOf2(samplesPerFrame);
  const totalFrames = Math.floor(pcm.length / samplesPerFrame);
  const energies: FrameEnergy[] = [];

  // Configure meyda
  Meyda.sampleRate = sampleRate;
  Meyda.bufferSize = bufferSize;

  for (let f = 0; f < totalFrames; f++) {
    const start = f * samplesPerFrame;
    // Extract a bufferSize-length window (zero-pad if needed at the end)
    const window = new Float32Array(bufferSize);
    const available = Math.min(bufferSize, pcm.length - start);
    window.set(pcm.subarray(start, start + available));

    const features = Meyda.extract(['powerSpectrum', 'rms'], window);
    const spectrum = features.powerSpectrum;
    const rms = features.rms ?? 0;

    if (!spectrum || spectrum.length === 0) {
      energies.push({ bass: 0, mids: 0, highs: 0, air: 0, rms });
      continue;
    }

    // Map power spectrum bins to frequency bands
    // Each bin represents: binFreq = binIndex * (sampleRate / bufferSize)
    // Bass: 20-200Hz, Mids: 200-2000Hz, Highs: 2000-8000Hz, Air: 8000-20000Hz
    const binWidth = sampleRate / bufferSize;
    const bassEnd = Math.min(Math.ceil(200 / binWidth), spectrum.length);
    const midsEnd = Math.min(Math.ceil(2000 / binWidth), spectrum.length);
    const highsEnd = Math.min(Math.ceil(8000 / binWidth), spectrum.length);

    const avgBand = (from: number, to: number) => {
      if (from >= to) return 0;
      let sum = 0;
      for (let i = from; i < to; i++) sum += spectrum[i];
      return sum / (to - from);
    };

    energies.push({
      bass: avgBand(0, bassEnd),
      mids: avgBand(bassEnd, midsEnd),
      highs: avgBand(midsEnd, highsEnd),
      air: avgBand(highsEnd, spectrum.length),
      rms,
    });
  }

  return energies;
}

// --- Event Detection ---

function detectEvents(
  energies: FrameEnergy[],
  fps: number,
  sensitivity: Required<SensitivityOptions>,
): AudioEvent[] {
  const events: AudioEvent[] = [];
  const frameToTime = (f: number) => Math.round((f / fps) * 1000) / 1000;

  // Normalize energies to 0-1 range for consistent thresholding
  const maxBass = Math.max(...energies.map(e => e.bass), 0.001);
  const maxMids = Math.max(...energies.map(e => e.mids), 0.001);
  const maxHighs = Math.max(...energies.map(e => e.highs), 0.001);
  const maxRMS = Math.max(...energies.map(e => e.rms), 0.001);

  const norm = energies.map(e => ({
    bass: e.bass / maxBass,
    mids: e.mids / maxMids,
    highs: e.highs / maxHighs,
    rms: e.rms / maxRMS,
  }));

  // Compute frame-over-frame deltas
  const deltas = norm.map((e, i) => {
    if (i === 0) return { bass: 0, mids: 0, highs: 0, rms: 0 };
    return {
      bass: e.bass - norm[i - 1].bass,
      mids: e.mids - norm[i - 1].mids,
      highs: e.highs - norm[i - 1].highs,
      rms: e.rms - norm[i - 1].rms,
    };
  });

  // Cooldown tracker — prevent duplicate events within N frames
  const lastEventFrame: Record<string, number> = {};
  const cooldown = (type: string, frame: number, minGap: number) => {
    if (lastEventFrame[type] != null && frame - lastEventFrame[type] < minGap) return true;
    lastEventFrame[type] = frame;
    return false;
  };

  for (let f = 1; f < norm.length; f++) {
    // --- Bass Drop: sudden bass energy spike ---
    if (deltas[f].bass > sensitivity.bassThreshold && !cooldown('bass-drop', f, Math.round(fps * 2))) {
      events.push({
        type: 'bass-drop',
        frame: f,
        time: frameToTime(f),
        intensity: Math.min(1, deltas[f].bass / 0.8),
        description: `Bass drop at ${frameToTime(f)}s`,
      });
    }

    // --- Impact: all bands spike simultaneously ---
    const combinedDelta = deltas[f].bass + deltas[f].mids + deltas[f].highs;
    if (combinedDelta > sensitivity.impactThreshold &&
        deltas[f].bass > 0.15 && deltas[f].mids > 0.15 && deltas[f].highs > 0.15 &&
        !cooldown('impact', f, Math.round(fps * 2))) {
      events.push({
        type: 'impact',
        frame: f,
        time: frameToTime(f),
        intensity: Math.min(1, combinedDelta / 1.5),
        description: `Full-spectrum impact at ${frameToTime(f)}s`,
      });
    }

    // --- Transient: high-freq spike with fast decay ---
    if (deltas[f].highs > sensitivity.transientThreshold && !cooldown('transient', f, Math.round(fps * 1))) {
      // Check for fast decay — highs should drop within 5 frames
      const decayFrame = Math.min(f + 5, norm.length - 1);
      if (norm[decayFrame].highs < norm[f].highs * 0.5) {
        events.push({
          type: 'transient',
          frame: f,
          time: frameToTime(f),
          intensity: Math.min(1, deltas[f].highs / 0.7),
          description: `High-frequency transient (swoosh/cymbal) at ${frameToTime(f)}s`,
        });
      }
    }

    // --- Energy Shift: large RMS jump between frames ---
    if (Math.abs(deltas[f].rms) > 0.4 && !cooldown('energy-shift', f, Math.round(fps * 2))) {
      const direction = deltas[f].rms > 0 ? 'surge' : 'drop';
      events.push({
        type: 'energy-shift',
        frame: f,
        time: frameToTime(f),
        intensity: Math.min(1, Math.abs(deltas[f].rms) / 0.6),
        description: `Energy ${direction} at ${frameToTime(f)}s`,
      });
    }
  }

  // --- Silence Breaks: RMS below threshold then returns ---
  let silenceStart: number | null = null;
  for (let f = 0; f < norm.length; f++) {
    if (norm[f].rms < sensitivity.silenceThreshold) {
      if (silenceStart === null) silenceStart = f;
    } else if (silenceStart !== null) {
      const silenceLength = f - silenceStart;
      // Only count silence >= 5 frames as meaningful
      if (silenceLength >= 5) {
        events.push({
          type: 'silence-break',
          frame: f,
          time: frameToTime(f),
          intensity: Math.min(1, silenceLength / (fps * 0.5)),
          description: `Audio returns after ${Math.round(silenceLength / fps * 100) / 100}s silence at ${frameToTime(f)}s`,
        });
      }
      silenceStart = null;
    }
  }

  // --- Build Detection: rising RMS over N+ frames ---
  let buildStart: number | null = null;
  let risingCount = 0;
  for (let f = 1; f < norm.length; f++) {
    if (deltas[f].rms > 0.005) {
      // RMS is rising
      if (buildStart === null) buildStart = f;
      risingCount++;
    } else {
      if (buildStart !== null && risingCount >= sensitivity.buildMinFrames) {
        events.push({
          type: 'build-start',
          frame: buildStart,
          time: frameToTime(buildStart),
          intensity: Math.min(1, risingCount / (fps * 3)),
          description: `Energy build begins at ${frameToTime(buildStart)}s (${Math.round(risingCount / fps * 10) / 10}s long)`,
        });
        events.push({
          type: 'build-peak',
          frame: f,
          time: frameToTime(f),
          intensity: norm[f - 1].rms,
          description: `Build peaks at ${frameToTime(f)}s`,
        });
      }
      buildStart = null;
      risingCount = 0;
    }
  }

  // Sort by frame
  events.sort((a, b) => a.frame - b.frame);
  return events;
}

// --- Cut Point Derivation ---

function deriveCutPoints(events: AudioEvent[], totalFrames: number, fps: number): SceneCutPoint[] {
  const cuts: SceneCutPoint[] = [{ frame: 0, reason: 'Start' }];

  // Include high-intensity events as cut points
  for (const event of events) {
    if (event.intensity >= 0.8) {
      const typeLabel: Record<string, string> = {
        'bass-drop': 'Bass drop — strong visual transition',
        'impact': 'Full-spectrum impact — dramatic scene change',
        'silence-break': 'Silence break — dramatic pause ends',
        'build-peak': 'Build peaks — climax moment',
        'energy-shift': 'Major energy shift',
        'transient': 'Audio transient — quick cut point',
        'build-start': 'Energy build begins',
      };
      cuts.push({
        frame: event.frame,
        reason: typeLabel[event.type] ?? event.type,
      });
    }
  }

  // Deduplicate cuts closer than 3 seconds — scenes shorter than that feel too rushed
  const minGap = Math.round(fps * 3);
  const deduped: SceneCutPoint[] = [cuts[0]];
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i].frame - deduped[deduped.length - 1].frame >= minGap) {
      deduped.push(cuts[i]);
    }
  }

  return deduped;
}

// --- BPM Detection (backward compat) ---

function detectBPM(
  pcm: Float32Array,
  fps: number,
  bpmRange?: { min?: number; max?: number },
): { bpm: number; beats: Array<{ time: number; frame: number }>; beatCount: number; beatIntervalMs: number } {
  try {
    const params: Record<string, number> = {};
    if (bpmRange?.max) params.minBeatInterval = 60 / bpmRange.max;
    if (bpmRange?.min) params.maxBeatInterval = 60 / bpmRange.min;

    const mt = new MusicTempo(pcm, params);
    const bpm = Math.round(mt.tempo * 10) / 10;
    const beats = mt.beats.map((time: number) => ({
      time: Math.round(time * 1000) / 1000,
      frame: Math.round(time * fps),
    }));

    return {
      bpm,
      beats,
      beatCount: beats.length,
      beatIntervalMs: Math.round((60000 / bpm) * 100) / 100,
    };
  } catch {
    // BPM detection can fail on ambient/irregular audio — return zeroes
    return { bpm: 0, beats: [], beatCount: 0, beatIntervalMs: 0 };
  }
}

function beatPhraseDuration(beatsPerPhrase: number, bpm: number, fps: number) {
  if (bpm === 0) return { frames: 0, seconds: 0 };
  const seconds = (beatsPerPhrase / bpm) * 60;
  return { frames: Math.round(seconds * fps), seconds: Math.round(seconds * 1000) / 1000 };
}

// --- Main Entry Point ---

export async function analyzeAudio(
  audioPath: string,
  fps: number,
  sensitivity?: SensitivityOptions,
  bpmRange?: { min?: number; max?: number },
): Promise<AudioAnalysisResult> {
  const fileBuffer = await fs.readFile(audioPath);
  const { pcm, sampleRate, durationSeconds } = await decodeAudio(fileBuffer);

  const totalFrames = Math.floor(durationSeconds * fps);

  // Defaults tuned conservative — fewer false positives on rhythmic tracks
  const sens: Required<SensitivityOptions> = {
    bassThreshold: sensitivity?.bassThreshold ?? 0.55,
    transientThreshold: sensitivity?.transientThreshold ?? 0.55,
    silenceThreshold: sensitivity?.silenceThreshold ?? 0.02,
    impactThreshold: sensitivity?.impactThreshold ?? 0.70,
    buildMinFrames: sensitivity?.buildMinFrames ?? 45,
  };

  // Per-frame frequency analysis via Meyda
  const energies = computePerFrameEnergies(pcm, sampleRate, fps);

  // Detect audio events from energy deltas
  const events = detectEvents(energies, fps, sens);

  // Derive scene cut suggestions from high-intensity events
  const suggestedSceneCuts = deriveCutPoints(events, totalFrames, fps);

  // Backward-compat BPM detection via music-tempo
  const bpmData = detectBPM(pcm, fps, bpmRange);

  // Summary stats
  const avgBass = energies.reduce((s, e) => s + e.bass, 0) / energies.length;
  const avgRMS = energies.reduce((s, e) => s + e.rms, 0) / energies.length;
  const peakFrame = energies.reduce((maxF, e, i, arr) => e.rms > arr[maxF].rms ? i : maxF, 0);

  return {
    frequencyProfile: {
      framesAnalyzed: energies.length,
      bands: ['bass', 'mids', 'highs', 'air'],
      summary: {
        avgBassEnergy: Math.round(avgBass * 1000) / 1000,
        avgRMS: Math.round(avgRMS * 1000) / 1000,
        peakFrame,
      },
    },
    events,
    suggestedSceneCuts,
    duration: {
      seconds: Math.round(durationSeconds * 100) / 100,
      frames: totalFrames,
    },
    bpm: bpmData.bpm,
    beatCount: bpmData.beatCount,
    beatIntervalMs: bpmData.beatIntervalMs,
    beats: bpmData.beats,
    suggestedSceneDurations: {
      '4-beat': beatPhraseDuration(4, bpmData.bpm, fps),
      '8-beat': beatPhraseDuration(8, bpmData.bpm, fps),
      '16-beat': beatPhraseDuration(16, bpmData.bpm, fps),
    },
  };
}

// Utility — next power of 2 >= n
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
