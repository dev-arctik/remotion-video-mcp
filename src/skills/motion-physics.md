# Motion Physics — Spring + Easing Tuning

## Spring Presets (use named, not raw)

Don't write `spring({ config: { damping: 12, stiffness: 200, mass: 1 } })`. Use named presets
from the theme — they're tuned to feel "designed":

| Preset    | Feel              | Use for                              |
|-----------|-------------------|--------------------------------------|
| `smooth`  | No bounce, slow   | Subtle UI motion                     |
| `snappy`  | Slight bounce     | Default for entrances                |
| `bouncy`  | Visible overshoot | Playful callouts, brand reveals      |
| `punchy`  | Fast, no bounce   | Pro entrance — big text, quick land  |
| `gentle`  | Slow ease         | Background drift, ambient motion     |
| `playful` | Big overshoot     | Logos, character animations          |
| `rigid`   | Near-linear       | Mechanical, instant                  |

```tsx
const theme = useTheme();
const progress = spring({ frame, fps, config: theme.springs.punchy });
```

Or via primitive prop:
```tsx
<AnimatedTextChars springPreset="bouncy">...</AnimatedTextChars>
```

## Easing Tokens (Material 3)

For non-spring animation (interpolate with easing), use M3 cubic-beziers:

```tsx
import { Easing } from 'remotion';
import { easing } from '../src/primitives/tokens';

const opacity = interpolate(frame, [0, 30], [0, 1], {
  easing: Easing.bezier(...easing.emphasizedDecelerate),
});
```

| Token | When to use |
|---|---|
| `standard` | Small UI transitions |
| `standardDecelerate` | Quick enter |
| `standardAccelerate` | Quick exit |
| `emphasized` | Hero motion (M3 default) |
| `emphasizedDecelerate` | **Element entering screen** |
| `emphasizedAccelerate` | **Element leaving screen** |

## Duration Tokens

Convert M3 ms tokens to frames at composition fps:

```tsx
import { ms } from '../src/primitives/tokens';
const { fps } = useVideoConfig();
const durationFrames = ms('medium2', fps); // 300ms → 9 frames @ 30fps
```

| Range | Tokens | Use |
|---|---|---|
| 50–200ms | short1..4 | UI feedback, hovers |
| 250–400ms | medium1..4 | Most scene element entrances |
| 450–600ms | long1..4 | Hero reveals |
| 700–1000ms | extraLong1..4 | Cinematic moments |

## Stagger Heuristics

- **Per-character**: 2–4 frames between each letter (`AnimatedTextChars staggerFrames={3}`)
- **Per-word**: 6–10 frames (`AnimatedTextWords staggerFrames={6}`)
- **Per-line**: 12–18 frames (use `Stagger` wrapper)
- **Per-list-item**: 8–12 frames

Center-out / edges-in patterns produce dramatic feel; linear is the safe default.

## Always pair entrance with exit on long-lived elements

If an element is on screen for >1s and the scene continues after it, give it an exit:
```tsx
<AnimatedText
  animation={{ entrance: 'fade-up', exit: 'blur-out', exitDuration: 12 }}
  totalFrames={90}
>
  Insight
</AnimatedText>
```

Pass `totalFrames` (the duration the element is visible) so the engine knows when to start the exit.

## Motion Blur on Fast Movement

Anything that moves >300px in <15 frames should have motion blur. Wrap with `<MotionBlur>`:
```tsx
<MotionBlur layers={10} lagInFrames={1}>
  <AnimatedText animation={{ entrance: 'fly-from-left' }}>WHOOSH</AnimatedText>
</MotionBlur>
```

This is the single biggest "looks like After Effects" upgrade for any kinetic motion.
