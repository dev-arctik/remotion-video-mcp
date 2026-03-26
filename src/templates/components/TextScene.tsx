import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { computeEntrance, entranceTransform } from '../utils/animations';
import type { EntrancePreset } from '../utils/animations';

interface TextSceneProps {
  heading?: string;
  body?: string;
  bullets?: string[];
  backgroundColor?: string;
  textColor?: string;
  headingColor?: string;
  headingFontSize?: number;
  bodyFontSize?: number;
  alignment?: 'center' | 'left' | 'right';
  animation?: 'fade' | 'typewriter' | 'word-by-word';
  entrancePreset?: EntrancePreset;
}

export const TextScene: React.FC<TextSceneProps> = ({
  heading,
  body,
  bullets,
  backgroundColor = '#000000',
  textColor = '#FFFFFF',
  headingColor,
  headingFontSize = 56,
  bodyFontSize = 32,
  alignment = 'left',
  animation = 'fade',
  entrancePreset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Heading entrance — use preset or default fade-up
  const headingAnim = computeEntrance(entrancePreset ?? 'fade-up', frame, fps);

  // Body/bullets animation — delayed by 15 frames
  const bodyStartFrame = 15;

  // For typewriter: reveal characters over time
  const getTypewriterText = (text: string) => {
    const charsPerFrame = text.length / 60; // reveal over ~2 seconds
    const charsToShow = Math.floor((frame - bodyStartFrame) * charsPerFrame);
    return text.slice(0, Math.max(0, charsToShow));
  };

  const bodyOpacity = interpolate(frame, [bodyStartFrame, bodyStartFrame + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px 120px',
      }}
    >
      {heading && (
        <div
          style={{
            fontSize: headingFontSize,
            fontWeight: 'bold',
            color: headingColor ?? textColor,
            opacity: headingAnim.opacity,
            transform: entranceTransform(headingAnim),
            textAlign: alignment,
            marginBottom: 32,
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
            opacity: animation === 'typewriter' || animation === 'word-by-word' ? 1 : bodyOpacity,
            textAlign: alignment,
            lineHeight: 1.6,
          }}
        >
          {animation === 'typewriter' ? getTypewriterText(body) :
           animation === 'word-by-word' ? (
             body.split(/\s+/).map((word, i) => {
               const wordDelay = bodyStartFrame + i * 4;
               const wordOpacity = interpolate(frame, [wordDelay, wordDelay + 10], [0, 1], {
                 extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
               });
               return (
                 <span key={i} style={{ opacity: wordOpacity, display: 'inline-block', marginRight: '0.3em' }}>
                   {word}
                 </span>
               );
             })
           ) : body}
        </div>
      )}

      {bullets && bullets.length > 0 && (
        <div style={{ marginTop: body ? 24 : 0 }}>
          {bullets.map((bullet, i) => {
            // Stagger each bullet by 8 frames
            const bulletDelay = bodyStartFrame + i * 8;
            const bulletOpacity = interpolate(frame, [bulletDelay, bulletDelay + 15], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const bulletSpring = spring({
              frame: Math.max(0, frame - bulletDelay),
              fps,
              config: { damping: 12, stiffness: 150 },
            });
            const bulletX = interpolate(bulletSpring, [0, 1], [40, 0]);

            return (
              <div
                key={i}
                style={{
                  fontSize: bodyFontSize,
                  color: textColor,
                  opacity: bulletOpacity,
                  transform: `translateX(${bulletX}px)`,
                  textAlign: alignment,
                  marginBottom: 12,
                  paddingLeft: alignment === 'left' ? 24 : 0,
                }}
              >
                {bullet}
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
