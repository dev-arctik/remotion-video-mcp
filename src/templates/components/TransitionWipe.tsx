import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';

interface TransitionWipeProps {
  type?: 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'dissolve' | 'zoom';
  color?: string;
  backgroundColor?: string;
}

export const TransitionWipe: React.FC<TransitionWipeProps> = ({
  type = 'wipe-left',
  color = '#000000',
  backgroundColor = '#000000',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Transition progresses from 0 → 1 over the scene duration
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const renderTransition = () => {
    switch (type) {
      case 'wipe-left':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${progress * 100}%`,
              height: '100%',
              backgroundColor: color,
            }}
          />
        );

      case 'wipe-right':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: `${progress * 100}%`,
              height: '100%',
              backgroundColor: color,
            }}
          />
        );

      case 'wipe-up':
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: `${progress * 100}%`,
              backgroundColor: color,
            }}
          />
        );

      case 'wipe-down':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${progress * 100}%`,
              backgroundColor: color,
            }}
          />
        );

      case 'dissolve':
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: color,
              opacity: progress,
            }}
          />
        );

      case 'zoom': {
        const scale = interpolate(progress, [0, 1], [1, 20]);
        return (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 100,
              height: 100,
              borderRadius: '50%',
              backgroundColor: color,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          />
        );
      }

      default:
        return null;
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {renderTransition()}
    </AbsoluteFill>
  );
};
