// Per-character text reveal — each letter animates in with configurable stagger.
// Uses string slicing for typewriter (Remotion's official rule:
// "Always use string slicing for typewriter effects. Never use per-character opacity"
// when you want a true typewriter. For animated reveals, per-char IS the right call.)
//
// This primitive is for animated entrances (each char springs/fades/scales in).
// For pure typewriter, use AnimatedText with mode="typewriter" instead.
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useTheme } from './tokens';
import type { SpringPreset } from './tokens';

export type CharEntranceType = 'fade' | 'fade-up' | 'scale' | 'rotate-in' | 'blur-in';
export type StaggerPattern = 'linear' | 'center-out' | 'edges-in' | 'random';

export interface AnimatedTextCharsProps {
  children: string;
  // typography
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  color?: string;
  textAlign?: React.CSSProperties['textAlign'];
  letterSpacing?: number | string;
  lineHeight?: number | string;
  // animation
  entrance?: CharEntranceType;
  staggerFrames?: number;       // frames between each char's start (default 2)
  staggerPattern?: StaggerPattern;
  delay?: number;                // frames before first char starts
  springPreset?: SpringPreset;
  // honor whitespace as a separate animatable element
  preserveSpaces?: boolean;
  style?: React.CSSProperties;
}

// Deterministic shuffle so renders are reproducible
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildStaggerOrder(count: number, pattern: StaggerPattern): number[] {
  const idxs = Array.from({ length: count }, (_, i) => i);
  switch (pattern) {
    case 'linear':
      return idxs;
    case 'center-out': {
      const center = Math.floor(count / 2);
      return idxs.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    }
    case 'edges-in': {
      const center = Math.floor(count / 2);
      return idxs.sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    }
    case 'random':
      return seededShuffle(idxs, count);
    default:
      return idxs;
  }
}

export const AnimatedTextChars: React.FC<AnimatedTextCharsProps> = ({
  children,
  fontSize = 96,
  fontWeight = 600,
  fontFamily,
  color,
  textAlign = 'center',
  letterSpacing = 0,
  lineHeight = 1.1,
  entrance = 'fade-up',
  staggerFrames = 2,
  staggerPattern = 'linear',
  delay = 0,
  springPreset = 'snappy',
  preserveSpaces = true,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const resolvedColor = color ?? theme.color.onBackground;
  const resolvedFont = fontFamily ?? theme.fontFamily;
  const springConfig = theme.springs[springPreset];

  const chars = [...children];
  const order = buildStaggerOrder(chars.length, staggerPattern);
  // orderRank[i] = the position of char i in the stagger queue (0..n-1)
  const orderRank: number[] = Array(chars.length).fill(0);
  order.forEach((charIndex, rank) => {
    orderRank[charIndex] = rank;
  });

  return (
    <div
      style={{
        fontSize,
        fontWeight,
        fontFamily: resolvedFont,
        color: resolvedColor,
        textAlign,
        letterSpacing,
        lineHeight,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
        ...style,
      }}
    >
      {chars.map((char, i) => {
        // Render whitespace as a non-animated spacer so word boundaries hold
        if (char === ' ' && preserveSpaces) {
          return <span key={i} style={{ width: '0.3em', display: 'inline-block' }} />;
        }
        const charDelay = delay + orderRank[i] * staggerFrames;
        const effFrame = Math.max(0, frame - charDelay);
        const progress = spring({ frame: effFrame, fps, config: springConfig });
        const opacityLinear = interpolate(effFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

        let transform = 'none';
        let opacity = 1;
        let filter = 'none';

        switch (entrance) {
          case 'fade':
            opacity = opacityLinear;
            break;
          case 'fade-up':
            opacity = opacityLinear;
            transform = `translateY(${interpolate(progress, [0, 1], [40, 0])}px)`;
            break;
          case 'scale':
            opacity = opacityLinear;
            transform = `scale(${interpolate(progress, [0, 1], [0, 1])})`;
            break;
          case 'rotate-in':
            opacity = opacityLinear;
            transform = `rotate(${interpolate(progress, [0, 1], [-90, 0])}deg) scale(${interpolate(progress, [0, 1], [0.3, 1])})`;
            break;
          case 'blur-in':
            opacity = opacityLinear;
            filter = `blur(${interpolate(effFrame, [0, 12], [12, 0], { extrapolateRight: 'clamp' })}px)`;
            break;
        }

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity,
              transform,
              filter,
              willChange: 'transform, opacity, filter',
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};
