# Issue: Richer Animation Presets and Template Discovery for Built-In Scene Types

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** Medium
**Affected Area:** Backend
**Affected Component(s):** `src/templates/components/`, `src/templates/utils/`, `src/server.ts`

---

## Problem

Two related gaps in the template system cause Claude to produce visually flat, generic-looking video output and make poor template selection decisions:

**Gap 1 — No animation preset system for built-in scene types (P2)**

Every built-in template (`title-card`, `text-scene`, etc.) hard-codes a single entrance animation style. There is no way for Claude to request richer visual effects — directional entrances, floating elements, particle backgrounds, gradient backgrounds — via the `props` parameter alone. The `custom` scene type with the `objects` array accepts per-element animations, but requires Claude to hand-construct frame-level animation descriptors, which is error-prone and verbose.

**Expected:** Claude should be able to specify `"entrance": "fly-from-left"` or `"background": "gradient-purple-to-blue"` in a template's `props` and get a professional-looking result without writing raw TSX.

**Actual:** All built-in templates render a single fixed animation regardless of what props are passed. `TitleCard` always fades and slides up (`TitleCard.tsx:31–38`). `TextScene` heading always slides up from below (`TextScene.tsx:33–35`). `TextWithImage` always springs in from the side (`TextWithImage.tsx:35–36`). There are no background style options beyond a flat `backgroundColor` string.

**Gap 2 — No tool to describe available templates or their props (P3)**

When Claude calls `create_scene` with `sceneType: "text-scene"`, it has no machine-readable source of truth for what that template looks like, what its props mean, or what visual outcome to expect. There is no `list_templates` tool. Claude must guess or rely on its training data, which is stale and incomplete relative to the actual implemented templates.

**Expected:** A `list_templates` tool that returns each template's name, layout description, animation style, supported props with types and example values, and an ASCII art mockup of the visual layout.

**Actual:** No such tool exists. The `src/server.ts` registers 18 tools (`server.ts:1–59`) with no template discovery mechanism. The `SceneRenderer.tsx` contains the authoritative scene type → component mapping (`SceneRenderer.tsx:27–52`) but is not accessible via any MCP tool.

---

## Steps to Reproduce

**Gap 1:**
1. Call `create_scene` with `sceneType: "title-card"` and `props: { title: "Hello", entrance: "fly-from-left", background: "gradient" }`
2. Observe: the `entrance` and `background` props are ignored — `TitleCard.tsx` destructures only its known props and applies its fixed animation unconditionally (lines 31–33)
3. The output looks identical to a `title-card` with no extra props

**Gap 2:**
1. Start a new Claude session with zero context about the Remotion project
2. Ask Claude to pick the best template for a "two-column layout with a chart on the right and bullet points on the left"
3. Observe: Claude cannot reason about available templates from MCP tool responses alone — it either guesses `text-with-image` (closest but still wrong) or asks the user for guidance

---

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `TitleCard` | `src/templates/components/TitleCard.tsx` | 4–14 | Props interface has no `entrance`, `background`, or `float` fields — all animation is hard-coded at lines 31–43 |
| `TextScene` | `src/templates/components/TextScene.tsx` | 4–15 | Accepts `animation: 'fade' \| 'typewriter' \| 'word-by-word'` but heading animation is always the same slide-up (`lines 33–35`); no background options |
| `ImageScene` | `src/templates/components/ImageScene.tsx` | 4–13 | Only `kenBurns?: boolean` for motion — no entrance preset for the image, no pan direction |
| `TextWithImage` | `src/templates/components/TextWithImage.tsx` | 4–14 | Spring entrance from side is hard-coded (lines 35–36); no way to request a different entrance style |
| `KineticTypography` | `src/templates/components/KineticTypography.tsx` | 13–20 | Accepts `animation: 'spring' \| 'fade' \| 'scale'` at the word level but no background animation or highlight color presets |
| `CodeBlock` | `src/templates/components/CodeBlock.tsx` | 4–13 | Accepts `animation: 'typewriter' \| 'line-by-line' \| 'fade'` but background is always `#0D1117` regardless of `backgroundColor` prop (line 60) — prop accepted but overridden |
| `AnimatedObject` | `src/templates/components/AnimatedObject.tsx` | 5–10 | Supports 4 easing presets (`EASING_MAP`) and spring config but requires explicit per-frame animation descriptors — no high-level named presets like `"entrance": "fly-from-left"` |
| `animations.ts` | `src/templates/utils/animations.ts` | 1–32 | Has `fadeIn`, `slideIn`, `springEntrance` helpers but only used by templates internally; not accessible as named presets via `props` |
| `colors.ts` | `src/templates/utils/colors.ts` | 1–24 | Has `StyleConfig` and `resolveStyle` for palette defaults but no gradient or particle background utilities |
| `SceneRenderer` | `src/templates/SceneRenderer.tsx` | 24–53 | Authoritative scene type → component mapping; contains the full list of 8 scene types but is not surfaced via any MCP tool |
| `setupServer` | `src/server.ts` | 31–58 | Registers 18 tools — no `list_templates` registration |

---

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `TitleCard.tsx` props interface vs render | Props at lines 4–14 include `backgroundColor`, `titleColor`, `alignment`, `logoSrc`. No `entrance` or `float` field. Animation at lines 31–38 runs unconditionally on every render — no branching on animation style. |
| `TextScene.tsx` `animation` prop coverage | The `animation` prop (`text-scene.tsx:14`) controls only the body/bullets reveal. The heading always runs the same `interpolate` + `spring` slide-up (lines 33–35). `word-by-word` is declared in the union type but never handled in the switch at lines 41–45 — it falls through to standard `bodyOpacity`. |
| `AnimatedObject.tsx` easing vs preset gap | `EASING_MAP` at lines 5–10 supports 4 easings. Animation requires per-property frame ranges in the `animations[]` array (lines 12–34). There is no shorthand like `"entrance": "fly-from-left"` that resolves to a pre-configured animation descriptor. |
| `CodeBlock.tsx` backgroundColor override | `backgroundColor` prop is accepted (line 7) and passed into the inner panel div (line 71). However, the outer `<AbsoluteFill>` at line 60 hard-codes `backgroundColor: '#0D1117'` — the prop has no effect on the outer stage color. |
| `animations.ts` reuse across templates | `fadeIn`, `slideIn`, `springEntrance` functions exist and are correct building blocks. None of the template components currently import from `animations.ts` — each template re-implements its own `interpolate` calls inline. |
| `server.ts` registered tools | 18 tools registered (lines 33–58). Tool names: `start_session`, `init_project`, `list_scenes`, `create_scene`, `update_scene`, `delete_scene`, `reorder_scenes`, `update_composition`, `scan_assets`, `import_asset`, `start_preview`, `stop_preview`, `capture_frame`, `render_video`, `write_file`, `read_file`, `add_overlay`, `remove_overlay`. No `list_templates`. |
| `SceneRenderer.tsx` as template catalog | `SceneRenderer.tsx:27–52` maps 8 scene types to components. This file is the ground truth but is copied into user projects at init time (`file-ops.ts:82–84`) and is not available for introspection via MCP. |

### Root Cause

**Gap 1:** Each template component implements animation logic inline with no abstraction layer between the prop schema and the Remotion `interpolate`/`spring` calls. Adding a new animation style requires modifying the component's TSX directly. The `animations.ts` utility module (`src/templates/utils/animations.ts`) provides shared helpers (`fadeIn`, `slideIn`, `springEntrance`) but no template imports them — each component reinvents these calculations. The `AnimatedObject` component has the most expressive animation model (per-property, per-frame descriptors with easing) but the interface is too low-level for an LLM to use fluently without a high-level preset layer on top. Background styling is uniformly limited to a single `backgroundColor: string` prop — no gradient syntax, no pattern, no particle configuration.

**Gap 2:** There is no self-describing mechanism in the MCP tool surface. The template catalog lives entirely in `SceneRenderer.tsx:27–52` and in the type union of `sceneType` in `create_scene`'s Zod schema (`create-scene.ts:20–24`), neither of which is exposed as a queryable tool response. An LLM connecting to this MCP server has no way to discover what `"text-with-image"` renders without prior training knowledge or documentation.

---

## Proposed Fix

### Fix 1 — Animation preset layer for built-in templates

Add an `animationPreset` prop to each built-in template that maps to a pre-configured set of `interpolate`/`spring` calls. The templates should branch on this prop rather than hard-coding one style. Expand the existing `animations.ts` utility with named preset factories.

**Proposed preset vocabulary (applies to all templates where relevant):**

```
entrance presets: "fade-up" (current default), "fly-from-left", "fly-from-right",
                  "fly-from-bottom", "zoom-in", "drop-in"
background presets: flat color (current), "gradient-[dir]-[color1]-[color2]",
                    "grid", "dots", "noise"
element motion: "float" (continuous gentle y-oscillation), "pulse" (scale oscillation)
```

**Concrete changes needed:**

- `src/templates/utils/animations.ts` — add preset factory functions that accept `frame`, `fps`, and an optional delay, and return `{ opacity, translateX, translateY, scale }` value bundles. Current helpers `fadeIn`, `slideIn`, `springEntrance` become implementations of `"fade-up"` and `"fly-from-*"` presets.
- `src/templates/components/TitleCard.tsx` — add `entrancePreset?: string` and `backgroundStyle?: string` to `TitleCardProps` (lines 4–14). Branch animation computation at lines 31–43 on `entrancePreset`. Render gradient backgrounds when `backgroundStyle` starts with `"gradient-"`.
- `src/templates/components/TextScene.tsx` — extend the `animation` union type (line 14) or add a separate `entrancePreset` field. Fix the unhandled `word-by-word` case (lines 41–45).
- `src/templates/components/ImageScene.tsx` — add `panDirection?: 'left' | 'right' | 'zoom-in' | 'zoom-out'` alongside `kenBurns` (line 13). Add `overlayGradient?: boolean` to darken image for text legibility.
- `src/templates/components/AnimatedObject.tsx` — add a `preset` shorthand field to `ObjectConfig` (lines 22–34). When `preset` is set, resolve it to a default `animations[]` array before processing. Example: `preset: "fly-from-left"` resolves to `[{ property: 'x', from: -200, to: 0, startFrame: 0, endFrame: 20, easing: 'spring' }, { property: 'opacity', from: 0, to: 1, startFrame: 0, endFrame: 15, easing: 'ease-out' }]`.
- `src/templates/components/CodeBlock.tsx` — fix the outer `<AbsoluteFill>` at line 60 to use `backgroundColor` prop (currently overrides with `#0D1117`).
- `colors.ts` (`src/templates/utils/colors.ts`) — add a `resolveBackground(style: string): React.CSSProperties` helper that parses gradient strings and returns a CSS `background` value.

### Fix 2 — `list_templates` tool

Add a new tool `src/tools/list-templates.ts` that returns a static catalog of all 8 templates. Register it in `src/server.ts` at line 58.

**Tool name:** `list_templates`

**Returns (per template):**
- `sceneType` — the string value to pass to `create_scene`
- `description` — one-sentence visual summary
- `layout` — ASCII art of the visual layout
- `defaultAnimation` — what the template does out of the box
- `props` — array of `{ name, type, required, default, description, example }` objects
- `useBestFor` — list of content types this template suits

**New file:** `src/tools/list-templates.ts`
**Registration point:** `src/server.ts:58` — add `registerListTemplates(server)` after `registerRemoveOverlay`

---

## Related

- Files: `src/templates/components/TitleCard.tsx`, `src/templates/components/TextScene.tsx`, `src/templates/components/ImageScene.tsx`, `src/templates/components/TextWithImage.tsx`, `src/templates/components/KineticTypography.tsx`, `src/templates/components/CodeBlock.tsx`, `src/templates/components/AnimatedObject.tsx`, `src/templates/utils/animations.ts`, `src/templates/utils/colors.ts`, `src/templates/SceneRenderer.tsx`, `src/server.ts`, `src/tools/create-scene.ts`
- Related issues: `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md`
