import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';
import { computeEntrance, entranceTransform } from '../utils/animations';
import type { EntrancePreset } from '../utils/animations';

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
  entrancePreset?: EntrancePreset;
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
  entrancePreset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title entrance — use preset or default fade-up
  const titleAnim = computeEntrance(entrancePreset ?? 'fade-up', frame, fps);

  // Subtitle: delayed entrance using same preset
  const subtitleAnim = computeEntrance(entrancePreset ?? 'fade-up', frame, fps, 15);

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
          opacity: titleAnim.opacity,
          transform: entranceTransform(titleAnim),
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
            opacity: subtitleAnim.opacity,
            transform: entranceTransform(subtitleAnim),
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
