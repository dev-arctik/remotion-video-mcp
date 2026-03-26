// Shape primitive — rect, circle, or line with fill, blur, glow, and animations
import React from 'react';
import { useAnimation } from './useAnimation';
import type { AnimationConfig } from './useAnimation';

export type ShapeType = 'rect' | 'circle' | 'line';

export interface AnimatedShapeProps {
  shape?: ShapeType;
  // sizing
  width?: number | string;
  height?: number | string;
  // visual
  fill?: string;
  border?: string;
  borderRadius?: number | string; // only for rect
  blur?: number;                   // backdrop blur effect
  glow?: string;                   // CSS box-shadow glow, e.g. "0 0 40px rgba(99,102,241,0.6)"
  gradient?: string;               // CSS gradient, e.g. "linear-gradient(135deg, #667eea, #764ba2)"
  // line-specific (renders as a thin rect)
  lineWidth?: number;
  // animation
  animation?: AnimationConfig;
  totalFrames?: number;
  // layout
  style?: React.CSSProperties;
}

export const AnimatedShape: React.FC<AnimatedShapeProps> = ({
  shape = 'rect',
  width = 100,
  height = 100,
  fill = '#FFFFFF',
  border,
  borderRadius,
  blur,
  glow,
  gradient,
  lineWidth = 2,
  animation = {},
  totalFrames,
  style = {},
}) => {
  const { opacity, transform, filter: animFilter } = useAnimation(animation, totalFrames);

  // Shape-specific styles
  const shapeStyle: React.CSSProperties = (() => {
    switch (shape) {
      case 'circle':
        return {
          width,
          height,
          borderRadius: '50%',
        };
      case 'line':
        return {
          width,
          height: lineWidth,
          borderRadius: lineWidth / 2,
        };
      case 'rect':
      default:
        return {
          width,
          height,
          borderRadius: borderRadius ?? 0,
        };
    }
  })();

  // Combine animation filter with blur effect
  const filters: string[] = [];
  if (animFilter !== 'none') filters.push(animFilter);
  const combinedFilter = filters.length > 0 ? filters.join(' ') : 'none';

  return (
    <div
      style={{
        ...shapeStyle,
        background: gradient ?? fill,
        border,
        boxShadow: glow,
        backdropFilter: blur ? `blur(${blur}px)` : undefined,
        opacity,
        transform,
        filter: combinedFilter,
        willChange: 'transform, opacity, filter',
        ...style,
      }}
    />
  );
};
