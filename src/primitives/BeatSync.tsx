// BeatSync primitive — pulses or triggers effects on beat timestamps
// Reads beat data (from analyze_beats output) and provides a reactive pulse value
import React, { createContext, useContext } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// Beat data shape — matches analyze_beats tool output
export interface BeatData {
  bpm: number;
  beats: number[];   // beat timestamps as frame numbers
}

interface BeatContextValue {
  /** 0→1 pulse that peaks on each beat and decays */
  pulse: number;
  /** true during the frame of a beat hit */
  isOnBeat: boolean;
  /** index of the current beat (0-based), -1 if before first beat */
  beatIndex: number;
  /** the beat data */
  beatData: BeatData;
}

const BeatContext = createContext<BeatContextValue>({
  pulse: 0,
  isOnBeat: false,
  beatIndex: -1,
  beatData: { bpm: 120, beats: [] },
});

// Hook for children to access beat state
export function useBeat(): BeatContextValue {
  return useContext(BeatContext);
}

export interface BeatSyncProps {
  /** Beat data from analyze_beats tool (bpm + beat frame array) */
  beats: BeatData;
  /** How many frames the pulse takes to decay after a beat (default: 8) */
  decayFrames?: number;
  /** Scale multiplier on beat — e.g. 1.05 means 5% scale bump (default: 1.0, no scale) */
  pulseScale?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const BeatSync: React.FC<BeatSyncProps> = ({
  beats,
  decayFrames = 8,
  pulseScale = 1.0,
  children,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find the most recent beat at or before the current frame
  let beatIndex = -1;
  let framesSinceBeat = Infinity;

  for (let i = beats.beats.length - 1; i >= 0; i--) {
    if (beats.beats[i] <= frame) {
      beatIndex = i;
      framesSinceBeat = frame - beats.beats[i];
      break;
    }
  }

  const isOnBeat = framesSinceBeat === 0;

  // Pulse: 1 on beat → decays to 0 over decayFrames
  const pulse = framesSinceBeat <= decayFrames
    ? interpolate(framesSinceBeat, [0, decayFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  // Optional visual scale pulse on the wrapper
  const scale = pulseScale !== 1.0
    ? 1 + (pulseScale - 1) * pulse
    : 1;

  const contextValue: BeatContextValue = { pulse, isOnBeat, beatIndex, beatData: beats };

  return (
    <BeatContext.Provider value={contextValue}>
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
