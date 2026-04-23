// Ken Burns effect — slow pan + zoom on a still image.
// Standard cinematic move that turns photos into "moving" footage.
// Use for image-driven scenes (testimonials, before/after, photo reels).
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Img, staticFile, Easing } from 'remotion';

export type PanDirection = 'left' | 'right' | 'up' | 'down' | 'none';

export interface KenBurnsProps {
  // Image source — path under public/ (e.g. "images/portrait.jpg") or full URL
  src: string;
  durationInFrames: number;
  // Zoom — start at startScale, end at endScale (both ≥1, > 1 = zoomed in)
  startScale?: number;
  endScale?: number;
  // Pan — pixels of translation across the duration
  panDirection?: PanDirection;
  panDistance?: number;
  // Easing function
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  style?: React.CSSProperties;
}

const EASING_MAP = {
  'linear': Easing.linear,
  'ease-in': Easing.in(Easing.cubic),
  'ease-out': Easing.out(Easing.cubic),
  'ease-in-out': Easing.inOut(Easing.cubic),
} as const;

export const KenBurns: React.FC<KenBurnsProps> = ({
  src,
  durationInFrames,
  startScale = 1,
  endScale = 1.15,
  panDirection = 'right',
  panDistance = 80,
  easing = 'ease-in-out',
  style = {},
}) => {
  const frame = useCurrentFrame();
  const easingFn = EASING_MAP[easing];

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    easing: easingFn,
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(progress, [0, 1], [startScale, endScale]);

  let translateX = 0;
  let translateY = 0;
  switch (panDirection) {
    case 'left':
      translateX = interpolate(progress, [0, 1], [0, -panDistance]);
      break;
    case 'right':
      translateX = interpolate(progress, [0, 1], [0, panDistance]);
      break;
    case 'up':
      translateY = interpolate(progress, [0, 1], [0, -panDistance]);
      break;
    case 'down':
      translateY = interpolate(progress, [0, 1], [0, panDistance]);
      break;
  }

  const resolvedSrc = src.startsWith('http') || src.startsWith('data:') ? src : staticFile(src);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', ...style }}>
      <Img
        src={resolvedSrc}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      />
    </div>
  );
};
