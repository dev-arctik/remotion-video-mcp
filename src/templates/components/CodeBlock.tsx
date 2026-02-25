import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface CodeBlockProps {
  code: string;
  language?: string;
  backgroundColor?: string;
  textColor?: string;
  highlightColor?: string;
  fontSize?: number;
  animation?: 'typewriter' | 'line-by-line' | 'fade';
  title?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'typescript',
  backgroundColor = '#1E1E1E',
  textColor = '#D4D4D4',
  highlightColor = '#569CD6',
  fontSize = 24,
  animation = 'typewriter',
  title,
}) => {
  const frame = useCurrentFrame();
  const lines = code.split('\n');

  // Title bar fade in
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Get visible content based on animation type
  const getVisibleContent = () => {
    switch (animation) {
      case 'typewriter': {
        // Reveal characters over time (2 chars/frame)
        const totalChars = code.length;
        const charsPerFrame = Math.max(1, totalChars / 90); // ~3 seconds to type all
        const charsToShow = Math.floor(frame * charsPerFrame);
        return code.slice(0, Math.min(charsToShow, totalChars));
      }
      case 'line-by-line': {
        // Reveal one line every 6 frames
        const linesToShow = Math.floor(frame / 6);
        return lines.slice(0, Math.min(linesToShow, lines.length)).join('\n');
      }
      case 'fade':
      default:
        return code;
    }
  };

  const visibleCode = getVisibleContent();

  // For fade animation, apply overall opacity
  const codeOpacity = animation === 'fade'
    ? interpolate(frame, [5, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0D1117',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 80px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          backgroundColor,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Title bar with window controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#2D2D2D',
            opacity: titleOpacity,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FF5F56' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27CA40' }} />
          </div>
          {title && (
            <div style={{ marginLeft: 16, fontSize: 14, color: '#999' }}>
              {title}
            </div>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
            {language}
          </div>
        </div>

        {/* Code content */}
        <pre
          style={{
            margin: 0,
            padding: '24px',
            fontSize,
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
            color: textColor,
            lineHeight: 1.5,
            whiteSpace: 'pre',
            overflow: 'hidden',
            opacity: codeOpacity,
          }}
        >
          {visibleCode}
          {animation === 'typewriter' && visibleCode.length < code.length && (
            <span
              style={{
                // Blinking cursor
                opacity: frame % 30 < 15 ? 1 : 0,
                color: highlightColor,
              }}
            >
              |
            </span>
          )}
        </pre>
      </div>
    </AbsoluteFill>
  );
};
