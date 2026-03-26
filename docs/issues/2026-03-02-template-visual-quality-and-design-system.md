# Issue: Template Visual Quality & Design System

**Date Reported:** 2026-03-02
**Status:** Identified
**Type:** Bug Report
**Severity:** High
**Affected Area:** Templates
**Affected Component(s):** All 8 template components, `animations.ts`, `colors.ts`, scene layout system

---

## Problem

Templates produce functional but visually flat output. In a 12-scene beat-synced video, 7 of 12 scenes required manual restructuring by the user to achieve acceptable visual quality. The core issues are: no shared layout abstraction, no exit animations on any template, no visual depth (shadows, blur, gradients), weak typography hierarchy, a `colors.ts` design system that templates largely ignore, hardcoded spring configs with no mood control, and rigid stagger timing.

**Expected:** Templates produce professional-quality motion design output with centered layouts, entrance/exit animation pairs, visual depth, and consistent theming by default.

**Actual:** Templates produce entrance-only, flat-color, left-aligned layouts with hardcoded colors and spring configs. Users must hand-write layout boilerplate for every scene.

## Steps to Reproduce

1. Initialize a new project with `init_project`.
2. Create a 4–6 scene video using `create_scene` with `TitleCard`, `TextScene`, `ImageScene`, and `TextWithImage` templates.
3. Open Remotion Studio (`start_preview`).
4. Observe: scenes cut hard at the end (no exit animation), text is left-aligned, all backgrounds are flat black, and element sizing and spacing does not follow a consistent typographic scale.

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| TitleCard | `src/templates/components/TitleCard.tsx` | 1–98 | No exit animation; no `layout` prop; flat `backgroundColor` only |
| TextScene | `src/templates/components/TextScene.tsx` | 1–144 | No exit animation; hardcoded `alignment: 'left'` default (line 29); hardcoded 8-frame bullet stagger (line 111) |
| ImageScene | `src/templates/components/ImageScene.tsx` | 1–123 | No exit animation; overlay text is absolute-positioned (lines 98–120) |
| TextWithImage | `src/templates/components/TextWithImage.tsx` | 1–130 | No exit animation; no centered header pattern |
| KineticTypography | `src/templates/components/KineticTypography.tsx` | 1–154 | No exit animation; takes explicit `textColor` instead of reading from composition style |
| CodeBlock | `src/templates/components/CodeBlock.tsx` | 1–135 | Hard-coded VS Code colors: `backgroundColor: '#1E1E1E'` (line 19), `textColor: '#D4D4D4'` (line 20), `highlightColor: '#569CD6'` (line 21) — ignores composition `style` entirely |
| AnimatedObject | `src/templates/components/AnimatedObject.tsx` | 1–155 | No exit; pure absolute positioning with no layout system |
| animations.ts | `src/templates/utils/animations.ts` | 37–114 | Defines 6 entrance presets (`EntrancePreset` union, line 37–43); zero exit presets; no `computeExit()` function; spring configs hardcoded per preset |
| colors.ts | `src/templates/utils/colors.ts` | 1–24 | `StyleConfig` interface and `resolveStyle()` exist (lines 2–24) but no template imports or calls `resolveStyle()` |

---

## Investigation Notes

### Issue 1 — No Centered Layout Default (P0)

`TitleCard` uses `flexbox` centering correctly (`justifyContent: 'center'`, `alignItems: ..., line 53–55 in TitleCard.tsx`). All other templates diverge from this pattern:

- `TextScene` (line 29): `alignment = 'left'` is the default — text is left-aligned by default.
- `TextScene` (line 59–62): `justifyContent: 'center'` in the container, but content inside is `padding: '80px 120px'` — effectively left-flush inside the padding box.
- `ImageScene` (lines 98–120): overlay text uses a nested `AbsoluteFill` with `justifyContent: overlayJustify` — text placement is not part of the layout system.
- `TextWithImage` (lines 118–128): renders as a flex row (`flexDirection: 'row'`) with no header hierarchy. No badge, no centered title/subtitle pattern.

No template exposes a `layout: 'centered' | 'split' | 'left-aligned'` prop. No shared `<SceneHeader>` component exists anywhere in the `src/templates/` tree.

### Issue 2 — No Shared Layout Component (P1)

Observation from codebase scan: every template independently declares:
- Its own `backgroundColor` prop with a `#000000` default (TitleCard line 22, TextScene line 24, ImageScene line 26, TextWithImage line 25, KineticTypography line 25).
- Its own padding constants (120px horizontal in TitleCard line 56, TextScene line 61, KineticTypography line 131).
- Its own flexbox centering pattern (copy-pasted across 5 files).

There is no `SceneLayout.tsx` wrapper in `src/templates/`. Developers building 12-scene videos repeat the same boilerplate in every scene file. `SceneRenderer.tsx` (line 44) does use a plain `AbsoluteFill` for the `custom` scene type — also not connected to any layout system.

### Issue 3 — Zero Exit Animations (P1)

Confirmed by full audit of `animations.ts` (lines 1–114): the file exports `fadeIn`, `slideIn`, `springEntrance`, `computeEntrance`, and `entranceTransform`. There is no `computeExit`, `exitTransform`, or `ExitPreset` type anywhere in the file or in any template.

Evidence per template:
- `TitleCard.tsx` lines 34–38: two `computeEntrance()` calls, no exit logic anywhere in the file.
- `TextScene.tsx` lines 37–52: entrance for heading and body; `bodyOpacity` interpolates `[bodyStartFrame, bodyStartFrame + 20]` to `[0, 1]` — opacity only ever goes up, never comes down.
- `ImageScene.tsx` lines 67–76: `imgAnim` from `computeEntrance()`, `imageOpacity` interpolates `[0, 15]` to `[0, 1]` — no exit.
- `KineticTypography.tsx` lines 73–103: word-level entrance spring/fade/scale — no word-level or scene-level exit.
- `CodeBlock.tsx` line 56: `interpolate(frame, [5, 25], [0, 1])` — opacity only goes to 1, never returns to 0.

All 8 templates have `useCurrentFrame()` and `useVideoConfig()` available but none reads `durationInFrames` to calculate exit timing (except `ImageScene` which reads it only for Ken Burns pan, line 34).

### Issue 4 — Minimal Visual Depth (P2)

Audit findings:
- **Box shadows**: Only `CodeBlock.tsx` line 77 has a `boxShadow: '0 8px 32px rgba(0,0,0,0.4)'` — applied to the code window container. No other template uses `boxShadow`.
- **Gradients**: Zero `linear-gradient` or `radial-gradient` values in any template background. Every `backgroundColor` prop is a flat hex color.
- **Blur effects**: Zero `backdropFilter` or `filter: blur(...)` anywhere in the template components.
- **Glassmorphism**: Not present. No `rgba(255,255,255,...)` background values.
- **Borders**: `TextWithImage.tsx` applies `borderRadius: 12` to the image (line 112) — no border styling anywhere.

`colors.ts` defines sensible dark defaults (`backgroundColor: '#0F172A'`, `textColor: '#F8FAFC'`) via `resolveStyle()` (lines 22–24), but templates never call this function.

### Issue 5 — Typography Hierarchy Is Weak (P2)

Font sizes across templates:
- `TitleCard`: `titleFontSize = 72` (line 25), `subtitleFontSize = 32` (line 26) — ratio 2.25x.
- `TextScene`: `headingFontSize = 56` (line 27), `bodyFontSize = 32` (line 28) — ratio 1.75x.
- `TextWithImage`: `headingFontSize = 48` (line 27), `bodyFontSize = 28` (line 28) — ratio 1.71x.
- `KineticTypography`: `fontSize = 64` (line 27) — single size only.
- `CodeBlock`: `fontSize = 24` (line 22) — code-only, no heading.

Observations:
- No consistent scale ratio across templates (ranges from 1.71x to 2.25x; professional ramp is 1.5x per level).
- `fontWeight: 'bold'` (TitleCard line 73, TextScene line 69, TextWithImage line 73) — no weight differentiation between display vs. headline vs. title roles.
- Zero `letterSpacing` set anywhere. Professional motion design uses `-0.025em` tight tracking on display/headline text.
- No shared `typography.ts` utility exists in `src/templates/utils/`.

`fonts.ts` (`src/templates/utils/fonts.ts`) provides `registerFont()` and `getFontFamily()` but no size/weight/tracking scale.

### Issue 6 — Color System Exists But Is Ignored (P2)

`colors.ts` exports `StyleConfig` interface (lines 2–9), a `DEFAULTS` object (lines 12–19), and `resolveStyle()` (lines 22–24). The `Composition` interface in `project-state.ts` (lines 5–37) has a full `style` block with `primaryColor`, `secondaryColor`, `accentColor`, `fontFamily`, `headingFontFamily`, `defaultTextColor`, and `defaultFontSize`.

Despite this, zero template components import from `colors.ts`. Every template declares its own color props with `#000000` or `#FFFFFF` hardcoded defaults, making the design system invisible unless the user passes every color explicitly on each scene.

`CodeBlock` is the most egregious example: `backgroundColor = '#1E1E1E'` (line 19), `textColor = '#D4D4D4'` (line 20), `highlightColor = '#569CD6'` (line 21) — VS Code colors hardcoded as defaults, completely disconnected from the composition theme.

### Issue 7 — No Motion Design Presets (P2)

Spring configs are hardcoded per preset in `animations.ts`:
- `fade-up`: `{ damping: 12, mass: 0.5, stiffness: 100 }` (line 65).
- `fly-from-left/right/bottom`: `{ damping: 14, stiffness: 120 }` (lines 70, 76, 82).
- `zoom-in`: `{ damping: 12, stiffness: 150 }` (line 88).
- `drop-in`: `{ damping: 8, stiffness: 200 }` (line 94).

`TextWithImage.tsx` line 43: `{ damping: 12, stiffness: 100 }` — local hardcoded config not using `computeEntrance`.
`TextScene.tsx` line 119: `{ damping: 12, stiffness: 150 }` — local hardcoded config for bullet spring.
`KineticTypography.tsx` lines 76–78: `{ damping: 12, stiffness: 200 }` for `spring` animation mode; lines 93–95: `{ damping: 10, stiffness: 150 }` for `scale` mode.

There is no `MotionPreset` type, no `motionPreset` prop on any template, and no lookup table mapping mood names to spring configs.

### Issue 8 — Stagger Timing Is Rigid (P3)

`TextScene.tsx` line 111: `const bulletDelay = bodyStartFrame + i * 8` — exactly 8 frames (267ms at 30fps) between bullets, hardcoded. No other template has any stagger at all.

`KineticTypography.tsx` line 52: `const spacing = 3` — 3-frame word spacing, also hardcoded. No `staggerDelay` or `staggerPattern` prop exists on any template.

| Checked | Outcome |
|---------|---------|
| All 8 template component files | No exit animation logic in any file |
| `animations.ts` full audit | 6 entrance presets only; no exit functions |
| `colors.ts` import search | Zero templates import `resolveStyle` |
| `project-state.ts` `Composition.style` | Fully defined, never read by templates |
| Spring config locations | Scattered: 4 hardcoded in `animations.ts`, 3 more hardcoded locally in `TextScene`, `TextWithImage`, `KineticTypography` |
| `fonts.ts` | Font registration utility only; no typographic scale |
| `SceneRenderer.tsx` | Dispatch-only; no layout system |

### Root Cause

The templates were built to solve the problem of "templates that work" before addressing "templates that look good." Each component was authored in isolation with local defaults and no design token system. The `colors.ts` `resolveStyle()` function and the `Composition.style` block in `project-state.ts` were put in place as infrastructure but the bridge from infrastructure to templates was never built. Exit animations, shared layout components, and a typography scale were deferred and never added.

---

## Proposed Fix

### P0 — Centered Layout as Default + `<SceneHeader>` Component

Create `src/templates/components/SceneHeader.tsx`:
- Props: `badge?: string`, `title: string`, `subtitle?: string`, `alignment?: 'center' | 'left'`
- Renders badge pill + title + subtitle with correct sizes, weight, and letter-spacing
- Used by TitleCard, TextScene, TextWithImage as a drop-in header

Add `layout: 'centered' | 'split' | 'left-aligned'` prop to all templates. Change `TextScene` default alignment (line 29) from `'left'` to `'center'`.

### P1 — `<SceneLayout>` Wrapper

Create `src/templates/components/SceneLayout.tsx`:
- Props: `background?` (gradient string), `gridOverlay?: boolean`, `children: React.ReactNode`
- Eliminates the copy-pasted `backgroundColor + flexbox` boilerplate present in all 5 templates
- Auto-generated by `init_project` into the scaffolded project

### P1 — Exit Animation Presets

Add to `src/templates/utils/animations.ts`:
```typescript
export type ExitPreset = 'fade-out' | 'fade-down' | 'fly-to-left' | 'fly-to-right' | 'zoom-out';

export function computeExit(
  preset: ExitPreset,
  frame: number,
  fps: number,
  durationInFrames: number,
  exitDurationFrames: number = 18,
): EntranceValues
```
All templates should read `durationInFrames` from `useVideoConfig()` and call `computeExit()` in the last `exitDurationFrames` frames of the scene.

### P2 — shadcn-Inspired Visual Depth

Update `colors.ts` defaults to shadcn zinc-950 dark theme:
- `backgroundColor: '#09090b'` (zinc-950)
- Add card surface token: `#18181b` (zinc-900)
- Add border token: `rgba(255,255,255,0.10)`
- `textColor: '#fafafa'` (zinc-50)
- Add muted text token: `#a1a1aa` (zinc-400)

Templates should render content containers with:
- `background: 'rgba(255,255,255,0.10)'`
- `backdropFilter: 'blur(10px)'`
- `border: '1px solid rgba(255,255,255,0.18)'`
- `borderRadius: 16`
- `boxShadow: '0 8px 32px rgba(31,38,135,0.10)'`

### P2 — Typography Utility

Create `src/templates/utils/typography.ts`:
```typescript
export type TypographyRole = 'display' | 'headline' | 'title' | 'body' | 'caption';
export function getTypographyStyle(role: TypographyRole): React.CSSProperties
```

Scale for 1920×1080:

| Role | Size | Weight | Letter-spacing |
|------|------|--------|---------------|
| display | 88px | 800 | -0.025em |
| headline | 64px | 700 | -0.025em |
| title | 44px | 600 | -0.015em |
| body | 28px | 400 | normal |
| caption | 18px | 400 | 0.01em |

### P2 — Motion Presets

Add to `animations.ts`:
```typescript
export type MotionPreset = 'subtle' | 'energetic' | 'cinematic' | 'bouncy';
```

| Preset | Stiffness | Damping | Mass | Feel |
|--------|-----------|---------|------|------|
| subtle | 60 | 14 | 1.0 | Soft, understated |
| energetic | 250 | 16 | 0.6 | Quick, punchy |
| cinematic | 80 | 25 | 1.8 | Weighty, deliberate |
| bouncy | 220 | 10 | 1.0 | Playful overshoot |

`computeEntrance()` signature extended: `motionPreset?: MotionPreset` overrides the per-preset hardcoded spring configs.

### P2 — Color System Integration

All templates should import `resolveStyle` from `colors.ts` and accept an optional `style?: Partial<StyleConfig>` prop. When `backgroundColor` is not explicitly passed, templates fall back to `resolveStyle(style).backgroundColor`. Same for `textColor`, `fontFamily`, etc.

### P3 — Configurable Stagger

`TextScene` and `KineticTypography` should accept:
- `staggerDelay?: number` (frames between elements; default 3 for words, 8 for bullets — matching current behavior)
- `staggerPattern?: 'linear' | 'ease-out' | 'center-out'`

---

## Related

- Files:
  - `src/templates/components/TitleCard.tsx`
  - `src/templates/components/TextScene.tsx`
  - `src/templates/components/ImageScene.tsx`
  - `src/templates/components/TextWithImage.tsx`
  - `src/templates/components/KineticTypography.tsx`
  - `src/templates/components/CodeBlock.tsx`
  - `src/templates/components/AnimatedObject.tsx`
  - `src/templates/utils/animations.ts`
  - `src/templates/utils/colors.ts`
  - `src/templates/utils/fonts.ts`
  - `src/state/project-state.ts`
- Research references used in design decisions:
  - shadcn/ui dark theme: zinc-950/900 palette, white-10% borders, 0.625rem radius
  - shadcn typography: `tracking-tight` headings, 1.5x scale ratio, semibold (600) headings
  - Motion design: 50–100ms stagger, exit at 60–75% of entrance duration, min 0.5s text hold time
  - Spring configs: subtle (stiffness 40–80), energetic (200–300), cinematic (60–100, mass 1.5–2.0)
  - Glassmorphism: `rgba(255,255,255,0.10–0.25)`, blur 8–15px, 1px white-18% border
