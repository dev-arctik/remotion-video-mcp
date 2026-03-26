// Image primitive with entrance/exit animations, sizing, and visual effects
import React from 'react';
import { Img } from 'remotion';
import { useAnimation } from './useAnimation';
import type { AnimationConfig } from './useAnimation';

export interface AnimatedImageProps {
  src: string;
  // sizing
  width?: number | string;
  height?: number | string;
  objectFit?: React.CSSProperties['objectFit'];
  // visual effects
  borderRadius?: number | string;
  shadow?: string;          // CSS box-shadow value
  border?: string;          // CSS border value
  overlayColor?: string;    // semi-transparent color overlay on top of image
  // animation
  animation?: AnimationConfig;
  totalFrames?: number;
  // layout
  style?: React.CSSProperties;
}

export const AnimatedImage: React.FC<AnimatedImageProps> = ({
  src,
  width = '100%',
  height = '100%',
  objectFit = 'cover',
  borderRadius = 0,
  shadow,
  border,
  overlayColor,
  animation = {},
  totalFrames,
  style = {},
}) => {
  const { opacity, transform, filter } = useAnimation(animation, totalFrames);

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius,
        overflow: 'hidden',
        boxShadow: shadow,
        border,
        opacity,
        transform,
        filter,
        willChange: 'transform, opacity, filter',
        ...style,
      }}
    >
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit,
        }}
      />
      {/* Optional color overlay */}
      {overlayColor && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: overlayColor,
          }}
        />
      )}
    </div>
  );
};
