// Lottie animation player — wraps @remotion/lottie.
// Drop in Lottie JSON files (from LottieFiles, IconScout) for icon animations,
// illustrations, and decorative motion. Frame-pure, deterministic.
import React from 'react';
import { Lottie } from '@remotion/lottie';
import { staticFile } from 'remotion';

export interface LottiePlayerProps {
  // Either a path under public/ (e.g. "lottie/check.json") or raw JSON object
  src: string | object;
  width?: number | string;
  height?: number | string;
  loop?: boolean;
  playbackRate?: number;
  style?: React.CSSProperties;
  // Optional callback when animation data is loaded
  onAnimationLoaded?: () => void;
}

export const LottiePlayer: React.FC<LottiePlayerProps> = ({
  src,
  width = '100%',
  height = '100%',
  loop = false,
  playbackRate = 1,
  style = {},
  onAnimationLoaded,
}) => {
  // If src is a string, treat as path to JSON in public/
  const animationData = typeof src === 'string' ? staticFile(src) : src;

  return (
    <div style={{ width, height, ...style }}>
      <Lottie
        animationData={animationData as object}
        loop={loop}
        playbackRate={playbackRate}
        onAnimationLoaded={onAnimationLoaded}
      />
    </div>
  );
};
