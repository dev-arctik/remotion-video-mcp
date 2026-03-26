import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, useVideoConfig, Img, staticFile } from 'remotion';
import { computeEntrance, entranceTransform } from '../utils/animations';
import type { EntrancePreset } from '../utils/animations';

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
  panDirection?: 'left' | 'right' | 'zoom-in' | 'zoom-out';
  entrancePreset?: EntrancePreset;
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
  panDirection,
  entrancePreset,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Pan/zoom effect over scene duration
  let imageTransform = '';
  if (panDirection) {
    switch (panDirection) {
      case 'left': {
        const tx = interpolate(frame, [0, durationInFrames], [0, -60], { extrapolateRight: 'clamp' });
        imageTransform = `translateX(${tx}px) scale(1.1)`;
        break;
      }
      case 'right': {
        const tx = interpolate(frame, [0, durationInFrames], [0, 60], { extrapolateRight: 'clamp' });
        imageTransform = `translateX(${tx}px) scale(1.1)`;
        break;
      }
      case 'zoom-in': {
        const s = interpolate(frame, [0, durationInFrames], [1.0, 1.15], { extrapolateRight: 'clamp' });
        imageTransform = `scale(${s})`;
        break;
      }
      case 'zoom-out': {
        const s = interpolate(frame, [0, durationInFrames], [1.15, 1.0], { extrapolateRight: 'clamp' });
        imageTransform = `scale(${s})`;
        break;
      }
    }
  } else if (kenBurns) {
    // Default Ken Burns: slow zoom from 1.0 → 1.08
    const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.08], { extrapolateRight: 'clamp' });
    imageTransform = `scale(${scale})`;
  }

  // Image entrance animation
  const imgAnim = computeEntrance(entrancePreset, frame, fps);
  const imageOpacity = entrancePreset
    ? imgAnim.opacity
    : interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Overlay text fade in (delayed)
  const textOpacity = overlayText
    ? interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

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
          transform: entrancePreset
            ? `${entranceTransform(imgAnim)} ${imageTransform}`.trim()
            : imageTransform || undefined,
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
