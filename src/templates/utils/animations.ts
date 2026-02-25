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
