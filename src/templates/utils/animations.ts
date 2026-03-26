// Wrapper helpers for common Remotion animation patterns
import { interpolate, spring } from 'remotion';

// Fade in over a range of frames
export function fadeIn(frame: number, startFrame: number, durationFrames: number): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// Slide in from a direction (returns a translateX or translateY pixel offset)
export function slideIn(
  frame: number,
  startFrame: number,
  durationFrames: number,
  distancePx: number = 100,
): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [distancePx, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// Spring-based entrance — returns 0→1 progress
export function springEntrance(frame: number, fps: number, delay: number = 0): number {
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 200 },
  });
}

// --- Entrance Presets ---
// Each returns { opacity, translateX, translateY, scale } for one frame

export type EntrancePreset =
  | 'fade-up'
  | 'fly-from-left'
  | 'fly-from-right'
  | 'fly-from-bottom'
  | 'zoom-in'
  | 'drop-in';

interface EntranceValues {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
}

// Compute entrance animation values for a given preset at the current frame
export function computeEntrance(
  preset: EntrancePreset | undefined,
  frame: number,
  fps: number,
  delay: number = 0,
): EntranceValues {
  const effectiveFrame = Math.max(0, frame - delay);
  const p = preset ?? 'fade-up';

  switch (p) {
    case 'fade-up': {
      const opacity = interpolate(effectiveFrame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
      const s = spring({ frame: effectiveFrame, fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });
      const translateY = interpolate(s, [0, 1], [20, 0]);
      return { opacity, translateX: 0, translateY, scale: 1 };
    }
    case 'fly-from-left': {
      const s = spring({ frame: effectiveFrame, fps, config: { damping: 14, stiffness: 120 } });
      const opacity = interpolate(effectiveFrame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      const translateX = interpolate(s, [0, 1], [-200, 0]);
      return { opacity, translateX, translateY: 0, scale: 1 };
    }
    case 'fly-from-right': {
      const s = spring({ frame: effectiveFrame, fps, config: { damping: 14, stiffness: 120 } });
      const opacity = interpolate(effectiveFrame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      const translateX = interpolate(s, [0, 1], [200, 0]);
      return { opacity, translateX, translateY: 0, scale: 1 };
    }
    case 'fly-from-bottom': {
      const s = spring({ frame: effectiveFrame, fps, config: { damping: 14, stiffness: 120 } });
      const opacity = interpolate(effectiveFrame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      const translateY = interpolate(s, [0, 1], [200, 0]);
      return { opacity, translateX: 0, translateY, scale: 1 };
    }
    case 'zoom-in': {
      const s = spring({ frame: effectiveFrame, fps, config: { damping: 12, stiffness: 150 } });
      const opacity = interpolate(effectiveFrame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
      const scale = interpolate(s, [0, 1], [0.5, 1]);
      return { opacity, translateX: 0, translateY: 0, scale };
    }
    case 'drop-in': {
      const s = spring({ frame: effectiveFrame, fps, config: { damping: 8, stiffness: 200 } });
      const opacity = interpolate(effectiveFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
      const translateY = interpolate(s, [0, 1], [-150, 0]);
      return { opacity, translateX: 0, translateY, scale: 1 };
    }
    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1 };
  }
}

// CSS transform string from entrance values
export function entranceTransform(v: EntranceValues): string {
  const parts: string[] = [];
  if (v.translateX !== 0 || v.translateY !== 0) {
    parts.push(`translate(${v.translateX}px, ${v.translateY}px)`);
  }
  if (v.scale !== 1) {
    parts.push(`scale(${v.scale})`);
  }
  return parts.join(' ') || 'none';
}
