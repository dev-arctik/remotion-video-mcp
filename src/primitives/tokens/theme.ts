// Theme — bundles all token sub-systems into a single object passed via React Context
// Any primitive can pull tokens via useTheme(): const { color, type, springs } = useTheme();
import React, { createContext, useContext } from 'react';
import { defaultColorRoles, palettes } from './color';
import type { ColorRoles, PaletteName } from './color';
import { defaultTypeScale, fontStacks } from './type';
import type { TypeScale, TypeStyleName, FontStack } from './type';
import { spacing, radius, elevation } from './spacing';
import { easing, duration, springs, transitionPatterns } from './motion';

export interface Theme {
  // What the theme is named (e.g., "editorial-dark")
  name: string;
  // Color roles — primary, on-primary, surface, etc.
  color: ColorRoles;
  // Type scale — display-large, headline-medium, body-small, etc.
  type: TypeScale;
  // Default font family (CSS stack) — applied to body text by default
  fontFamily: string;
  // Default heading font family — used for display + headline styles
  headingFontFamily: string;
  // Layout
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  // Motion
  easing: typeof easing;
  duration: typeof duration;
  springs: typeof springs;
  transitionPatterns: typeof transitionPatterns;
}

// ─── DEFAULT THEME ─────────────────────────────────────────────────────
export const defaultTheme: Theme = {
  name: 'editorial-dark',
  color: defaultColorRoles,
  type: defaultTypeScale,
  fontFamily: fontStacks.modern,
  headingFontFamily: fontStacks.modern,
  spacing,
  radius,
  elevation,
  easing,
  duration,
  springs,
  transitionPatterns,
};

// ─── BUILD A THEME FROM PARTIAL OVERRIDES ──────────────────────────────
// Used by ThemeProvider to merge user customization on top of defaults.
// Composition.json stores only overrides — full theme reconstructed at render time.
export interface ThemeOverrides {
  name?: string;
  palette?: PaletteName;
  colorOverrides?: Partial<ColorRoles>;
  typeOverrides?: Partial<TypeScale>;
  fontFamily?: string | FontStack;
  headingFontFamily?: string | FontStack;
}

export function buildTheme(overrides: ThemeOverrides = {}): Theme {
  // Resolve palette → color roles
  const baseColors = overrides.palette
    ? palettes[overrides.palette] ?? defaultColorRoles
    : defaultColorRoles;
  const color = { ...baseColors, ...(overrides.colorOverrides ?? {}) };

  // Type scale with optional per-style overrides
  const type = { ...defaultTypeScale };
  if (overrides.typeOverrides) {
    for (const [k, v] of Object.entries(overrides.typeOverrides)) {
      type[k as TypeStyleName] = { ...type[k as TypeStyleName], ...v };
    }
  }

  // Font family — string or named stack
  const resolveFont = (f: string | FontStack | undefined, fallback: string): string => {
    if (!f) return fallback;
    if (f in fontStacks) return fontStacks[f as FontStack];
    return f;
  };
  const fontFamily = resolveFont(overrides.fontFamily, fontStacks.modern);
  const headingFontFamily = resolveFont(overrides.headingFontFamily, fontFamily);

  return {
    ...defaultTheme,
    name: overrides.name ?? overrides.palette ?? defaultTheme.name,
    color,
    type,
    fontFamily,
    headingFontFamily,
  };
}

// ─── REACT CONTEXT ─────────────────────────────────────────────────────
const ThemeContext = createContext<Theme>(defaultTheme);

export interface ThemeProviderProps {
  theme?: Theme;
  overrides?: ThemeOverrides;
  children: React.ReactNode;
}

// Wrap your composition root with this. regenerateRootTsx() does this automatically.
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ theme, overrides, children }) => {
  const resolved = theme ?? buildTheme(overrides);
  return React.createElement(ThemeContext.Provider, { value: resolved }, children);
};

// Pull tokens in any primitive: const { color, type, springs } = useTheme();
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// Convenience: pull a single type style and return as React style object
export function useTypeStyle(name: TypeStyleName): React.CSSProperties {
  const { type, fontFamily, headingFontFamily } = useTheme();
  const style = type[name];
  // Display + headline styles get the heading font; everything else uses body font
  const isHeading = name.startsWith('display') || name.startsWith('headline');
  return {
    fontSize: style.fontSize,
    lineHeight: `${style.lineHeight}px`,
    letterSpacing: style.letterSpacing,
    fontWeight: style.fontWeight,
    fontFamily: style.fontFamily ?? (isHeading ? headingFontFamily : fontFamily),
  };
}
