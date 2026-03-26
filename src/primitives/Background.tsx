// Background primitive — solid color, gradient, or image fill for a scene
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';

export interface BackgroundProps {
  // solid color
  color?: string;
  // gradient — pass array of color stops for linear, or a full CSS gradient string
  gradient?: string[] | string;
  gradientDirection?: string; // e.g. "135deg", "to bottom right" (default: "180deg")
  // image background
  imageSrc?: string;
  imageBlur?: number;        // blur the background image (px)
  imageOverlay?: string;     // semi-transparent overlay on image, e.g. "rgba(0,0,0,0.5)"
  // children render on top of background
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Background: React.FC<BackgroundProps> = ({
  color,
  gradient,
  gradientDirection = '180deg',
  imageSrc,
  imageBlur,
  imageOverlay,
  children,
  style = {},
}) => {
  // Resolve background value
  let background: string | undefined;
  if (gradient) {
    if (Array.isArray(gradient)) {
      // Array of color stops → linear-gradient
      background = `linear-gradient(${gradientDirection}, ${gradient.join(', ')})`;
    } else {
      // Full CSS gradient string passed directly
      background = gradient;
    }
  } else if (color) {
    background = color;
  } else {
    background = '#000000';
  }

  return (
    <AbsoluteFill style={{ background, ...style }}>
      {/* Optional image background */}
      {imageSrc && (
        <Img
          src={imageSrc}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: imageBlur ? `blur(${imageBlur}px)` : undefined,
            // slight scale to prevent blur edge artifacts
            transform: imageBlur ? 'scale(1.05)' : undefined,
          }}
        />
      )}
      {/* Optional overlay on image */}
      {imageSrc && imageOverlay && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: imageOverlay }} />
      )}
      {/* Content renders on top */}
      <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
        {children}
      </div>
    </AbsoluteFill>
  );
};
