// SVG path morphing — animates between two SVG `d` strings using @remotion/paths.
// Killer move for logo reveals, shape transforms, icon transitions.
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { interpolatePath } from '@remotion/paths';
import { useTheme } from './tokens';
import type { SpringPreset } from './tokens';

export interface MorphPathProps {
  // Starting SVG path string (the `d` attribute)
  fromPath: string;
  // Ending SVG path string
  toPath: string;
  // Animation timing
  startFrame?: number;
  durationFrames?: number;
  springPreset?: SpringPreset;
  // SVG viewport
  viewBox?: string;
  width?: number | string;
  height?: number | string;
  // Path styling
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  style?: React.CSSProperties;
}

export const MorphPath: React.FC<MorphPathProps> = ({
  fromPath,
  toPath,
  startFrame = 0,
  durationFrames = 30,
  springPreset = 'smooth',
  viewBox = '0 0 100 100',
  width = '100%',
  height = '100%',
  fill,
  stroke,
  strokeWidth = 2,
  strokeLinecap = 'round',
  strokeLinejoin = 'round',
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const config = theme.springs[springPreset];

  const effFrame = Math.max(0, frame - startFrame);
  const progress = spring({ frame: effFrame, fps, config, durationInFrames: durationFrames });

  const d = interpolatePath(progress, fromPath, toPath);
  const resolvedFill = fill ?? theme.color.primary;

  return (
    <svg viewBox={viewBox} width={width} height={height} style={style}>
      <path
        d={d}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
      />
    </svg>
  );
};
