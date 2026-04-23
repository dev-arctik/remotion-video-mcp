// Captions primitive — TikTok / Fireship style word-level highlighted captions
// Uses @remotion/captions for parsing + grouping. Source data is a parsed Caption[]
// from a JSON file in assets/captions/ (created by import_captions tool).
//
// Standalone usage: pass `captions` prop directly with Caption[] data.
// Composition usage: pass `trackId` to reference a track registered in composition.captions[].
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption } from '@remotion/captions';
import { useTheme } from './tokens';

export interface CaptionsProps {
  // Caption data — array of { text, startMs, endMs, timestampMs } from @remotion/captions
  captions: Caption[];
  // Layout
  position?: 'top' | 'middle' | 'bottom';
  // Group multiple words into pages — combineTokensWithinMilliseconds
  groupWindowMs?: number;
  // Typography
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  color?: string;                  // inactive word color
  highlightColor?: string;         // active word color
  highlightBackground?: string;    // active word pill bg, omit for no pill
  // Layout
  maxWidth?: number | string;
  paddingX?: number;
  paddingY?: number;
  // Animation: each word springs in with this preset
  bounceOnAppear?: boolean;
  style?: React.CSSProperties;
}

export const Captions: React.FC<CaptionsProps> = ({
  captions,
  position = 'bottom',
  groupWindowMs = 1200,
  fontSize = 72,
  fontWeight = 800,
  fontFamily,
  color,
  highlightColor,
  highlightBackground,
  maxWidth = '85%',
  paddingX = 40,
  paddingY = 20,
  bounceOnAppear = true,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const currentMs = (frame / fps) * 1000;

  const resolvedColor = color ?? theme.color.onSurface;
  const resolvedHighlight = highlightColor ?? theme.color.primary;
  const resolvedFont = fontFamily ?? theme.fontFamily;

  // Group word-level captions into TikTok-style pages
  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: groupWindowMs,
  });

  // Find the active page (the one whose time window contains currentMs)
  const activePage = pages.find(
    (p) => currentMs >= p.startMs && currentMs < p.startMs + p.durationMs
  );

  if (!activePage) return null;

  // Position styles
  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    ...(position === 'top' ? { top: '8%' } : {}),
    ...(position === 'middle' ? { top: '50%', transform: 'translate(-50%, -50%)' } : {}),
    ...(position === 'bottom' ? { bottom: '12%' } : {}),
  };

  return (
    <div
      style={{
        ...positionStyle,
        maxWidth,
        textAlign: 'center',
        fontSize,
        fontWeight,
        fontFamily: resolvedFont,
        color: resolvedColor,
        lineHeight: 1.2,
        textShadow: '0 4px 16px rgba(0,0,0,0.6)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0.3em',
        ...style,
      }}
    >
      {activePage.tokens.map((token, i) => {
        const isActive = currentMs >= token.fromMs && currentMs < token.toMs;
        const isPast = currentMs >= token.toMs;

        // Bounce-in animation when a token first appears
        const tokenStartFrame = (token.fromMs / 1000) * fps;
        const sinceStart = frame - tokenStartFrame;
        const bounceProgress = bounceOnAppear
          ? spring({ frame: sinceStart, fps, config: theme.springs.bouncy })
          : 1;
        const scale = isActive
          ? interpolate(bounceProgress, [0, 1], [0.7, 1])
          : 1;

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `scale(${scale})`,
              transition: 'none',
              color: isActive
                ? resolvedHighlight
                : isPast
                ? theme.color.onSurfaceVariant
                : resolvedColor,
              backgroundColor: isActive && highlightBackground ? highlightBackground : undefined,
              padding: isActive && highlightBackground ? `${paddingY}px ${paddingX}px` : undefined,
              borderRadius: isActive && highlightBackground ? theme.radius.md : undefined,
            }}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
};
