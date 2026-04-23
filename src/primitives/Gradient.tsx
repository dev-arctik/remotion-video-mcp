// Animated gradient background — reads colors from theme by default.
// Linear or radial, with optional animated angle/position for subtle motion.
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { AbsoluteFill } from 'remotion';
import { useTheme } from './tokens';

export type GradientType = 'linear' | 'radial' | 'conic';

export interface GradientProps {
  // Use theme colors by default — primary→secondary
  colors?: string[];
  // Stops 0..1 — same length as colors
  stops?: number[];
  type?: GradientType;
  // Linear: angle in degrees (0 = top, 90 = right). Animated if animate=true.
  angle?: number;
  // Animate the angle over `animationCycleFrames` frames
  animate?: boolean;
  animationCycleFrames?: number;
  // Radial origin position
  radialPosition?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const Gradient: React.FC<GradientProps> = ({
  colors,
  stops,
  type = 'linear',
  angle = 135,
  animate = false,
  animationCycleFrames = 240,
  radialPosition = 'center',
  style = {},
  children,
}) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const resolvedColors = colors ?? [theme.color.primary, theme.color.secondary];

  // Build "color stop%" string
  const stopList = resolvedColors
    .map((c, i) => {
      const s = stops?.[i] != null ? `${stops[i]! * 100}%` : '';
      return `${c} ${s}`.trim();
    })
    .join(', ');

  const animatedAngle = animate
    ? interpolate(frame % animationCycleFrames, [0, animationCycleFrames], [angle, angle + 360])
    : angle;

  let bg = '';
  switch (type) {
    case 'linear':
      bg = `linear-gradient(${animatedAngle}deg, ${stopList})`;
      break;
    case 'radial':
      bg = `radial-gradient(circle at ${radialPosition}, ${stopList})`;
      break;
    case 'conic':
      bg = `conic-gradient(from ${animatedAngle}deg at ${radialPosition}, ${stopList})`;
      break;
  }

  return (
    <AbsoluteFill style={{ background: bg, ...style }}>
      {children}
    </AbsoluteFill>
  );
};
