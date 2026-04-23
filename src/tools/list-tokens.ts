import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Static catalog of design tokens — no projectPath required.
// Mirrors src/primitives/tokens/* so Claude can pick token NAMES rather than guess values.
const TOKEN_CATALOG = {
  palettes: [
    { name: 'editorial-dark', description: 'Default. Cool blue-leaning M3 dark — high contrast, cinematic.' },
    { name: 'editorial-light', description: 'Light variant of editorial-dark.' },
    { name: 'cinematic-noir', description: 'Pure black & white with optional gold accent. Dramatic.' },
    { name: 'electric-blue', description: 'Saturated electric blue + crimson accents. Bold, modern.' },
    { name: 'forest-warm', description: 'Muted teal + warm amber. Organic, grounded.' },
  ],
  colorRoles: [
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
    'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
    'error', 'onError', 'errorContainer', 'onErrorContainer',
    'background', 'onBackground', 'surface', 'onSurface',
    'surfaceVariant', 'onSurfaceVariant',
    'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
    'surfaceContainerHigh', 'surfaceContainerHighest',
    'outline', 'outlineVariant',
    'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  ],
  colorRolePairingRule: 'Every container color has an `on-X` text counterpart guaranteed to meet WCAG contrast. Text on `primary` background uses `onPrimary`. Text on `surface` uses `onSurface`. Follow this rule and contrast is fixed for free.',

  typeScale: {
    description: 'M3 type scale, scaled ×2.5 for 1080p video. Override per-style via set_theme.typeOverrides.',
    styles: [
      { name: 'displayLarge', defaults: { fontSize: 143, lineHeight: 160, fontWeight: 400 } },
      { name: 'displayMedium', defaults: { fontSize: 113, lineHeight: 130, fontWeight: 400 } },
      { name: 'displaySmall', defaults: { fontSize: 90, lineHeight: 110, fontWeight: 400 } },
      { name: 'headlineLarge', defaults: { fontSize: 80, lineHeight: 100, fontWeight: 600 } },
      { name: 'headlineMedium', defaults: { fontSize: 70, lineHeight: 90, fontWeight: 600 } },
      { name: 'headlineSmall', defaults: { fontSize: 60, lineHeight: 80, fontWeight: 600 } },
      { name: 'titleLarge', defaults: { fontSize: 55, lineHeight: 70, fontWeight: 500 } },
      { name: 'titleMedium', defaults: { fontSize: 40, lineHeight: 60, fontWeight: 500 } },
      { name: 'titleSmall', defaults: { fontSize: 35, lineHeight: 50, fontWeight: 500 } },
      { name: 'bodyLarge', defaults: { fontSize: 40, lineHeight: 60, fontWeight: 400 } },
      { name: 'bodyMedium', defaults: { fontSize: 35, lineHeight: 50, fontWeight: 400 } },
      { name: 'bodySmall', defaults: { fontSize: 30, lineHeight: 40, fontWeight: 400 } },
      { name: 'labelLarge', defaults: { fontSize: 35, lineHeight: 50, fontWeight: 500 } },
      { name: 'labelMedium', defaults: { fontSize: 30, lineHeight: 40, fontWeight: 500 } },
      { name: 'labelSmall', defaults: { fontSize: 28, lineHeight: 40, fontWeight: 500 } },
    ],
  },

  fontStacks: [
    { name: 'modern', stack: 'Inter, system-ui, -apple-system, sans-serif', use: 'Default body — variable, clean' },
    { name: 'display', stack: 'Space Grotesk, Inter, sans-serif', use: 'Display headlines, posters' },
    { name: 'editorial', stack: 'Fraunces, Playfair Display, Georgia, serif', use: 'Magazine, editorial' },
    { name: 'mono', stack: 'JetBrains Mono, Fira Code, Consolas, monospace', use: 'Code blocks, technical' },
    { name: 'poster', stack: 'Bricolage Grotesque, Archivo Black, Impact, sans-serif', use: 'Brutalist, posters' },
  ],

  durations: {
    description: 'M3 duration tokens in milliseconds. Use ms() helper to convert to frames at fps.',
    tokens: ['short1=50', 'short2=100', 'short3=150', 'short4=200', 'medium1=250', 'medium2=300', 'medium3=350', 'medium4=400', 'long1=450', 'long2=500', 'long3=550', 'long4=600', 'extraLong1=700', 'extraLong2=800', 'extraLong3=900', 'extraLong4=1000'],
  },

  easings: {
    description: 'M3 cubic-bezier easing curves',
    tokens: [
      { name: 'standard', value: '[0.2, 0, 0, 1]', use: 'Small utility transitions' },
      { name: 'standardDecelerate', value: '[0, 0, 0, 1]', use: 'Quick enter' },
      { name: 'standardAccelerate', value: '[0.3, 0, 1, 1]', use: 'Quick exit' },
      { name: 'emphasized', value: '[0.2, 0, 0, 1]', use: 'Hero transitions, M3 default' },
      { name: 'emphasizedDecelerate', value: '[0.05, 0.7, 0.1, 1]', use: 'Elements entering screen' },
      { name: 'emphasizedAccelerate', value: '[0.3, 0, 0.8, 0.15]', use: 'Elements leaving screen' },
      { name: 'linear', value: '[0, 0, 1, 1]', use: 'Color/opacity only' },
    ],
  },

  springs: {
    description: 'Pre-tuned spring configs — pass to spring() or to primitives via springPreset prop',
    presets: [
      { name: 'smooth', config: { damping: 30, stiffness: 100, mass: 1 }, use: 'Apple "smooth" — bounce 0' },
      { name: 'snappy', config: { damping: 20, stiffness: 180, mass: 1 }, use: 'Apple "snappy" — small bounce' },
      { name: 'bouncy', config: { damping: 12, stiffness: 200, mass: 1 }, use: 'Apple "bouncy" — visible overshoot' },
      { name: 'punchy', config: { damping: 200, stiffness: 100, mass: 0.5 }, use: 'Pro entrance — fast, no bounce' },
      { name: 'gentle', config: { damping: 15, stiffness: 80, mass: 1 }, use: 'Slow ease' },
      { name: 'playful', config: { damping: 8, stiffness: 200, mass: 1 }, use: 'Overshoot then settle' },
      { name: 'rigid', config: { damping: 100, stiffness: 300, mass: 0.3 }, use: 'Near-linear, instant' },
    ],
  },

  spacing: {
    description: '8-point grid scaled ×2 for 1080p',
    tokens: 'none=0, xs=8, sm=16, md=24, lg=32, xl=48, 2xl=64, 3xl=96, 4xl=128, 5xl=192, 6xl=256',
  },

  radius: {
    description: 'M3 shape scale',
    tokens: 'none=0, xs=8, sm=16, md=24, lg=32, xl=48, full=9999',
  },

  elevation: {
    description: 'M3 5-level shadow scale',
    tokens: 'level0..level5 — higher = more lifted (CSS box-shadow strings)',
  },

  transitionPatterns: {
    description: 'M3 transition pattern guidance — duration + easing pairs',
    patterns: [
      { name: 'containerTransform', duration: 'long2 (500ms)', easing: 'emphasized', use: 'Element morphs into another' },
      { name: 'sharedAxisX', duration: 'medium2 (300ms)', easing: 'standard', use: 'Sibling navigation X' },
      { name: 'sharedAxisY', duration: 'medium2 (300ms)', easing: 'standard', use: 'Sibling navigation Y' },
      { name: 'sharedAxisZ', duration: 'medium2 (300ms)', easing: 'standard', use: 'Sibling navigation Z (zoom)' },
      { name: 'fadeThroughOut', duration: 'short2 (100ms)', easing: 'standardAccelerate', use: 'Out half of fade-through' },
      { name: 'fadeThroughIn', duration: 'short3 (150ms)', easing: 'standardDecelerate', use: 'In half of fade-through' },
      { name: 'fade', duration: 'short3 (150ms)', easing: 'standard', use: 'Modal in/out' },
    ],
  },
};

export function registerListTokens(server: McpServer): void {
  server.registerTool(
    'list_tokens',
    {
      title: 'List Design Tokens',
      description: `Static catalog of all design tokens — palettes, color roles, type scale, font stacks,
durations, easings, springs, spacing, radius, elevation, transition patterns. Use this BEFORE
writing componentCode so you pick from the design system instead of guessing values.
No projectPath required.`,
      inputSchema: {},
    },
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            tokens: TOKEN_CATALOG,
            usage: {
              fromComponentCode: 'import { useTheme } from "../src/primitives/tokens"; then `const { color, type, springs } = useTheme()`. All tokens reachable.',
              fromMcp: 'Set theme via set_theme tool. Available palettes + color roles + type styles listed above.',
              philosophy: 'Pull from these tokens. Do not hardcode hex colors, magic font sizes, or arbitrary durations. The whole point of the token system is to keep videos visually consistent.',
            },
          }, null, 2),
        }],
      };
    }
  );
}
