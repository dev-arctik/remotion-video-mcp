// Audio-reactive primitive — provides real-time frequency data from audio playback.
// Uses Remotion's @remotion/media-utils for correct behavior during preview AND render.
//
// v2 fixes:
//   • isDropping was bassIntensity > 0.15 — fires constantly on any compressed music.
//     Replaced with ratio-based detection: bass must DOMINATE (be louder than mids
//     and highs by a configurable factor), not just be loud.
//   • Added isBassHit, isHighHit, isPeak event flags with sane thresholds.
//   • Exposed bassRatio / midRatio / highRatio for users who want fine-grained control.
//   • All thresholds are configurable via props for tuning per track.
import React, { createContext, useContext, useMemo } from 'react';
import { useWindowedAudioData, visualizeAudio } from '@remotion/media-utils';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export interface AudioReactiveContextValue {
  /** 0..1, average energy in low frequency bins (bass, kick drums, sub) */
  bassIntensity: number;
  /** 0..1, average energy in mid frequency bins (vocals, melody, strings) */
  midIntensity: number;
  /** 0..1, average energy in high frequency bins (hi-hats, cymbals, swooshes) */
  highIntensity: number;
  /** 0..1, average energy across all frequency bins */
  overallEnergy: number;

  /** bass / (mid + high) — high when bass dominates the spectrum */
  bassRatio: number;
  /** mid / (bass + high) — high during vocal-heavy or melodic passages */
  midRatio: number;
  /** high / (bass + mid) — high during hi-hat / cymbal / sibilance moments */
  highRatio: number;

  /** True when bass is BOTH loud AND dominant — real kick drum / drop / sub hit */
  isBassHit: boolean;
  /** True when highs spike (cymbal, hi-hat, swoosh) */
  isHighHit: boolean;
  /** True when overall energy crosses peak threshold (loud moment, regardless of band) */
  isPeak: boolean;
  /** True when overall energy is near zero (silence/pause) */
  isSilent: boolean;

  /** @deprecated Use isBassHit instead — kept for backward compat */
  isDropping: boolean;

  /** False while audio data is still loading */
  isLoaded: boolean;
}

const defaultValue: AudioReactiveContextValue = {
  bassIntensity: 0,
  midIntensity: 0,
  highIntensity: 0,
  overallEnergy: 0,
  bassRatio: 0,
  midRatio: 0,
  highRatio: 0,
  isBassHit: false,
  isHighHit: false,
  isPeak: false,
  isSilent: true,
  isDropping: false,
  isLoaded: false,
};

const AudioReactiveContext = createContext<AudioReactiveContextValue>(defaultValue);

export interface AudioReactiveProps {
  /** Audio source — use staticFile('audio/your-track.mp3') */
  src: string;
  /** How much audio to load at once in seconds (default: 30) */
  windowInSeconds?: number;
  /** FFT sample count — must be power of 2 (default: 128) */
  numberOfSamples?: number;

  // ─── DETECTION THRESHOLDS (override per track if defaults misfire) ────
  /** Bass intensity floor for isBassHit (0..1, default 0.45) */
  bassHitThreshold?: number;
  /** Bass must be at least this many × louder than mids for isBassHit (default 1.3) */
  bassDominanceRatio?: number;
  /** High intensity floor for isHighHit (0..1, default 0.50) */
  highHitThreshold?: number;
  /** Overall energy floor for isPeak (0..1, default 0.55) */
  peakThreshold?: number;
  /** Overall energy ceiling for isSilent (0..1, default 0.02) */
  silenceThreshold?: number;

  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const AudioReactive: React.FC<AudioReactiveProps> = ({
  src,
  windowInSeconds = 30,
  numberOfSamples = 128,
  bassHitThreshold = 0.45,
  bassDominanceRatio = 1.3,
  highHitThreshold = 0.50,
  peakThreshold = 0.55,
  silenceThreshold = 0.02,
  children,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src,
    frame,
    fps,
    windowInSeconds,
  });

  const contextValue = useMemo<AudioReactiveContextValue>(() => {
    if (!audioData) return defaultValue;

    const frequencies = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples,
      optimizeFor: 'speed',
      dataOffsetInSeconds,
    });

    // Split bins into bands.
    // FFT bin 0..N maps to 0..fs/2 Hz. With Remotion's default 48kHz upsampling
    // and 128 samples, each bin ≈ 187.5 Hz. So:
    //   bins 0..32   → 0..6 kHz   (bass + low-mids — kick, bass, vocal body)
    //   bins 32..96  → 6..18 kHz  (mids + presence — vocal/instrument body)
    //   bins 96..128 → 18..24 kHz (highs — sibilance, air)
    // This split is coarse but matches what visualizeAudio + 128 samples can give us.
    // For finer resolution, increase numberOfSamples to 256 or 512.
    const quarter = Math.floor(numberOfSamples * 0.25);
    const threeQuarter = Math.floor(numberOfSamples * 0.75);

    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

    const bassIntensity = avg(Array.from(frequencies.slice(0, quarter)));
    const midIntensity = avg(Array.from(frequencies.slice(quarter, threeQuarter)));
    const highIntensity = avg(Array.from(frequencies.slice(threeQuarter)));
    const overallEnergy = avg(Array.from(frequencies));

    // Ratios — guard against /0 with a small epsilon
    const E = 1e-6;
    const bassRatio = bassIntensity / (midIntensity + highIntensity + E);
    const midRatio = midIntensity / (bassIntensity + highIntensity + E);
    const highRatio = highIntensity / (bassIntensity + midIntensity + E);

    // Event detection — REQUIRE both magnitude AND dominance.
    // A true bass hit means the bass is LOUD *and* louder than mids/highs.
    // This is what fixes the "fires constantly on every compressed pop track" bug.
    const isBassHit =
      bassIntensity >= bassHitThreshold &&
      bassIntensity >= midIntensity * bassDominanceRatio &&
      bassIntensity >= highIntensity * bassDominanceRatio;

    const isHighHit =
      highIntensity >= highHitThreshold &&
      highIntensity >= bassIntensity;

    const isPeak = overallEnergy >= peakThreshold;
    const isSilent = overallEnergy < silenceThreshold;

    return {
      bassIntensity,
      midIntensity,
      highIntensity,
      overallEnergy,
      bassRatio,
      midRatio,
      highRatio,
      isBassHit,
      isHighHit,
      isPeak,
      isSilent,
      isDropping: isBassHit, // back-compat alias
      isLoaded: true,
    };
  }, [
    audioData,
    frame,
    fps,
    numberOfSamples,
    dataOffsetInSeconds,
    bassHitThreshold,
    bassDominanceRatio,
    highHitThreshold,
    peakThreshold,
    silenceThreshold,
  ]);

  return (
    <AudioReactiveContext.Provider value={contextValue}>
      <div style={style}>{children}</div>
    </AudioReactiveContext.Provider>
  );
};

/** Hook to access real-time audio frequency data inside an AudioReactive wrapper */
export function useAudioReactive(): AudioReactiveContextValue {
  return useContext(AudioReactiveContext);
}
