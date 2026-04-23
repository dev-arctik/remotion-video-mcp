// Color tokens — Material 3 color roles + on-X pairing
// Source: m3.material.io/styles/color/roles
//
// Why this matters: M3 pairs every "container" color with an "on-X" color
// guaranteed to meet WCAG contrast. Text on a primary background uses
// on-primary, text on surface uses on-surface, etc. This single rule fixes
// ~80% of "AI-generated video" contrast issues.

export interface ColorRoles {
  // Brand
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  // Status
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // Surface (the canvas — backgrounds, cards, sheets)
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;

  // Surface elevation tones — M3 5-level scale
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  // Outline & inverse
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
}

// ─── DEFAULT PALETTE — "Editorial Dark" ────────────────────────────────
// Designed for video: high contrast, cinematic, blue-green leaning per 2026
// trend reports. Override entirely via set_theme tool if you want a brand palette.
export const defaultColorRoles: ColorRoles = {
  primary: '#A8C7FA',
  onPrimary: '#062E6F',
  primaryContainer: '#284777',
  onPrimaryContainer: '#D3E3FD',

  secondary: '#BFC6DC',
  onSecondary: '#293041',
  secondaryContainer: '#3F4759',
  onSecondaryContainer: '#DCE2F9',

  tertiary: '#DEBCDF',
  onTertiary: '#402843',
  tertiaryContainer: '#583E5B',
  onTertiaryContainer: '#FBD7FB',

  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',

  background: '#0F1115',
  onBackground: '#E2E2E9',
  surface: '#0F1115',
  onSurface: '#E2E2E9',
  surfaceVariant: '#44474F',
  onSurfaceVariant: '#C4C6D0',

  surfaceContainerLowest: '#0A0C10',
  surfaceContainerLow: '#181A1F',
  surfaceContainer: '#1C1E23',
  surfaceContainerHigh: '#26282D',
  surfaceContainerHighest: '#313338',

  outline: '#8E9099',
  outlineVariant: '#44474F',
  inverseSurface: '#E2E2E9',
  inverseOnSurface: '#2F3036',
  inversePrimary: '#415F91',
};

// ─── ALTERNATE PALETTES ────────────────────────────────────────────────
export const palettes: Record<string, ColorRoles> = {
  'editorial-dark': defaultColorRoles,

  'editorial-light': {
    ...defaultColorRoles,
    primary: '#415F91',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D3E3FD',
    onPrimaryContainer: '#001847',
    background: '#F9F9FF',
    onBackground: '#191C20',
    surface: '#F9F9FF',
    onSurface: '#191C20',
    surfaceVariant: '#E0E2EC',
    onSurfaceVariant: '#44474F',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F3F3FA',
    surfaceContainer: '#EDEEF4',
    surfaceContainerHigh: '#E7E8EE',
    surfaceContainerHighest: '#E1E2E9',
    outline: '#74777F',
    outlineVariant: '#C4C6D0',
    inverseSurface: '#2E3035',
    inverseOnSurface: '#F0F0F7',
    inversePrimary: '#A8C7FA',
  },

  'cinematic-noir': {
    ...defaultColorRoles,
    primary: '#FFFFFF',
    onPrimary: '#000000',
    background: '#000000',
    onBackground: '#FFFFFF',
    surface: '#000000',
    onSurface: '#FFFFFF',
    primaryContainer: '#1A1A1A',
    onPrimaryContainer: '#FFFFFF',
    accentEmphasis: '#FFD700',
  } as ColorRoles & { accentEmphasis: string },

  'electric-blue': {
    ...defaultColorRoles,
    primary: '#0066FF',
    onPrimary: '#FFFFFF',
    primaryContainer: '#0044CC',
    onPrimaryContainer: '#FFFFFF',
    secondary: '#FF3366',
    onSecondary: '#FFFFFF',
    background: '#0A0E1A',
    onBackground: '#E8F0FF',
    surface: '#0A0E1A',
    onSurface: '#E8F0FF',
  },

  'forest-warm': {
    ...defaultColorRoles,
    primary: '#5DA48E',
    onPrimary: '#00382C',
    secondary: '#E6A86C',
    onSecondary: '#3E2700',
    background: '#1A1F1B',
    onBackground: '#E2E3DD',
    surface: '#1A1F1B',
    onSurface: '#E2E3DD',
  },
};

export type PaletteName = keyof typeof palettes;
