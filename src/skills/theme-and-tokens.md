# Design Tokens — set once, propagate everywhere

The MCP ships a Material 3-derived design token system. Every primitive reads from
`useTheme()`. Set tokens once with `set_theme` and the entire video updates.

## What's themed

- **Color** — M3 color roles with `on-X` text-pairing rule
- **Typography** — M3 type scale, scaled ×2.5 for 1080p, with named font stacks
- **Motion** — easings (M3 cubic-beziers), durations (M3 ms tokens), spring presets (Apple SwiftUI)
- **Layout** — 8-pt spacing grid, M3 radius scale, M3 5-level elevation

## Setting the theme

```
set_theme({
  projectPath,
  palette: 'electric-blue',           // base palette
  colorOverrides: { primary: '#FF0066' },  // override individual roles
  fontFamily: 'modern',               // named stack OR CSS string
  headingFontFamily: 'display',
  typeOverrides: { displayLarge: { fontSize: 200 } },
})
```

`set_theme` is INCREMENTAL — call multiple times to layer overrides.

## Reading tokens in componentCode

```tsx
import { useTheme, useTypeStyle } from '../src/primitives';

const Scene = () => {
  const theme = useTheme();
  const titleStyle = useTypeStyle('displayLarge');

  return (
    <div style={{ backgroundColor: theme.color.background, color: theme.color.onBackground }}>
      <h1 style={titleStyle}>Themed</h1>
      <div style={{ padding: theme.spacing.xl, borderRadius: theme.radius.lg }}>...</div>
    </div>
  );
};
```

## Why on-X pairing matters

Every container color (`primary`, `secondary`, `surface`, etc.) has an `on-X` text counterpart
guaranteed to meet WCAG contrast. **Always pair them**:

| Background | Text |
|---|---|
| `theme.color.primary` | `theme.color.onPrimary` |
| `theme.color.secondaryContainer` | `theme.color.onSecondaryContainer` |
| `theme.color.surface` | `theme.color.onSurface` |
| `theme.color.surfaceContainerHigh` | `theme.color.onSurface` |

Skip the pairing → contrast bugs that only show up after rendering.

## Don't hardcode

```tsx
// ❌ Hardcoded
<div style={{ color: '#FFFFFF', fontSize: 72, fontFamily: 'Arial' }}>...</div>

// ✅ Themed
<div style={{ ...useTypeStyle('headlineLarge'), color: theme.color.onSurface }}>...</div>
```

When you hardcode, you bypass the design system and `set_theme` no longer affects that scene.

## Available palettes

- `editorial-dark` — default, M3 cool blue dark
- `editorial-light` — same but light
- `cinematic-noir` — pure B&W
- `electric-blue` — saturated blue + crimson
- `forest-warm` — teal + amber

Pick one with `set_theme`, then layer brand overrides via `colorOverrides`.
