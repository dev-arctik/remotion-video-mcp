// Motion tokens — easings, durations, spring presets
// Sources: Material 3 (m3.material.io/styles/motion), Apple HIG / SwiftUI, IBM Carbon
//
// Use these instead of guessing values. Pulling from real design systems is
// the difference between "AI-generic" motion and "designed" motion.

// ─── EASING (Material 3) ──────────────────────────────────────────────
// All values are CSS cubic-bezier control points. M3 'emphasized' is
// technically a 3-point spline; we approximate with a 1-cubic equivalent.
export const easing = {
  // Standard — small, utility transitions
  standard: [0.2, 0, 0, 1] as const,
  standardDecelerate: [0, 0, 0, 1] as const,
  standardAccelerate: [0.3, 0, 1, 1] as const,
  // Emphasized — hero transitions, the M3 default
  emphasized: [0.2, 0, 0, 1] as const,
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1] as const,
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15] as const,
  // Linear — color/opacity only, never motion
  linear: [0, 0, 1, 1] as const,
} as const;

export type EasingToken = keyof typeof easing;

// CSS string for transition or animation properties
export function easingCss(token: EasingToken): string {
  const [a, b, c, d] = easing[token];
  return `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
}

// ─── DURATIONS (Material 3, in milliseconds) ──────────────────────────
// Convert to frames at composition time: ms / 1000 * fps
export const duration = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  extraLong1: 700,
  extraLong2: 800,
  extraLong3: 900,
  extraLong4: 1000,
} as const;

export type DurationToken = keyof typeof duration;

// Convert ms to frames at the given fps — use this in spring/interpolate calls
export function ms(token: DurationToken | number, fps: number): number {
  const v = typeof token === 'number' ? token : duration[token];
  return Math.round((v / 1000) * fps);
}

// ─── SPRING PRESETS (Apple SwiftUI + Material 3 hybrid) ───────────────
// Plug into Remotion's spring({ config: ... }) call.
// Format matches Remotion: { damping, stiffness, mass }
export const springs = {
  // Apple SwiftUI presets — translated to Remotion spring config
  smooth: { damping: 30, stiffness: 100, mass: 1 },         // bounce 0
  snappy: { damping: 20, stiffness: 180, mass: 1 },          // bounce ~0.15
  bouncy: { damping: 12, stiffness: 200, mass: 1 },          // bounce ~0.3

  // Use-case named presets — pulled from Remotion best practices
  punchy: { damping: 200, stiffness: 100, mass: 0.5 },       // fast, no bounce — pro entrance
  gentle: { damping: 15, stiffness: 80, mass: 1 },           // slow ease
  playful: { damping: 8, stiffness: 200, mass: 1 },          // overshoot then settle
  rigid: { damping: 100, stiffness: 300, mass: 0.3 },        // near-linear, instant
} as const;

export type SpringPreset = keyof typeof springs;

// ─── TRANSITION PATTERN GUIDANCE (M3) ─────────────────────────────────
// Each pattern names a (duration, easing) pair to use together.
// Shape: M3 Motion docs § "Transitions"
export const transitionPatterns = {
  containerTransform: { duration: 'long2' as DurationToken, easing: 'emphasized' as EasingToken },
  sharedAxisX: { duration: 'medium2' as DurationToken, easing: 'standard' as EasingToken },
  sharedAxisY: { duration: 'medium2' as DurationToken, easing: 'standard' as EasingToken },
  sharedAxisZ: { duration: 'medium2' as DurationToken, easing: 'standard' as EasingToken },
  fadeThroughOut: { duration: 'short2' as DurationToken, easing: 'standardAccelerate' as EasingToken },
  fadeThroughIn: { duration: 'short3' as DurationToken, easing: 'standardDecelerate' as EasingToken },
  fade: { duration: 'short3' as DurationToken, easing: 'standard' as EasingToken },
} as const;

export type TransitionPattern = keyof typeof transitionPatterns;
