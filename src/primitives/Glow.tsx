// Glow wrapper — adds a soft outer glow / drop-shadow to any child.
// Uses CSS filter: drop-shadow which respects content shape (unlike box-shadow).
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { useTheme } from './tokens';

export interface GlowProps {
  children: React.ReactNode;
  color?: string;            // glow color — defaults to theme.color.primary
  intensity?: number;        // blur radius in px (default 24)
  layers?: number;           // number of stacked drop-shadows for stronger glow (default 2)
  // Animate glow in over time
  animate?: boolean;
  animateDelay?: number;
  animateDuration?: number;
  style?: React.CSSProperties;
}

export const Glow: React.FC<GlowProps> = ({
  children,
  color,
  intensity = 24,
  layers = 2,
  animate = false,
  animateDelay = 0,
  animateDuration = 30,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const resolvedColor = color ?? theme.color.primary;

  const progress = animate
    ? spring({
        frame: frame - animateDelay,
        fps,
        config: theme.springs.smooth,
        durationInFrames: animateDuration,
      })
    : 1;

  const filterValue = Array.from({ length: layers }, () =>
    `drop-shadow(0 0 ${intensity * progress}px ${resolvedColor})`
  ).join(' ');

  return (
    <div style={{ filter: filterValue, ...style }}>
      {children}
    </div>
  );
};
