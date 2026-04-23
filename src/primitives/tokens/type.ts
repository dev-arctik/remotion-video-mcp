// Type tokens — Material 3 type scale, scaled for video (1080p-first)
// Source: TypeScaleTokens.kt from compose-material3
//
// M3 web sizes are designed for ~1280px UI. For 1080p video we scale ×2.5.
// Override per-token via set_theme if your video size or aspect differs.

export interface TypeStyle {
  fontSize: number;       // px
  lineHeight: number;     // px (absolute, not ratio — easier for video)
  letterSpacing: number;  // px
  fontWeight: number;     // 100..900
  fontFamily?: string;    // overrides theme.fontFamily if set
}

export interface TypeScale {
  displayLarge: TypeStyle;
  displayMedium: TypeStyle;
  displaySmall: TypeStyle;
  headlineLarge: TypeStyle;
  headlineMedium: TypeStyle;
  headlineSmall: TypeStyle;
  titleLarge: TypeStyle;
  titleMedium: TypeStyle;
  titleSmall: TypeStyle;
  bodyLarge: TypeStyle;
  bodyMedium: TypeStyle;
  bodySmall: TypeStyle;
  labelLarge: TypeStyle;
  labelMedium: TypeStyle;
  labelSmall: TypeStyle;
}

const SCALE = 2.5; // 1080p multiplier
const s = (n: number) => Math.round(n * SCALE);

// ─── DEFAULT M3 TYPE SCALE — scaled for 1080p ─────────────────────────
export const defaultTypeScale: TypeScale = {
  displayLarge:   { fontSize: s(57), lineHeight: s(64), letterSpacing: -0.5, fontWeight: 400 },
  displayMedium:  { fontSize: s(45), lineHeight: s(52), letterSpacing: 0,    fontWeight: 400 },
  displaySmall:   { fontSize: s(36), lineHeight: s(44), letterSpacing: 0,    fontWeight: 400 },
  headlineLarge:  { fontSize: s(32), lineHeight: s(40), letterSpacing: 0,    fontWeight: 600 },
  headlineMedium: { fontSize: s(28), lineHeight: s(36), letterSpacing: 0,    fontWeight: 600 },
  headlineSmall:  { fontSize: s(24), lineHeight: s(32), letterSpacing: 0,    fontWeight: 600 },
  titleLarge:     { fontSize: s(22), lineHeight: s(28), letterSpacing: 0,    fontWeight: 500 },
  titleMedium:    { fontSize: s(16), lineHeight: s(24), letterSpacing: 0.15, fontWeight: 500 },
  titleSmall:     { fontSize: s(14), lineHeight: s(20), letterSpacing: 0.1,  fontWeight: 500 },
  bodyLarge:      { fontSize: s(16), lineHeight: s(24), letterSpacing: 0.15, fontWeight: 400 },
  bodyMedium:     { fontSize: s(14), lineHeight: s(20), letterSpacing: 0.25, fontWeight: 400 },
  bodySmall:      { fontSize: s(12), lineHeight: s(16), letterSpacing: 0.4,  fontWeight: 400 },
  labelLarge:     { fontSize: s(14), lineHeight: s(20), letterSpacing: 0.1,  fontWeight: 500 },
  labelMedium:    { fontSize: s(12), lineHeight: s(16), letterSpacing: 0.5,  fontWeight: 500 },
  labelSmall:     { fontSize: s(11), lineHeight: s(16), letterSpacing: 0.5,  fontWeight: 500 },
};

export type TypeStyleName = keyof TypeScale;

// ─── VARIABLE FONT AXES ────────────────────────────────────────────────
// 2026 motion design leans on variable fonts (Inter, Roboto Flex, Space Grotesk).
// Animate `font-variation-settings` for kinetic typography.
export type FontVariationAxes = {
  wght?: number;  // weight 100..900
  wdth?: number;  // width 75..125
  slnt?: number;  // slant -10..0
  ital?: number;  // italic 0..1
  opsz?: number;  // optical size
};

export function fontVariationCss(axes: FontVariationAxes): string {
  return Object.entries(axes)
    .map(([k, v]) => `"${k}" ${v}`)
    .join(', ');
}

// ─── RECOMMENDED FONT STACKS ───────────────────────────────────────────
// All available via @remotion/google-fonts as named imports.
export const fontStacks = {
  // Variable geometric sans — works everywhere, default pick
  modern: 'Inter, system-ui, -apple-system, sans-serif',
  // Display fonts that hold up in video at low frame rates
  display: 'Space Grotesk, Inter, sans-serif',
  // Editorial / serif
  editorial: 'Fraunces, Playfair Display, Georgia, serif',
  // Monospace for code
  mono: 'JetBrains Mono, Fira Code, Consolas, monospace',
  // Bold display — brutalist / poster aesthetic
  poster: 'Bricolage Grotesque, Archivo Black, Impact, sans-serif',
} as const;

export type FontStack = keyof typeof fontStacks;
