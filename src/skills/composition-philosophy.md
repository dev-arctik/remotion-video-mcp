# Composition Philosophy — Compose, Don't Pick

## The Rule

**Build scenes by COMPOSING PRIMITIVES + DESIGN TOKENS in `componentCode`.**

Templates exist (`list_templates` returns them) but they are **inspiration only**.
The default path is `create_scene` with `componentCode` that imports from
`../src/primitives` and uses `useTheme()`.

## Why

Templates are 8 fixed shapes. Primitives are infinite. Templates lock styling decisions
inside the component; tokens make styling a single setter call (`set_theme`).

## What "good" composition looks like

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import {
  AnimatedText, AnimatedTextChars, Background, Gradient, FilmGrain,
  KenBurns, Glow, MotionBlur, useTheme, useTypeStyle,
} from '../src/primitives';

export const Scene001Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const titleStyle = useTypeStyle('displayLarge');

  return (
    <AbsoluteFill>
      <Gradient
        colors={[theme.color.primaryContainer, theme.color.background]}
        type="radial"
      />
      <FilmGrain intensity={0.06} />
      <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Glow color={theme.color.primary} intensity={32} animate>
          <AnimatedTextChars
            entrance="rotate-in"
            staggerPattern="center-out"
            staggerFrames={3}
            springPreset="bouncy"
            style={titleStyle}
          >
            REMOTION
          </AnimatedTextChars>
        </Glow>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

Notice:
- Zero hardcoded colors — all from `theme.color.*`
- Zero magic font sizes — all from `useTypeStyle('displayLarge')`
- Zero magic spring numbers — `springPreset="bouncy"` reads from theme
- Composition reads top-to-bottom: background, grain, content
- Each primitive does ONE thing; no template juggling

## What to avoid

```tsx
// ❌ BAD — hardcoded everything
<div style={{
  fontSize: 96,
  color: '#FFFFFF',
  backgroundColor: '#0F1115',
}}>...</div>

// ✅ GOOD — token-driven
<AnimatedText style={useTypeStyle('displayLarge')}>...</AnimatedText>
```

```tsx
// ❌ BAD — per-character opacity (broken pattern)
{chars.map((c, i) => <span style={{ opacity: frame > i*2 ? 1 : 0 }}>{c}</span>)}

// ✅ GOOD — for plain typewriter, use string slicing
const visibleChars = Math.floor(frame * (chars.length / totalFrames));
return <AnimatedText>{text.slice(0, visibleChars)}</AnimatedText>;

// ✅ GOOD — for animated reveals, use AnimatedTextChars
<AnimatedTextChars entrance="fade-up" staggerFrames={2}>{text}</AnimatedTextChars>
```

```tsx
// ❌ BAD — CSS transitions (Remotion ignores these at render time)
<div style={{ transition: 'opacity 0.3s' }} />

// ✅ GOOD — drive animation off useCurrentFrame()
const opacity = interpolate(frame, [0, 10], [0, 1]);
<div style={{ opacity }} />
```

## Discovery before writing

Before any non-trivial scene:
1. `list_primitives` — what building blocks exist
2. `list_tokens` — what colors/type/motion are themed
3. `list_motion_presets` — entrance/exit/transition catalog

These tools are STATIC and free to call. Use them.
