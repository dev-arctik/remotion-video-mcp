// Spacing + radius + elevation tokens
// 4px base grid, scaled ×2 for 1080p video

const BASE = 8; // 4px × 2 for video

// ─── SPACING SCALE (8-point grid) ──────────────────────────────────────
export const spacing = {
  none: 0,
  xs: BASE * 1,    // 8
  sm: BASE * 2,    // 16
  md: BASE * 3,    // 24
  lg: BASE * 4,    // 32
  xl: BASE * 6,    // 48
  '2xl': BASE * 8, // 64
  '3xl': BASE * 12,// 96
  '4xl': BASE * 16,// 128
  '5xl': BASE * 24,// 192
  '6xl': BASE * 32,// 256
} as const;

export type SpacingToken = keyof typeof spacing;

// ─── RADIUS (M3 shape scale) ───────────────────────────────────────────
export const radius = {
  none: 0,
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

// ─── ELEVATION (shadow tokens) ─────────────────────────────────────────
// M3 5-level elevation. Higher = more lifted from surface.
export const elevation = {
  level0: 'none',
  level1: '0 1px 2px rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)',
  level2: '0 1px 2px rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)',
  level3: '0 1px 3px rgba(0,0,0,0.30), 0 4px 8px 3px rgba(0,0,0,0.15)',
  level4: '0 2px 3px rgba(0,0,0,0.30), 0 6px 10px 4px rgba(0,0,0,0.15)',
  level5: '0 4px 4px rgba(0,0,0,0.30), 0 8px 12px 6px rgba(0,0,0,0.15)',
} as const;

export type ElevationToken = keyof typeof elevation;
