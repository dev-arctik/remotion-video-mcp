import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

interface AudioWord {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

interface KineticTypographyProps {
  text: string;
  audioWords?: AudioWord[];    // word-level timestamps for audio sync
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: string;
  alignment?: 'center' | 'left' | 'right';
  animation?: 'spring' | 'fade' | 'scale';
  wordsPerLine?: number;
}

export const KineticTypography: React.FC<KineticTypographyProps> = ({
  text,
  audioWords,
  backgroundColor = '#000000',
  textColor = '#FFFFFF',
  fontSize = 64,
  fontWeight = 'bold',
  alignment = 'center',
  animation = 'spring',
  wordsPerLine = 5,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Split text into words
  const words = text.split(/\s+/).filter(Boolean);

  // Group words into lines
  const lines: string[][] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine));
  }

  // Calculate word entrance frame — either from audio timestamps or evenly spaced
  const getWordFrame = (wordIndex: number): number => {
    if (audioWords && audioWords[wordIndex]) {
      // Sync to audio timestamp
      return Math.round(audioWords[wordIndex].start * fps);
    }
    // Evenly space words across ~80% of scene duration (leave breathing room at end)
    const spacing = 3; // frames between each word entrance
    return wordIndex * spacing;
  };

  // Animate a single word based on the chosen animation style
  const renderWord = (word: string, wordIndex: number) => {
    const wordFrame = getWordFrame(wordIndex);
    const elapsed = frame - wordFrame;

    let opacity = 0;
    let transform = '';

    if (elapsed < 0) {
      // Word hasn't appeared yet
      return (
        <span key={wordIndex} style={{ opacity: 0, display: 'inline-block', marginRight: '0.3em' }}>
          {word}
        </span>
      );
    }

    switch (animation) {
      case 'spring': {
        const wordSpring = spring({
          frame: elapsed,
          fps,
          config: { damping: 12, stiffness: 200 },
        });
        opacity = wordSpring;
        const y = interpolate(wordSpring, [0, 1], [20, 0]);
        transform = `translateY(${y}px)`;
        break;
      }
      case 'fade': {
        opacity = interpolate(elapsed, [0, 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        break;
      }
      case 'scale': {
        const scaleSpring = spring({
          frame: elapsed,
          fps,
          config: { damping: 10, stiffness: 150 },
        });
        opacity = scaleSpring;
        const s = interpolate(scaleSpring, [0, 1], [0.5, 1]);
        transform = `scale(${s})`;
        break;
      }
    }

    return (
      <span
        key={wordIndex}
        style={{
          opacity,
          transform,
          display: 'inline-block',
          marginRight: '0.3em',
        }}
      >
        {word}
      </span>
    );
  };

  let globalWordIndex = 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
        padding: '80px 120px',
      }}
    >
      {lines.map((lineWords, lineIndex) => (
        <div
          key={lineIndex}
          style={{
            fontSize,
            fontWeight: fontWeight as React.CSSProperties['fontWeight'],
            color: textColor,
            textAlign: alignment,
            lineHeight: 1.4,
            marginBottom: 8,
          }}
        >
          {lineWords.map((word) => {
            const rendered = renderWord(word, globalWordIndex);
            globalWordIndex++;
            return rendered;
          })}
        </div>
      ))}
    </AbsoluteFill>
  );
};
