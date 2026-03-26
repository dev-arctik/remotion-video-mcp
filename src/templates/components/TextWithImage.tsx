import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';
import { computeEntrance, entranceTransform } from '../utils/animations';
import type { EntrancePreset } from '../utils/animations';

interface TextWithImageProps {
  heading?: string;
  body?: string;
  imageSrc: string;       // path relative to public/
  imagePosition?: 'left' | 'right';
  backgroundColor?: string;
  textColor?: string;
  headingColor?: string;
  headingFontSize?: number;
  bodyFontSize?: number;
  entrancePreset?: EntrancePreset;
}

export const TextWithImage: React.FC<TextWithImageProps> = ({
  heading,
  body,
  imageSrc,
  imagePosition = 'right',
  backgroundColor = '#000000',
  textColor = '#FFFFFF',
  headingColor,
  headingFontSize = 48,
  bodyFontSize = 28,
  entrancePreset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text entrance — use preset or default spring from side
  const textAnim = entrancePreset
    ? computeEntrance(entrancePreset, frame, fps)
    : null;

  // Fallback: spring from side (original behavior)
  const textDirection = imagePosition === 'right' ? -1 : 1;
  const imageDirection = imagePosition === 'right' ? 1 : -1;

  const textSpring = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const defaultTextX = interpolate(textSpring, [0, 1], [80 * textDirection, 0]);
  const defaultTextOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Image entrance — delayed, uses same preset or spring from opposite side
  const imageAnim = entrancePreset
    ? computeEntrance(entrancePreset, frame, fps, 10)
    : null;

  const imageSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 12, stiffness: 100 } });
  const defaultImageX = interpolate(imageSpring, [0, 1], [80 * imageDirection, 0]);
  const defaultImageOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const textContent = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px',
        opacity: textAnim ? textAnim.opacity : defaultTextOpacity,
        transform: textAnim ? entranceTransform(textAnim) : `translateX(${defaultTextX}px)`,
      }}
    >
      {heading && (
        <div
          style={{
            fontSize: headingFontSize,
            fontWeight: 'bold',
            color: headingColor ?? textColor,
            marginBottom: 20,
          }}
        >
          {heading}
        </div>
      )}
      {body && (
        <div
          style={{
            fontSize: bodyFontSize,
            color: textColor,
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );

  const imageContent = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        opacity: imageAnim ? imageAnim.opacity : defaultImageOpacity,
        transform: imageAnim ? entranceTransform(imageAnim) : `translateX(${defaultImageX}px)`,
      }}
    >
      <Img
        src={staticFile(imageSrc)}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 12,
        }}
      />
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: imagePosition === 'right' ? 'row' : 'row-reverse',
      }}
    >
      {textContent}
      {imageContent}
    </AbsoluteFill>
  );
};
