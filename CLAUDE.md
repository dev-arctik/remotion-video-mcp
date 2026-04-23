# CLAUDE.md — remotion-video-mcp

## Project Overview

MCP server that bridges Claude and Remotion for programmatic video creation. Claude uses MCP tools to scaffold Remotion projects, manage scenes, sync audio, and render videos.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 18+
- **Module System**: ESM (`"type": "module"` in package.json, `"module": "NodeNext"` in tsconfig)
- **MCP SDK**: `@modelcontextprotocol/server` (v2) — server uses `McpServer` class with `registerTool()` and Zod schemas (`zod/v4`)
- **Video Engine**: Remotion v4 — React-based, uses `<Composition>`, `<Series>`, `staticFile()`, `<Audio>` — all from `remotion`
- **Package Manager**: npm
- **Process Management**: `execa` for spawning Remotion CLI processes (studio, render, still)

## Architecture

### Key Design Decisions

1. **composition.json is the single source of truth** — scene .tsx files are generated FROM it, not the other way around. Tools update composition.json first, then regenerate .tsx files.
2. **Full replacement, not diffs** — when updating a scene, the tool replaces the entire scene entry and regenerates the file. Simpler and more reliable.
3. **Open composition over fixed templates** — Phase 7 reorganized the architecture around composable primitives (`AnimatedText`, `AnimatedTextChars`, `KenBurns`, `MotionBlur`, `Captions`, etc.) + a Material 3 design token system (`useTheme()`). Templates are KEPT for back-compat but are demoted to "example snippets". The default path is `create_scene` with `componentCode` that imports primitives.
4. **Design tokens drive everything** — colors (M3 roles + on-X pairing), typography (M3 type scale), motion (springs, easings, durations), spacing (8-pt grid), radius (M3 shape scale), elevation (M3 5-level). All primitives read from `useTheme()`. `set_theme` propagates one change everywhere.
5. **Stateless between tool calls** — the server reads composition.json from disk on each call. No in-memory state that could desync.
6. **Audio is the timeline master** for narration-driven videos — scene durations calculated from audio timestamps.
7. **Scene transitions via `<TransitionSeries>`** — when any scene has `transitionOut`, `regenerateRootTsx()` swaps `<Series>` for `<TransitionSeries>` from `@remotion/transitions`. Set via `add_transition` tool.
8. **Overlays persist in composition.json** — overlays are registered via `add_overlay` and stored in `overlays[]`. `regenerateRootTsx()` reads them and generates imports + render blocks, so overlays survive all scene mutations.
9. **Captions persist in composition.json** — caption tracks registered via `import_captions` are stored in `captions[]`. Parsed JSON saved to `assets/captions/<id>.json` + mirrored to `public/`.
10. **write_file enables custom code** — Claude can write theme files, custom components, and utils beyond the template library. Protected files (Root.tsx, composition.json, etc.) cannot be overwritten.
11. **import_asset bridges temp uploads** — files uploaded in Claude Desktop land in temp dirs; `import_asset` copies them into `assets/{category}/` so `staticFile()` can find them.

### MCP Server Structure (this repo)

```
src/
├── index.ts                    # Entry point — creates server + stdio transport
├── server.ts                   # McpServer setup, registers all 29 tools
├── tools/                      # One file per MCP tool
│   # — Phase 1–6 (existing) —
│   ├── start-session.ts        # Onboarding flow — teaches open-composition philosophy
│   ├── init-project.ts         # Scaffold new Remotion project + npm install
│   ├── scan-assets.ts
│   ├── import-asset.ts         # Copy uploaded files into assets/ (sanitizes filenames, returns audio duration)
│   ├── analyze-audio.ts        # Frequency-based event detection (bass / mid / treble)
│   ├── analyze-beats.ts        # Detect BPM + beat timestamps in music → frame-indexed beat data
│   ├── create-scene.ts         # Batch support, componentCode, filename sanitization
│   ├── update-scene.ts         # componentCode support, filename sanitization
│   ├── delete-scene.ts         # Batch support (sceneIds, deleteAll)
│   ├── reorder-scenes.ts
│   ├── list-scenes.ts          # Also returns overlays[] + captions[]
│   ├── list-templates.ts       # Static catalog of legacy templates — kept for inspiration only
│   ├── update-composition.ts
│   ├── write-file.ts           # Write custom .tsx/.ts/.css/.json files
│   ├── read-file.ts            # Read any project file
│   ├── add-overlay.ts          # Register persistent global overlay
│   ├── remove-overlay.ts       # Remove overlay from composition
│   ├── regenerate-root.ts      # Rebuild Root.tsx from composition.json (recovery tool)
│   ├── start-preview.ts
│   ├── stop-preview.ts
│   ├── capture-frame.ts
│   ├── render-video.ts
│   # — Phase 7 (open composition) —
│   ├── set-theme.ts            # Set palette + colorOverrides + typeOverrides + fonts on composition.theme
│   ├── get-theme.ts            # Return current theme overrides
│   ├── list-tokens.ts          # Static catalog of all design tokens
│   ├── list-primitives.ts      # Static catalog of all composable primitives + props + examples
│   ├── list-motion-presets.ts  # Static catalog of entrance/exit/transition/stagger/spring presets
│   ├── add-transition.ts       # Set scene.transitionOut → swap Series for TransitionSeries
│   ├── import-captions.ts      # Import SRT or word-level Caption[] JSON → assets/captions/
│   └── import-lottie.ts        # Copy Lottie JSON → assets/lottie/
├── state/
│   └── project-state.ts        # Composition / Scene / Overlay / Caption interfaces, read/write helpers
├── primitives/                 # COPIED into user projects via copyPrimitives()
│   ├── tokens/                 # Design token system — motion, color, type, spacing, theme
│   │   ├── motion.ts           # M3 easings + duration tokens + Apple SwiftUI spring presets
│   │   ├── color.ts            # M3 color roles + on-X pairing + named palettes
│   │   ├── type.ts             # M3 type scale (scaled ×2.5 for 1080p) + variable font axes + font stacks
│   │   ├── spacing.ts          # 8-pt grid + M3 radius scale + elevation
│   │   └── theme.ts            # Theme interface + buildTheme + ThemeProvider + useTheme/useTypeStyle hooks
│   ├── AnimatedText.tsx        # Text with entrance/exit animations
│   ├── AnimatedTextChars.tsx   # Per-character stagger reveal (kinetic typography)
│   ├── AnimatedTextWords.tsx   # Per-word reveal — supports wordDelays from audio analysis
│   ├── AnimatedImage.tsx
│   ├── AnimatedShape.tsx
│   ├── Background.tsx
│   ├── Gradient.tsx            # Animated linear/radial/conic gradient — colors from theme
│   ├── FilmGrain.tsx           # Film grain overlay via @remotion/noise
│   ├── Glow.tsx                # Soft outer glow wrapper (drop-shadow stack)
│   ├── MotionBlur.tsx          # Wraps @remotion/motion-blur Trail / CameraMotionBlur
│   ├── KenBurns.tsx            # Slow pan+zoom on still image
│   ├── MorphPath.tsx           # SVG path morph via @remotion/paths
│   ├── LottiePlayer.tsx        # Wraps @remotion/lottie
│   ├── Captions.tsx            # TikTok-style word-level captions via @remotion/captions
│   ├── LayoutStack.tsx
│   ├── LayoutSplit.tsx
│   ├── Stagger.tsx
│   ├── AudioReactive.tsx
│   ├── BeatSync.tsx            # Deprecated, use AudioReactive
│   ├── useAnimation.ts         # Low-level animation engine (12 entrances, 8 exits)
│   └── index.ts                # Barrel export
├── templates/                  # Remotion components copied into user projects (LEGACY)
│   ├── components/             # TitleCard, TextScene, ImageScene, etc.
│   ├── SceneRenderer.tsx
│   └── utils/                  # animations.ts, colors.ts, fonts.ts (kept for back-compat)
├── skills/                     # Copied to docs/remotion-skills/ in user project
│   ├── composition-philosophy.md
│   ├── theme-and-tokens.md
│   ├── motion-physics.md
│   ├── transitions-and-pacing.md
│   ├── text-animations.md
│   └── ... (more reference docs)
├── types/                      # TypeScript declaration stubs for untyped CJS packages
└── utils/
    ├── file-ops.ts             # ensureProjectDirs, copyPrimitives, regenerateRootTsx (uses TransitionSeries when needed)
    ├── process-manager.ts      # Manages Remotion dev server & render processes
    ├── audio-utils.ts          # Audio timestamp parsing & duration calculation
    └── beat-analysis.ts        # Beat detection via music-tempo
```

### Scaffolded Remotion Project (created in user's CWD)

```
{project-name}/
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── composition.json            # THE source of truth
├── assets/{images,audio,fonts}/
├── public/                     # Symlinked to assets/ — staticFile() serves from here
├── scenes/                     # Individual scene .tsx files
├── src/
│   ├── Root.tsx                # GENERATED by regenerateRootTsx() — never edit manually
│   ├── SceneRenderer.tsx
│   ├── templates/              # Pre-built animation components
│   └── utils/
└── output/                     # Rendered videos
```

## Build & Run Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode build
npm run typecheck    # Type checking without emit
```

## Coding Conventions

- **One tool per file** in `src/tools/` — each exports a registration function
- **Zod schemas** for all tool input validation (MCP SDK pattern)
- Tool handlers are async functions returning `{ content: [{ type: "text", text: string }] }`
- Use `fs-extra` for file operations (copy, ensureDir, writeJson, readJson)
- Use `execa` for child process management (not `child_process` directly)
- Use `glob` for file pattern matching
- Error responses follow: `{ status: "error", message: string, suggestion: string }`
- Success responses follow: `{ status: "success", ...data, next_steps: string }`

## Overlay System

- `composition.json` stores `overlays?: Overlay[]` alongside `scenes[]`
- Each overlay has: `id`, `name`, `componentName`, `file`, `zIndex`, optional `startFrame`/`endFrame`
- `regenerateRootTsx()` generates `<AbsoluteFill>` wrappers per overlay, sorted by zIndex ascending
- Partial-duration overlays are wrapped in `<Sequence from={} durationInFrames={}>`
- Full-duration overlays (no startFrame/endFrame) render for the entire video

## Protected Files (write_file cannot overwrite these)

`composition.json`, `src/Root.tsx`, `src/SceneRenderer.tsx`, `package.json`, `tsconfig.json`, `remotion.config.ts`, `src/index.ts`

## Important Remotion API Notes

- `staticFile()` references files from the `public/` directory — in our scaffolded project, assets go in `public/` (symlinked or copied from `assets/`)
- `<Audio>`, `staticFile()`, `<Composition>`, `<Series>`, `<AbsoluteFill>`, `useCurrentFrame`, `interpolate`, `spring` — all from `remotion`
- Remotion CLI commands: `npx remotion studio` (preview), `npx remotion render` (video), `npx remotion still` (frame)

## MCP SDK Pattern

```typescript
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const server = new McpServer({ name: "remotion-video", version: "1.0.0" });

server.registerTool("tool-name", {
  title: "Tool Title",
  description: "What this tool does",
  inputSchema: z.object({ ... }),
}, async (args) => {
  // handler — args are already validated and typed by Zod
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

// Connect via stdio (for Claude CLI / Claude Desktop)
const transport = new StdioServerTransport();
await server.connect(transport);
```

**ESM notes:**
- All relative imports must have `.js` extensions (e.g., `'./server.js'`)
- Use `import.meta.url` instead of `__dirname`
- `execa` v9+ is ESM-only — works natively with our ESM setup
- Zod must be imported from `'zod/v4'` (sub-path export, required by MCP SDK v2)

## Testing

- Test each tool independently before integration
- Use the simplest scene type (TitleCard) to validate the full flow first
- Verify scaffolded Remotion projects actually compile with `npx remotion studio`

## Animation Preset System

Templates support an optional `entrancePreset` prop that controls how elements animate in:
- `fade-up` (default) — fade in while sliding up
- `fly-from-left` / `fly-from-right` / `fly-from-bottom` — spring in from edge
- `zoom-in` — scale up from 50% to 100%
- `drop-in` — drop from above with bounce

Preset functions live in `src/templates/utils/animations.ts` (`computeEntrance`, `entranceTransform`).
Templates that support presets: TitleCard, TextScene, ImageScene, TextWithImage.

## Beat Analysis System

For music-driven videos (trailers, ads, highlight reels), the `analyze_beats` tool detects BPM and beat positions:

**Workflow:**
1. User imports audio via `import_asset` → filenames auto-sanitized to kebab-case
2. `import_asset` response tells Claude to ask the user what type of audio it is
3. If user says "background music/beats" → Claude explains beat sync capability and asks permission
4. If user agrees → Claude calls `analyze_beats` with the audio filename
5. Tool returns BPM, beat timestamps (with frame numbers), and suggested scene durations
6. Claude uses beat data to set `durationFrames` aligned to beat phrases (4-beat, 8-beat, 16-beat)

**Beat data is stored in a sidecar JSON** (`assets/audio/<name>-beats.json`), NOT in `composition.json`.

**Dependencies:** `music-tempo` (Beatroot algorithm, pure JS) + `web-audio-api` (Node.js AudioContext polyfill)

**Import filename sanitization:** All files imported via `import_asset` are sanitized to kebab-case when no custom `destFilename` is provided. `"My Track (v2).mp3"` → `"my-track-v2.mp3"`. This prevents broken `staticFile()` imports.

## Audio Config Schema

Audio in `composition.json` uses typed fields (not `Record<string, unknown>`):
```typescript
audio: {
  type: 'narration' | 'background' | 'none';
  narration?: { src: string; volume?: number };
  backgroundMusic?: { src: string; volume?: number; loop?: boolean };
}
```
The `src` field is the audio path relative to `public/`, e.g. `"audio/bg-music.mp3"`.

## Build Phases

1. **Phase 1 — Foundation**: MCP server + start_session + init_project + list_scenes
2. **Phase 2 — Scenes**: Template components + create/update/delete/reorder scenes + batch ops + componentCode
3. **Phase 3 — Assets & Audio**: scan_assets + import_asset (with audio duration + filename sanitization) + analyze_beats + audio timestamp parsing
4. **Phase 4 — Preview & Render**: start/stop preview + capture_frame + render_video
5. **Phase 5 — Custom File Ops & Overlays**: write_file + read_file + add_overlay + remove_overlay + overlay-aware Root.tsx generation
6. **Phase 6 — Recovery & Discovery**: regenerate_root + list_templates + animation presets
7. **Phase 7 — Open Composition**: design tokens (M3 motion + color + type + spacing + Apple springs) + 10 new primitives (`AnimatedTextChars`, `AnimatedTextWords`, `Captions`, `MotionBlur`, `MorphPath`, `FilmGrain`, `LottiePlayer`, `KenBurns`, `Gradient`, `Glow`) + 8 new tools (`set_theme`, `get_theme`, `list_tokens`, `list_primitives`, `list_motion_presets`, `add_transition`, `import_captions`, `import_lottie`) + transition-aware Root.tsx generation (TransitionSeries) + ThemeProvider injection.

## Open Composition Philosophy (Phase 7)

The system pivoted from "8 fixed templates" to **composable primitives + design tokens**:

- **Templates are inspiration, not constraints** — they're kept for back-compat but `start_session` now teaches Claude to default to `componentCode` with primitives.
- **Token-aware primitives** — every primitive reads from `useTheme()`. `set_theme` propagates one change everywhere.
- **No hardcoded values in scene code** — colors come from `theme.color.{role}`, fonts from `useTypeStyle('displayLarge')`, easings from `theme.easing.emphasizedDecelerate`, etc.
- **on-X color pairing** — text on `primary` background uses `onPrimary`. Guaranteed WCAG contrast.
- **Composition order** — `Background`/`Gradient` → content (`AnimatedText*`, `KenBurns`, `LottiePlayer`) → effects (`Glow`, `MotionBlur`) → overlay (`FilmGrain`, `Captions`).
- **Discovery tools** are STATIC (no `projectPath` needed): `list_primitives`, `list_tokens`, `list_motion_presets`, `list_templates`. Use them BEFORE writing componentCode.

Workflow shift:
- **Old**: pick template → pass props
- **New**: `set_theme` → `create_scene` with `componentCode` composing primitives that read theme tokens

The new primitives use `@remotion/transitions`, `@remotion/captions`, `@remotion/google-fonts`, `@remotion/layout-utils`, `@remotion/motion-blur`, `@remotion/paths`, `@remotion/noise`, `@remotion/lottie`, `@remotion/shapes`, `@remotion/animation-utils` — all added to the scaffolded project's `package.json.template`.
