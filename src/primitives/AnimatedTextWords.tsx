// Per-word text reveal — sibling of AnimatedTextChars but operates on word boundaries.
// Use this for kinetic typography that lands on beats (combine with BeatSync) or
// for narration sync where each word matches a spoken word timestamp.
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { useTheme } from './tokens';
import type { SpringPreset } from './tokens';

export type WordEntranceType = 'fade' | 'fade-up' | 'scale' | 'slide-up' | 'blur-in';

export interface AnimatedTextWordsProps {
  children: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  color?: string;
  textAlign?: React.CSSProperties['textAlign'];
  letterSpacing?: number | string;
  lineHeight?: number | string;
  entrance?: WordEntranceType;
  staggerFrames?: number;       // frames between each word (default 6)
  delay?: number;
  springPreset?: SpringPreset;
  // Optional explicit per-word delays — overrides staggerFrames
  // Useful when synced to audio word timestamps from analyze_audio
  wordDelays?: number[];
  style?: React.CSSProperties;
}

export const AnimatedTextWords: React.FC<AnimatedTextWordsProps> = ({
  children,
  fontSize = 96,
  fontWeight = 600,
  fontFamily,
  color,
  textAlign = 'center',
  letterSpacing = 0,
  lineHeight = 1.2,
  entrance = 'fade-up',
  staggerFrames = 6,
  delay = 0,
  springPreset = 'snappy',
  wordDelays,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const resolvedColor = color ?? theme.color.onBackground;
  const resolvedFont = fontFamily ?? theme.fontFamily;
  const springConfig = theme.springs[springPreset];

  const words = children.split(/\s+/).filter(Boolean);

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
        gap: '0.3em',
        justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start',
        ...style,
      }}
    >
      {words.map((word, i) => {
        const wordDelay = wordDelays?.[i] ?? (delay + i * staggerFrames);
        const effFrame = Math.max(0, frame - wordDelay);
        const progress = spring({ frame: effFrame, fps, config: springConfig });
        const opacityLinear = interpolate(effFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

        let transform = 'none';
        let opacity = 1;
        let filter = 'none';

        switch (entrance) {
          case 'fade':
            opacity = opacityLinear;
            break;
          case 'fade-up':
            opacity = opacityLinear;
            transform = `translateY(${interpolate(progress, [0, 1], [60, 0])}px)`;
            break;
          case 'scale':
            opacity = opacityLinear;
            transform = `scale(${interpolate(progress, [0, 1], [0, 1])})`;
            break;
          case 'slide-up':
            opacity = opacityLinear;
            transform = `translateY(${interpolate(progress, [0, 1], [120, 0])}px)`;
            break;
          case 'blur-in':
            opacity = opacityLinear;
            filter = `blur(${interpolate(effFrame, [0, 14], [16, 0], { extrapolateRight: 'clamp' })}px)`;
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
            {word}
          </span>
        );
      })}
    </div>
  );
};
