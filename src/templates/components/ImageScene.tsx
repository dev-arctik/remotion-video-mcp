import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig, Img, staticFile } from 'remotion';

interface ImageSceneProps {
  src: string;          // path relative to public/, e.g. "images/photo.jpg"
  alt?: string;
  fit?: 'cover' | 'contain' | 'fill';
  backgroundColor?: string;
  overlayText?: string;
  overlayPosition?: 'top' | 'center' | 'bottom';
  overlayColor?: string;
  overlayFontSize?: number;
  kenBurns?: boolean;   // slow zoom effect over scene duration
}

export const ImageScene: React.FC<ImageSceneProps> = ({
  src,
  alt = '',
  fit = 'cover',
  backgroundColor = '#000000',
  overlayText,
  overlayPosition = 'bottom',
  overlayColor = '#FFFFFF',
  overlayFontSize = 36,
  kenBurns = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Ken Burns: slow zoom from 1.0 → 1.08 over the scene duration
  const scale = kenBurns
    ? interpolate(frame, [0, durationInFrames], [1.0, 1.08], { extrapolateRight: 'clamp' })
    : 1;

  // Image fade in
  const imageOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Overlay text fade in (delayed)
  const textOpacity = overlayText
    ? interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  // Overlay positioning
  const overlayJustify =
    overlayPosition === 'top' ? 'flex-start' :
    overlayPosition === 'center' ? 'center' : 'flex-end';

  return (
    <AbsoluteFill style={{ backgroundColor, overflow: 'hidden' }}>
      <Img
        src={staticFile(src)}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          opacity: imageOpacity,
          transform: `scale(${scale})`,
        }}
      />

      {overlayText && (
        <AbsoluteFill
          style={{
            display: 'flex',
            justifyContent: overlayJustify,
            alignItems: 'center',
            padding: '60px 80px',
          }}
        >
          <div
            style={{
              fontSize: overlayFontSize,
              color: overlayColor,
              fontWeight: 'bold',
              opacity: textOpacity,
              textShadow: '0 2px 8px rgba(0,0,0,0.7)',
              textAlign: 'center',
            }}
          >
            {overlayText}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
