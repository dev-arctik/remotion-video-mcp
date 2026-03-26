// Audio-reactive primitive — provides real-time frequency data from audio playback
// Uses Remotion's @remotion/media-utils for correct behavior during preview AND render
import React, { createContext, useContext, useMemo } from 'react';
import { useWindowedAudioData, visualizeAudio } from '@remotion/media-utils';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export interface AudioReactiveContextValue {
  /** 0–1, average energy in low frequency bins (bass, kick drums, sub) */
  bassIntensity: number;
  /** 0–1, average energy in mid frequency bins (vocals, melody, strings) */
  midIntensity: number;
  /** 0–1, average energy in high frequency bins (hi-hats, cymbals, swooshes) */
  highIntensity: number;
  /** 0–1, average energy across all frequency bins */
  overallEnergy: number;
  /** true when bass spikes significantly vs baseline */
  isDropping: boolean;
  /** true when overall energy is near zero (silence/pause) */
  isSilent: boolean;
  /** false while audio data is still loading */
  isLoaded: boolean;
}

const defaultValue: AudioReactiveContextValue = {
  bassIntensity: 0,
  midIntensity: 0,
  highIntensity: 0,
  overallEnergy: 0,
  isDropping: false,
  isSilent: true,
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
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const AudioReactive: React.FC<AudioReactiveProps> = ({
  src,
  windowInSeconds = 30,
  numberOfSamples = 128,
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

    // Split bins into bands (index 0 = bass, last = highs)
    const quarter = Math.floor(numberOfSamples * 0.25);
    const threeQuarter = Math.floor(numberOfSamples * 0.75);

    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

    const bassIntensity = avg(Array.from(frequencies.slice(0, quarter)));
    const midIntensity = avg(Array.from(frequencies.slice(quarter, threeQuarter)));
    const highIntensity = avg(Array.from(frequencies.slice(threeQuarter)));
    const overallEnergy = avg(Array.from(frequencies));

    return {
      bassIntensity,
      midIntensity,
      highIntensity,
      overallEnergy,
      isDropping: bassIntensity > 0.15,
      isSilent: overallEnergy < 0.02,
      isLoaded: true,
    };
  }, [audioData, frame, fps, numberOfSamples, dataOffsetInSeconds]);

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
