// SafeArea — content container that reserves chrome zones at 1080p.
//
// Solves the layout-overflow class of bugs where content placed top-down without
// a vertical budget collides with persistent chrome (SectionHeader, Footer, corner
// crosshairs). Content inside <SafeArea> is physically constrained to a clipped
// box — overflow is visible immediately so authors catch it before render.
//
//   <AbsoluteFill>
//     <SectionHeader />          {/* renders in top chrome band */}
//     <SafeArea>
//       <YourContent />          {/* can't overflow into chrome */}
//     </SafeArea>
//     <Footer />                 {/* renders in bottom chrome band */}
//   </AbsoluteFill>
//
// Default chrome budget for 1920×1080 video:
//   • topReserved:    180px (96 crosshair margin + 84 SectionHeader band)
//   • bottomReserved: 150px (96 crosshair margin + 54 Footer band)
//   • sideMargin:      96px (left + right crosshair margin)
//   ⇒ Safe content zone:  1728 × 750  (centered)
//
// Override `chrome` per-scene if your composition uses different margins.
// Set `debug` to render translucent guides while iterating in Studio.
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

export interface SafeAreaChrome {
  /** Pixels reserved at the top for SectionHeader / crosshair (default 180) */
  topReserved?: number;
  /** Pixels reserved at the bottom for Footer / crosshair (default 150) */
  bottomReserved?: number;
  /** Pixels of horizontal margin on left + right (default 96) */
  sideMargin?: number;
}

export interface SafeAreaProps {
  /** Chrome zone overrides — partial, merges with defaults */
  chrome?: SafeAreaChrome;
  /** Render translucent guides showing the safe zone (development aid) */
  debug?: boolean;
  /**
   * Overflow behavior — 'hidden' (default) clips children, 'visible' lets them
   * escape (use only when you want overflow as a stylistic effect).
   */
  overflow?: 'hidden' | 'visible';
  /** Inner alignment — flex shorthand for the safe zone container */
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  /** Flex direction inside the safe zone (default: column) */
  direction?: 'row' | 'column';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const DEFAULT_CHROME: Required<SafeAreaChrome> = {
  topReserved: 180,
  bottomReserved: 150,
  sideMargin: 96,
};

const FLEX_ALIGN: Record<NonNullable<SafeAreaProps['align']>, React.CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const FLEX_JUSTIFY: Record<NonNullable<SafeAreaProps['justify']>, React.CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  'space-around': 'space-around',
};

export const SafeArea: React.FC<SafeAreaProps> = ({
  chrome = {},
  debug = false,
  overflow = 'hidden',
  align,
  justify,
  direction = 'column',
  children,
  style = {},
}) => {
  const { width, height } = useVideoConfig();
  const c = { ...DEFAULT_CHROME, ...chrome };

  const safeWidth = width - c.sideMargin * 2;
  const safeHeight = height - c.topReserved - c.bottomReserved;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Optional debug guides — drawn under content so it stays readable */}
      {debug && (
        <>
          {/* Top reserved band */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: c.topReserved,
              background: 'rgba(255, 0, 0, 0.08)',
              borderBottom: '1px dashed rgba(255, 0, 0, 0.5)',
            }}
          />
          {/* Bottom reserved band */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: c.bottomReserved,
              background: 'rgba(255, 0, 0, 0.08)',
              borderTop: '1px dashed rgba(255, 0, 0, 0.5)',
            }}
          />
          {/* Side margins */}
          <div
            style={{
              position: 'absolute',
              top: c.topReserved,
              bottom: c.bottomReserved,
              left: 0,
              width: c.sideMargin,
              background: 'rgba(0, 100, 255, 0.06)',
              borderRight: '1px dashed rgba(0, 100, 255, 0.4)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: c.topReserved,
              bottom: c.bottomReserved,
              right: 0,
              width: c.sideMargin,
              background: 'rgba(0, 100, 255, 0.06)',
              borderLeft: '1px dashed rgba(0, 100, 255, 0.4)',
            }}
          />
          {/* Safe zone outline */}
          <div
            style={{
              position: 'absolute',
              top: c.topReserved,
              left: c.sideMargin,
              width: safeWidth,
              height: safeHeight,
              border: '1px dashed rgba(0, 200, 0, 0.5)',
              pointerEvents: 'none',
            }}
          />
          {/* Dimension label */}
          <div
            style={{
              position: 'absolute',
              top: c.topReserved + 8,
              left: c.sideMargin + 8,
              fontSize: 14,
              fontFamily: 'monospace',
              color: 'rgba(0, 200, 0, 0.9)',
              padding: '2px 6px',
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: 4,
            }}
          >
            SafeArea {safeWidth}×{safeHeight}
          </div>
        </>
      )}

      {/* Actual safe content zone */}
      <div
        style={{
          position: 'absolute',
          top: c.topReserved,
          left: c.sideMargin,
          width: safeWidth,
          height: safeHeight,
          display: 'flex',
          flexDirection: direction,
          alignItems: align ? FLEX_ALIGN[align] : undefined,
          justifyContent: justify ? FLEX_JUSTIFY[justify] : undefined,
          overflow,
          pointerEvents: 'auto',
          ...style,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Returns the dimensions of the safe zone for the current composition.
 * Useful when child components need to size themselves to the available area.
 */
export function useSafeAreaDimensions(chrome: SafeAreaChrome = {}): {
  width: number;
  height: number;
  top: number;
  left: number;
} {
  const { width, height } = useVideoConfig();
  const c = { ...DEFAULT_CHROME, ...chrome };
  return {
    width: width - c.sideMargin * 2,
    height: height - c.topReserved - c.bottomReserved,
    top: c.topReserved,
    left: c.sideMargin,
  };
}
