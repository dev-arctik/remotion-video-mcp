---
name: composable-primitives
description: Building scenes with AnimatedText, AnimatedImage, Background, LayoutStack, Stagger and other primitives
metadata:
  tags: primitives, layout, animation, text, image, shape, background, stagger, scene
---

# Composable Primitives

Scenes are built by composing primitives — small, reusable components that handle animation, layout, and visual effects. Import from `'../src/primitives'`.

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
