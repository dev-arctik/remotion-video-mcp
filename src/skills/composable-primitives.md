---
name: composable-primitives
description: Building scenes with AnimatedText, AnimatedImage, Background, LayoutStack, Stagger and other primitives
metadata:
  tags: primitives, layout, animation, text, image, shape, background, stagger, scene
---

# Composable Primitives

Scenes are built by composing primitives — small, reusable components that handle animation, layout, and visual effects. Import from `'../src/primitives'`.

---

## ⛔ MOTION REST STATE — read first

**Text and UI elements enter and HOLD STILL until exit.**

This is the single most important rule for AI-authored Remotion scenes. Continuous oscillation on content elements is the #1 cause of unwatchable output.

| ❌ Forbidden on text / titles / captions / chips / badges / layout containers | ✅ Required pattern |
|---|---|
| `Math.sin(frame / N * 2π)` riding on `scale()` or `translate()` | `<AnimatedText animation={{ entrance: 'fade-up' }}>` then nothing else |
| `useBeat({ tier: 'beat' }).pulse` applied to `transform` on text | One-shot spring entrance via `animation.entrance`, then static |
| `useAudioReactive()` driving title `transform` or `opacity` continuously | Element appears once, holds, then exits via `animation.exit` |
| Any continuous oscillator running the entire scene length on a content element | Cut the scene on a beat instead — that gives the sync feeling |

**Why:** at 120 BPM, beat-by-beat motion = 2 hits per second. The eye reads this as throbbing, not rhythm. Multiple elements oscillating in-phase make the entire scene "breathe" continuously, which is unwatchable. The sync feeling comes from **scene cuts landing on bass-drops** and **entrance timing landing on beats**, not from elements moving during them.

**Decorative-only exceptions** — these CAN use continuous reactivity because they ARE the visualization:
- Spectrum bars / waveforms (`<AnimatedShape>` with audio-driven `height`)
- Particle systems (small `<AnimatedShape>` with audio-driven count/size/glow)
- Background gradients (audio-driven color shift)
- Decorative rings or geometric accents (one-shot `pulse` on `tier: 'downbeat'` or `tier: 'phrase-4'` with `decayFrames`)

If you find yourself reaching for `useBeat({ tier: 'beat' })` on a content element, stop and ask: "Could a scene cut at this frame give the same feeling?" Almost always: yes.

See the full rules + good/bad examples in the `audio-events-and-reactivity` skill doc.

---

## ⛔ LAYOUT BUDGET — fit content inside the safe zone

A scene canvas is **1920 × 1080** but the content area is smaller. Persistent chrome (SectionHeader, Footer, corner crosshairs) reserves bands at the top and bottom. Content placed top-down without a vertical budget collides with chrome — the #1 cause of unrenderable scenes.

### The 1080p chrome zones (defaults)

```
y =    0 ─────────────────────────────────────────────  (top edge)
       │  TOP CHROME BAND (180px)                      │
       │  • 96px corner crosshair margin               │
       │  • 84px reserved for SectionHeader            │
y =  180 ─────────────────────────────────────────────  ┐
       │                                               │
       │  SAFE CONTENT ZONE (1728 × 750)               │  ← content lives HERE
       │  • horizontal: 96px margin each side          │
       │  • vertical:   180–930                        │
       │  • max stack height: 750px                    │
       │                                               │
y =  930 ─────────────────────────────────────────────  ┘
       │  BOTTOM CHROME BAND (150px)                   │
       │  • 96px corner crosshair margin               │
       │  • 54px reserved for Footer                   │
y = 1080 ─────────────────────────────────────────────  (bottom edge)
```

If your scene uses different chrome sizes, override via the `chrome` prop on `<SafeArea>` — but pick a budget BEFORE writing content, not after watching it overflow.

### The required pattern

Use `<SafeArea>` as the wrapper for scene CONTENT. Render chrome (SectionHeader, Footer) as siblings OUTSIDE the SafeArea:

```tsx
import { AbsoluteFill } from 'remotion';
import { SafeArea, AnimatedText, LayoutStack } from '../src/primitives';

export const Scene: React.FC = () => (
  <AbsoluteFill style={{ background: '#0F1115' }}>
    <SectionHeader>SCENE 7 · TRANSITIONS</SectionHeader>      {/* in top chrome */}
    <SafeArea align="center" justify="center">
      <LayoutStack direction="vertical" gap={32} align="center">
        <AnimatedText animation={{ entrance: 'fade-up' }}>HEADING</AnimatedText>
        <YourContent />
      </LayoutStack>
    </SafeArea>
    <Footer>007 · 00:01:23</Footer>                            {/* in bottom chrome */}
  </AbsoluteFill>
);
```

`SafeArea` defaults to `overflow: hidden` — if content overflows the safe zone, it gets clipped immediately. **The clipping is intentional** — it makes the violation visually obvious during preview rather than letting it sneak past until render. Pass `debug={true}` to render translucent guides while iterating.

### Budget heuristics for content

When sizing content inside the 750px safe zone:

| Content type | Reasonable height budget |
|---|---|
| Single-line big display (`fontSize: 140`) | ~180px (font + descender) |
| Two-line headline (`fontSize: 80`) | ~200px |
| Body paragraph (3 lines @ `fontSize: 32`) | ~150px |
| Bullet list (5 items, default spacing) | ~280px |
| 3-column data row | ~120px per row |
| 2×3 grid card cell | ~180px per cell (×2 rows = 360px) |
| Image with overlay text | 400–500px |

Add stack gaps (`gap: 24` × N rows) and **always sum the heights before writing the JSX**. If your sum exceeds 750px, you have three options:

1. Drop a row or item
2. Shrink font sizes (display → headline scale tier)
3. Move chrome out of the way (custom `chrome` prop on `<SafeArea>`)

Never just "see what happens" — stack-overflow on text is unrecoverable in Remotion (no scrollbars at render time, content just sits clipped).

### Common mistakes that overflow

- ❌ Stacking content from `top: 0` instead of using SafeArea — places content in the SectionHeader band
- ❌ Using `bottom: 96` for footer placement WITHOUT counting the footer's own height (54px) — overlap
- ❌ Forgetting that `lineHeight: 0.9` doesn't shrink the bounding box — descenders still extend ~15% past nominal `fontSize`
- ❌ Tables/grids sized by `cellHeight × rowCount` without subtracting borders + gaps
- ❌ Absolute-positioning a watermark or rubber stamp on top of readable code/text — even if visually intentional, the underlying text is now unreadable

### When NOT to use SafeArea

- Full-bleed background images (`<KenBurns>` filling the full canvas)
- Decorative overlays that ARE the chrome (a film grain or vignette covering everything)
- Transition wipes / scene morphs that span the whole canvas

For these, position elements directly inside `<AbsoluteFill>`. The rule is: **content** goes in SafeArea, **decorative full-canvas effects** go outside.

---

## ⛔ NO DECORATIVE COLOR WITHOUT SEMANTICS

When you apply an accent color (red highlight, gold border, glow, contrasting fill) to *some* items in a set of similar items, the rule that selects those items must be **expressible in one sentence that a viewer could guess from the scene alone**.

Arbitrary patterns like `i % 5 === 2` or "every 3rd row" or "first and last" are decorative noise — they tell the viewer "these N items are different" without telling them WHY. The viewer's brain spends cycles trying to infer meaning that doesn't exist, then disengages.

### The one-sentence test

Say the highlighting rule out loud. If it sounds like:

| ✅ Passes (semantic — ship it) | ❌ Fails (arbitrary — remove or remap) |
|---|---|
| "These are the audio-related primitives." | "Every 5th tile starting from index 2." |
| "This is the first one — start here." (single focal) | "I wanted some visual rhythm." |
| "These are the new additions in v2." | "Two random tiles to break uniformity." |
| "This is the currently-active step." | "Every other one is highlighted." |
| "Deprecated items render dimmed." | "Indices 3 and 8 because it looked balanced." |

### Patterns that pass

```tsx
// ✅ Categorical — viewer can infer the category from item context
const isHighlighted = item.category === 'audio-related';

// ✅ Single hero / focal point — brutalist-friendly, reads as "start here"
const isHero = i === 0;

// ✅ State-driven — accent moves with a real signal (active step, current beat, hovered)
const isActive = currentStep === item.id;

// ✅ Status-derived — color encodes a property the viewer can verify
const tone = item.deprecated ? 'dim' : 'normal';
```

### Patterns that fail

```tsx
// ❌ Arbitrary modulo — no reason 2 of 12 should differ
const highlight = i % 5 === 2;

// ❌ Hardcoded indices with no explanation in the scene
const accent = (i === 3 || i === 7) ? 'red' : 'white';

// ❌ "Every other" applied to a uniform set
const stripe = i % 2 === 0 ? '#FFF' : '#EEE';   // (zebra is fine for tables; not for a tile grid of equal items)

// ❌ Random for "rhythm" — animated chaos with no beat anchor
const randomAccent = (frame + i) % 7 === 0;
```

### When in doubt: uniform > decorative

A boring honest grid beats a noisy decorative one. If you can't articulate the rule in one sentence, **make all items the same**. Visual interest comes from the GRID itself (typography, spacing, layout) — not from arbitrary accent colors.

If you genuinely need a focal point in an otherwise uniform set, pick **one** item and have a reason ("start here", "primary action", "today"). Two arbitrarily-accented items reads as broken; one accented item reads as intentional.

### Special case — animated accent

A moving accent (one tile lit at a time, changing on each beat or scene boundary) is fine **if the change is anchored to a real signal**:

```tsx
// ✅ Anchor the accent to a beat tier or scene timeline
const { isOnBeat, beatIndex } = useBeat({ tier: 'downbeat', tolerance: 1 });
const accentIndex = beatIndex % items.length;
return items.map((item, i) => (
  <Tile key={i} highlighted={i === accentIndex} />
));

// ❌ Random/frame-driven accent with no anchor — noise
const accentIndex = Math.floor(frame / 30) % items.length;
```

The audio-rest-state rule applies here too: anchor color movement to discrete events (beats, cuts, state changes), never to continuous frame-driven oscillation.

---

## Available Primitives

### Content Primitives

**AnimatedText** — text with entrance/exit animations and typography control

```tsx
<AnimatedText
  fontSize={72}
  fontWeight="bold"
  color="#FFFFFF"
  fontFamily="Inter"
  textAlign="center"
  lineHeight={1.2}
  letterSpacing={-1}
  textTransform="uppercase"
  maxWidth={800}
  animation={{
    entrance: 'fly-from-left',
    exit: 'fade-out',
    delay: 10,
    entranceDuration: 25,
    exitDuration: 20,
    damping: 12,
    stiffness: 150,
  }}
  totalFrames={90} // needed for exit timing
>
  Your Text Here
</AnimatedText>
```

**AnimatedImage** — image with animations and visual effects

```tsx
import { staticFile } from 'remotion';

<AnimatedImage
  src={staticFile('images/hero.png')}
  width={600}
  height={400}
  objectFit="cover"
  borderRadius={24}
  shadow="0 20px 60px rgba(0,0,0,0.4)"
  border="2px solid rgba(255,255,255,0.1)"
  overlayColor="rgba(0,0,0,0.2)"
  animation={{ entrance: 'zoom-in', delay: 15 }}
/>
```

**AnimatedShape** — rect, circle, or line with decorative effects

```tsx
// Glowing circle
<AnimatedShape
  shape="circle"
  width={200}
  height={200}
  fill="#6366f1"
  glow="0 0 40px rgba(99,102,241,0.6)"
  animation={{ entrance: 'zoom-in' }}
/>

// Gradient rectangle with blur
<AnimatedShape
  shape="rect"
  width={400}
  height={300}
  gradient="linear-gradient(135deg, #667eea, #764ba2)"
  borderRadius={16}
  blur={10}
/>

// Decorative line
<AnimatedShape
  shape="line"
  width={200}
  lineWidth={3}
  fill="#FFFFFF"
  animation={{ entrance: 'fly-from-left' }}
/>
```

### Background

**Background** — full-scene background (solid, gradient, or image)

```tsx
// Gradient background with color stops
<Background gradient={['#0f0c29', '#302b63', '#24243e']}>
  {children}
</Background>

// Custom gradient direction
<Background
  gradient={['#667eea', '#764ba2']}
  gradientDirection="135deg"
>
  {children}
</Background>

// Blurred image background with dark overlay
<Background
  imageSrc={staticFile('images/bg.jpg')}
  imageBlur={15}
  imageOverlay="rgba(0,0,0,0.6)"
>
  {children}
</Background>

// Simple solid color
<Background color="#1a1a2e">
  {children}
</Background>
```

### Layout Primitives

**LayoutStack** — flex container (vertical or horizontal)

```tsx
// Centered vertical stack
<LayoutStack align="center" justify="center" gap={32} padding={60}>
  <AnimatedText fontSize={72}>Title</AnimatedText>
  <AnimatedText fontSize={32} color="#aaa">Subtitle</AnimatedText>
</LayoutStack>

// Horizontal row
<LayoutStack direction="row" gap={24} align="center">
  <AnimatedImage ... />
  <AnimatedImage ... />
</LayoutStack>
```

**LayoutSplit** — two-panel split with configurable ratio

```tsx
// 60/40 split — text left, image right
<LayoutSplit ratio="60/40" gap={40} padding={60}>
  <LayoutStack gap={16}>
    <AnimatedText fontSize={56}>Heading</AnimatedText>
    <AnimatedText fontSize={24} color="#aaa">Description text</AnimatedText>
  </LayoutStack>
  <AnimatedImage src={staticFile('images/product.png')} borderRadius={16} />
</LayoutSplit>
```

### Animation Primitives

**Stagger** — auto-delays each child's entrance

```tsx
<Stagger delayFrames={8} initialDelay={10}>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Line 1</AnimatedText>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Line 2</AnimatedText>
  <AnimatedText animation={{ entrance: 'fade-up' }}>Line 3</AnimatedText>
</Stagger>
```

Each child enters 8 frames after the previous one. First child starts at frame 10.

## Entrance Types

| Type | Effect |
|------|--------|
| `none` | No animation, appears instantly |
| `fade-up` | Fades in while sliding up (default) |
| `fade-down` | Fades in while sliding down |
| `fly-from-left` | Springs in from left edge |
| `fly-from-right` | Springs in from right edge |
| `fly-from-top` | Springs in from top |
| `fly-from-bottom` | Springs in from bottom |
| `zoom-in` | Scales up from 30% to 100% |
| `zoom-out` | Scales down from 150% to 100% |
| `drop-in` | Drops from above with bounce |
| `spin-in` | Spins and scales in |
| `blur-in` | Starts blurred, sharpens into focus |

## Exit Types

| Type | Effect |
|------|--------|
| `none` | No exit animation (default) |
| `fade-out` | Fades to transparent |
| `fade-down` | Fades out while sliding down |
| `fly-out-left` | Exits to the left |
| `fly-out-right` | Exits to the right |
| `fly-out-top` | Exits upward |
| `fly-out-bottom` | Exits downward |
| `zoom-out` | Shrinks to 50% and fades |
| `blur-out` | Blurs out of focus |

## Spring Physics

Control animation feel via `damping`, `stiffness`, `mass`:

```tsx
// Smooth, no bounce — subtle reveals
animation={{ entrance: 'fade-up', damping: 200 }}

// Snappy, minimal bounce — UI elements
animation={{ entrance: 'zoom-in', damping: 20, stiffness: 200 }}

// Bouncy — playful animations
animation={{ entrance: 'drop-in', damping: 8 }}

// Heavy, slow — dramatic reveals
animation={{ entrance: 'fly-from-bottom', damping: 15, stiffness: 80, mass: 2 }}
```

## Complete Scene Example

```tsx
import React from 'react';
import { staticFile } from 'remotion';
import {
  AnimatedText, AnimatedImage, AnimatedShape,
  Background, LayoutStack, LayoutSplit, Stagger
} from '../src/primitives';

export const Scene001: React.FC = () => (
  <Background gradient={['#0f0c29', '#302b63', '#24243e']}>
    <LayoutSplit ratio="55/45" gap={40} padding={80}>
      <LayoutStack gap={24} justify="center">
        <Stagger delayFrames={8}>
          <AnimatedText
            fontSize={64}
            fontWeight="bold"
            animation={{ entrance: 'fly-from-left' }}
          >
            Product Name
          </AnimatedText>
          <AnimatedText
            fontSize={28}
            color="rgba(255,255,255,0.7)"
            animation={{ entrance: 'fade-up' }}
          >
            The future of design tooling
          </AnimatedText>
          <AnimatedShape
            shape="line"
            width={120}
            lineWidth={3}
            fill="#667eea"
            animation={{ entrance: 'fly-from-left', delay: 5 }}
          />
        </Stagger>
      </LayoutStack>
      <AnimatedImage
        src={staticFile('images/hero.png')}
        borderRadius={24}
        shadow="0 25px 80px rgba(0,0,0,0.5)"
        animation={{ entrance: 'zoom-in', delay: 20 }}
      />
    </LayoutSplit>
  </Background>
);
```
