// Shared animation engine for all primitives
// Handles entrance + exit animations with spring physics and beat-sync support
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export type EntranceType =
  | 'none'
  | 'fade-up'
  | 'fade-down'
  | 'fly-from-left'
  | 'fly-from-right'
  | 'fly-from-top'
  | 'fly-from-bottom'
  | 'zoom-in'
  | 'zoom-out'
  | 'drop-in'
  | 'spin-in'
  | 'blur-in';

export type ExitType =
  | 'none'
  | 'fade-out'
  | 'fade-down'
  | 'fly-out-left'
  | 'fly-out-right'
  | 'fly-out-top'
  | 'fly-out-bottom'
  | 'zoom-out'
  | 'blur-out';

export interface AnimationConfig {
  entrance?: EntranceType;
  exit?: ExitType;
  delay?: number;           // frames before entrance starts
  entranceDuration?: number; // frames for entrance (default 25)
  exitDuration?: number;     // frames for exit (default 20)
  // spring tuning
  damping?: number;
  stiffness?: number;
  mass?: number;
}

export interface AnimationValues {
  opacity: number;
  transform: string;
  filter: string;
}

// Spring helper — returns 0→1 progress with configurable physics
function springProgress(
  frame: number,
  fps: number,
  damping = 12,
  stiffness = 150,
  mass = 0.8,
): number {
  return spring({ frame, fps, config: { damping, stiffness, mass } });
}

// Compute entrance values at a given effective frame
function computeEntrance(
  type: EntranceType,
  effectiveFrame: number,
  fps: number,
  duration: number,
  damping: number,
  stiffness: number,
  mass: number,
): { opacity: number; translateX: number; translateY: number; scale: number; rotate: number; blur: number } {
  const s = springProgress(effectiveFrame, fps, damping, stiffness, mass);
  const opacityLinear = interpolate(effectiveFrame, [0, Math.min(duration, 15)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  switch (type) {
    case 'none':
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0 };
    case 'fade-up':
      return { opacity: opacityLinear, translateX: 0, translateY: interpolate(s, [0, 1], [40, 0]), scale: 1, rotate: 0, blur: 0 };
    case 'fade-down':
      return { opacity: opacityLinear, translateX: 0, translateY: interpolate(s, [0, 1], [-40, 0]), scale: 1, rotate: 0, blur: 0 };
    case 'fly-from-left':
      return { opacity: opacityLinear, translateX: interpolate(s, [0, 1], [-300, 0]), translateY: 0, scale: 1, rotate: 0, blur: 0 };
    case 'fly-from-right':
      return { opacity: opacityLinear, translateX: interpolate(s, [0, 1], [300, 0]), translateY: 0, scale: 1, rotate: 0, blur: 0 };
    case 'fly-from-top':
      return { opacity: opacityLinear, translateX: 0, translateY: interpolate(s, [0, 1], [-300, 0]), scale: 1, rotate: 0, blur: 0 };
    case 'fly-from-bottom':
      return { opacity: opacityLinear, translateX: 0, translateY: interpolate(s, [0, 1], [300, 0]), scale: 1, rotate: 0, blur: 0 };
    case 'zoom-in':
      return { opacity: opacityLinear, translateX: 0, translateY: 0, scale: interpolate(s, [0, 1], [0.3, 1]), rotate: 0, blur: 0 };
    case 'zoom-out':
      return { opacity: opacityLinear, translateX: 0, translateY: 0, scale: interpolate(s, [0, 1], [1.5, 1]), rotate: 0, blur: 0 };
    case 'drop-in': {
      const bouncy = springProgress(effectiveFrame, fps, 8, 200, mass);
      return { opacity: opacityLinear, translateX: 0, translateY: interpolate(bouncy, [0, 1], [-200, 0]), scale: 1, rotate: 0, blur: 0 };
    }
    case 'spin-in':
      return { opacity: opacityLinear, translateX: 0, translateY: 0, scale: interpolate(s, [0, 1], [0.5, 1]), rotate: interpolate(s, [0, 1], [-180, 0]), blur: 0 };
    case 'blur-in': {
      const blurAmount = interpolate(effectiveFrame, [0, duration], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity: opacityLinear, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: blurAmount };
    }
    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0 };
  }
}

// Compute exit values — mirrors entrance logic but in reverse
function computeExit(
  type: ExitType,
  framesUntilEnd: number, // how many frames left before this element disappears
  fps: number,
  duration: number,
): { opacity: number; translateX: number; translateY: number; scale: number; blur: number } {
  // framesUntilEnd counts down — 0 means element is gone
  const progress = interpolate(framesUntilEnd, [duration, 0], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  switch (type) {
    case 'none':
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
    case 'fade-out':
      return { opacity: 1 - progress, translateX: 0, translateY: 0, scale: 1, blur: 0 };
    case 'fade-down':
      return { opacity: 1 - progress, translateX: 0, translateY: progress * 40, scale: 1, blur: 0 };
    case 'fly-out-left':
      return { opacity: 1 - progress, translateX: -300 * progress, translateY: 0, scale: 1, blur: 0 };
    case 'fly-out-right':
      return { opacity: 1 - progress, translateX: 300 * progress, translateY: 0, scale: 1, blur: 0 };
    case 'fly-out-top':
      return { opacity: 1 - progress, translateX: 0, translateY: -300 * progress, scale: 1, blur: 0 };
    case 'fly-out-bottom':
      return { opacity: 1 - progress, translateX: 0, translateY: 300 * progress, scale: 1, blur: 0 };
    case 'zoom-out':
      return { opacity: 1 - progress, translateX: 0, translateY: 0, scale: 1 - progress * 0.5, blur: 0 };
    case 'blur-out':
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: progress * 20 };
    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
  }
}

// Main hook — call from any primitive to get animated style values
export function useAnimation(
  config: AnimationConfig = {},
  /** total frames this element is visible — needed for exit timing */
  totalFrames?: number,
): AnimationValues {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    entrance = 'fade-up',
    exit = 'none',
    delay = 0,
    entranceDuration = 25,
    exitDuration = 20,
    damping = 12,
    stiffness = 150,
    mass = 0.8,
  } = config;

  // Entrance — starts after delay
  const effectiveFrame = Math.max(0, frame - delay);
  const ent = computeEntrance(entrance, effectiveFrame, fps, entranceDuration, damping, stiffness, mass);

  // Exit — counts backwards from totalFrames
  let ext = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
  if (exit !== 'none' && totalFrames != null) {
    const framesUntilEnd = totalFrames - frame;
    if (framesUntilEnd <= exitDuration) {
      ext = computeExit(exit, framesUntilEnd, fps, exitDuration);
    }
  }

  // Combine entrance + exit — multiply opacities, add translations
  const opacity = ent.opacity * ext.opacity;
  const tx = ent.translateX + ext.translateX;
  const ty = ent.translateY + ext.translateY;
  const scale = ent.scale * ext.scale;
  const blur = ent.blur + ext.blur;

  // Build transform string
  const transformParts: string[] = [];
  if (tx !== 0 || ty !== 0) transformParts.push(`translate(${tx}px, ${ty}px)`);
  if (scale !== 1) transformParts.push(`scale(${scale})`);
  if (ent.rotate !== 0) transformParts.push(`rotate(${ent.rotate}deg)`);

  return {
    opacity,
    transform: transformParts.length > 0 ? transformParts.join(' ') : 'none',
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
  };
}
