import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';

interface TitleCardProps {
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  titleFontSize?: number;
  subtitleFontSize?: number;
  alignment?: 'center' | 'left' | 'right';
  logoSrc?: string; // path relative to public/, e.g. "images/logo.png"
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  backgroundColor = '#000000',
  titleColor = '#FFFFFF',
  subtitleColor,
  titleFontSize = 72,
  subtitleFontSize = 32,
  alignment = 'center',
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title: fade in + slide up from 20px below
  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });
  const titleTranslateY = interpolate(titleY, [0, 1], [20, 0]);

  // Subtitle: delayed fade in + slide up
  const subtitleOpacity = interpolate(frame, [15, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subtitleSpring = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });
  const subtitleTranslateY = interpolate(subtitleSpring, [0, 1], [20, 0]);

  // Logo: fade in at frame 0, fully visible by frame 20
  const logoOpacity = logoSrc
    ? interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  const textAlign = alignment;
  const resolvedSubtitleColor = subtitleColor ?? `${titleColor}B3`; // 70% opacity fallback

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
        padding: '0 120px',
      }}
    >
      {logoSrc && (
        <Img
          src={staticFile(logoSrc)}
          style={{
            height: 80,
            objectFit: 'contain',
            opacity: logoOpacity,
            marginBottom: 24,
          }}
        />
      )}
      <div
        style={{
          fontSize: titleFontSize,
          fontWeight: 'bold',
          color: titleColor,
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
          textAlign,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: subtitleFontSize,
            color: resolvedSubtitleColor,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleTranslateY}px)`,
            textAlign,
            marginTop: 16,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
