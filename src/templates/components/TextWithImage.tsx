import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';

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
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Text slides in from the left, image from the right (or vice versa)
  const textDirection = imagePosition === 'right' ? -1 : 1;
  const imageDirection = imagePosition === 'right' ? 1 : -1;

  // Text entrance — spring from side
  const textSpring = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const textX = interpolate(textSpring, [0, 1], [80 * textDirection, 0]);
  const textOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Image entrance — delayed spring from opposite side
  const imageSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 12, stiffness: 100 } });
  const imageX = interpolate(imageSpring, [0, 1], [80 * imageDirection, 0]);
  const imageOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const textContent = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px',
        opacity: textOpacity,
        transform: `translateX(${textX}px)`,
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
        opacity: imageOpacity,
        transform: `translateX(${imageX}px)`,
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
