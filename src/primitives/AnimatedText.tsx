// Text primitive with entrance/exit animations, typography control, and optional beat-sync
import React from 'react';
import { useAnimation } from './useAnimation';
import type { AnimationConfig } from './useAnimation';

export interface AnimatedTextProps {
  children: React.ReactNode;
  // typography
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  color?: string;
  textAlign?: React.CSSProperties['textAlign'];
  lineHeight?: number | string;
  letterSpacing?: number | string;
  textTransform?: React.CSSProperties['textTransform'];
  maxWidth?: number | string;
  // animation
  animation?: AnimationConfig;
  totalFrames?: number;
  // layout — allow primitives to be positioned freely
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  children,
  fontSize = 48,
  fontWeight = 'normal',
  fontFamily,
  color = '#FFFFFF',
  textAlign = 'center',
  lineHeight = 1.3,
  letterSpacing,
  textTransform,
  maxWidth,
  animation = {},
  totalFrames,
  style = {},
}) => {
  const { opacity, transform, filter } = useAnimation(animation, totalFrames);

  return (
    <div
      style={{
        fontSize,
        fontWeight,
        fontFamily,
        color,
        textAlign,
        lineHeight,
        letterSpacing,
        textTransform,
        maxWidth,
        opacity,
        transform,
        filter,
        willChange: 'transform, opacity, filter',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
