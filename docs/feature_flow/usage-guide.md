# Flow: remotion-video-mcp — End-to-End Usage Guide

**Last Updated:** 2026-02-25
**Status:** Active
**Type:** End-to-End Flow

---

## Overview

remotion-video-mcp is an MCP server that bridges Claude and the Remotion video engine. Claude uses 13 MCP tools to scaffold Remotion projects, manage scenes, sync audio, and trigger renders — all through natural conversation. The user never writes React/TypeScript directly.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CONVERSATION LAYER                            │
│                    Claude (in Claude CLI / Desktop)                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ MCP stdio protocol
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                         MCP SERVER (this repo)                        │
│   src/index.ts  →  src/server.ts  →  src/tools/*.ts                 │
│   Package: @modelcontextprotocol/sdk v1.27.1                         │
│   Pattern:  server.registerTool()  with Zod schemas                  │
└──────┬─────────────────────┬──────────────────────────────────────────┘
       │ reads/writes         │ spawns child processes (execa)
       ▼                      ▼
┌──────────────┐   ┌──────────────────────────────────────────────────┐
│composition   │   │  Scaffolded Remotion Project (user's disk)        │
│.json         │   │                                                   │
│(source of    │   │  {project}/                                       │
│truth)        │   │  ├── composition.json  ← single source of truth  │
│              │   │  ├── scenes/*.tsx      ← auto-generated           │
│              │   │  ├── src/Root.tsx      ← always regenerated       │
│              │   │  ├── src/templates/    ← copied once from server  │
│              │   │  ├── assets/{images,audio,fonts}/                 │
│              │   │  └── public/           ← symlinked to assets/     │
└──────────────┘   │       (staticFile() serves from here)            │
                   └──────────────────────────────────────────────────┘
                                │
                   ┌────────────▼───────────────┐
                   │  npx remotion studio        │  ← start_preview
                   │  npx remotion render        │  ← render_video
                   │  npx remotion still         │  ← capture_frame
                   └────────────────────────────┘
```

---

## Setup & Configuration

### Prerequisites

- Node.js 18+
- npm
- Claude CLI (`claude`) or Claude Desktop

### Step 1 — Build the MCP Server

```bash
# Clone and install dependencies
cd remotion-video-mcp
npm install

# Compile TypeScript to dist/
npm run build
# Output: dist/index.js (ESM, Node.js 18+)
```

The build compiles `src/**/*.ts` to `dist/` using `tsconfig.json` with `"module": "NodeNext"`. All relative imports use `.js` extensions per ESM convention.

Key files after build:
- `dist/index.js` — entry point (`src/index.ts:1`)
- `dist/server.js` — tool registration (`src/server.ts:1`)
- `dist/tools/*.js` — one file per MCP tool
- `src/templates/` — Remotion component templates (NOT compiled; copied directly into scaffolded projects)

### Step 2 — Register with Claude CLI

```bash
claude mcp add remotion-video -- node /absolute/path/to/remotion-video-mcp/dist/index.js
```

Verify registration:

```bash
claude mcp list
# Should show: remotion-video
```

### Step 3 — Register with Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent path on your OS:

```json
{
  "mcpServers": {
    "remotion-video": {
      "command": "node",
      "args": ["/absolute/path/to/remotion-video-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

### How the Server Communicates

The server uses stdio transport (`src/index.ts:15`). Claude sends JSON-RPC messages over stdin and receives responses on stdout. Stderr is reserved for server-side error logging only — it never interferes with the MCP protocol.

On SIGINT / SIGTERM, `stopAllProcesses()` kills any running Remotion studio or render processes before the server exits (`src/index.ts:19-26`).

---

## Usage Flow

The complete flow from first message to rendered video:

```
User: "I want to create a product launch video"
          │
          ▼
    1. start_session          ← Claude calls this FIRST, always
          │
          │ returns onboarding questionnaire
          ▼
    2. Conversational Q&A     ← Claude asks user 2-3 questions at a time:
          │                      - Video purpose & duration
          │                      - Audio type (narration / background / none)
          │                      - Dimensions (landscape / portrait / square)
          │                      - Visual style & brand colors
          │
          ▼
    3. init_project           ← After all answers gathered + user confirms
          │
          │ scaffolds project on disk, writes composition.json, runs npm install
          ▼
    4. scan_assets            ← OPTIONAL: if user has images/audio to place in assets/
          │
          ▼
    5. create_scene (×N)      ← One call per scene
          │
          │ writes scene .tsx + updates composition.json + regenerates Root.tsx
          ▼
    6. start_preview          ← Launch Remotion Studio at http://localhost:3000
          │
          ▼
    7. Iterate:
          ├── update_scene    ← Tweak props, timing, animations
          ├── capture_frame   ← Inspect a specific frame as PNG
          ├── delete_scene    ← Remove a scene
          ├── reorder_scenes  ← Change scene order
          └── update_composition ← Change global style, audio config, dimensions
          │
          ▼
    8. stop_preview           ← Stop the dev server before rendering
          │
          ▼
    9. render_video           ← Produce final MP4 (or WebM) in output/
```

---

## Tool Call Sequence — Annotated Examples

### Phase 1: Session Start

**Tool:** `start_session`
**File:** `src/tools/start-session.ts:4`
**Called:** Always first. No exceptions.

Input:
```json
{
  "workingDirectory": "/Users/alice/videos"
}
```

Output (abbreviated):
```json
{
  "status": "onboarding",
  "workingDirectory": "/Users/alice/videos",
  "required_questions": [
    { "id": "video_purpose", "question": "What is this video about?" },
    { "id": "duration", "question": "How long should the video be?" },
    { "id": "audio_type", "question": "What about audio?", "options": ["Voiceover with timestamp JSON", "Background music only", "No audio"] },
    { "id": "dimensions", "question": "What format/aspect ratio?", "options": ["1920x1080", "1080x1920", "1080x1080"] },
    { "id": "visual_style", "question": "What visual style/vibe?" }
  ],
  "post_onboarding_instructions": "After gathering all answers: 1) Summarize. 2) Confirm. 3) Call init_project."
}
```

Claude walks through the `required_questions` conversationally — 2-3 at a time — before calling `init_project`.

---

### Phase 2: Project Initialization

**Tool:** `init_project`
**File:** `src/tools/init-project.ts:15`
**Called:** Once, after onboarding is complete.

Input:
```json
{
  "projectName": "product-launch-video",
  "workingDirectory": "/Users/alice/videos",
  "title": "Product Launch 2026",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "durationMode": "manual",
  "durationSeconds": 60,
  "audioType": "background",
  "style": {
    "theme": "minimal",
    "primaryColor": "#2563EB",
    "accentColor": "#F59E0B",
    "fontFamily": "Inter"
  }
}
```

What happens internally (`src/tools/init-project.ts:46-166`):
1. Guards against re-init if `composition.json` already exists
2. `ensureProjectDirs()` creates `assets/images/`, `assets/audio/`, `assets/fonts/`, `scenes/`, `src/`, `public/`, `output/` (`src/utils/file-ops.ts:35`)
3. Symlinks `public/images` → `assets/images`, `public/audio` → `assets/audio`, `public/fonts` → `assets/fonts` (so `staticFile()` works)
4. Copies template components from `src/templates/` into the project's `src/` (`src/utils/file-ops.ts:74`)
5. Writes `package.json`, `tsconfig.json`, `remotion.config.ts` from `templates/project-scaffold/`
6. Writes initial `composition.json` with empty `scenes: []`
7. Generates empty `src/Root.tsx` via `regenerateRootTsx()`
8. Writes `src/index.ts` (Remotion entry point)
9. Runs `npm install` (2-minute timeout)

Output:
```json
{
  "status": "success",
  "projectPath": "/Users/alice/videos/product-launch-video",
  "next_steps": "Place assets in assets/ then call scan_assets, or call create_scene directly.",
  "structure_created": ["assets/images/", "assets/audio/", "scenes/", "composition.json", "src/Root.tsx"]
}
```

---

### Phase 3: Asset Scanning (Optional)

**Tool:** `scan_assets`
**File:** `src/tools/scan-assets.ts:9`
**Called:** When the user has placed files in `assets/` after `init_project`.

Input:
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video"
}
```

The tool scans three directories (`src/tools/scan-assets.ts:31-94`):
- `assets/images/**/*.{png,jpg,jpeg,gif,svg,webp}` — returns `filename`, `publicPath` (for use in `staticFile()`), `sizeKB`, `format`
- `assets/audio/**/*.{mp3,wav,ogg,m4a,json}` — JSON files are parsed as timestamp files via `parseTimestampFile()` (`src/utils/audio-utils.ts:19`); audio files return format and size
- `assets/fonts/**/*.{ttf,otf,woff,woff2}` — returns filenames

The `publicPath` field is the path relative to `public/` — this is what you pass to `staticFile()` in props. Example: a file at `assets/images/logo.png` has `publicPath: "images/logo.png"`, so you reference it as `staticFile('images/logo.png')`.

Output (abbreviated):
```json
{
  "status": "success",
  "assets": {
    "images": [
      { "filename": "logo.png", "publicPath": "images/logo.png", "sizeKB": 42, "format": "png" }
    ],
    "audio": [
      { "filename": "narration.mp3", "publicPath": "audio/narration.mp3", "format": "mp3", "sizeKB": 2800 },
      { "filename": "timestamps.json", "publicPath": "audio/timestamps.json", "type": "timestamps", "segmentCount": 8, "totalDuration": 47.3, "segments": [...] }
    ],
    "fonts": []
  }
}
```

---

### Phase 4: Creating Scenes

**Tool:** `create_scene`
**File:** `src/tools/create-scene.ts:7`
**Called:** Once per scene. The primary creative tool.

Input:
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "sceneId": "scene-001",
  "sceneName": "intro",
  "sceneType": "title-card",
  "durationFrames": 90,
  "props": {
    "title": "Introducing Orion",
    "subtitle": "The future of async work",
    "backgroundColor": "#0F172A",
    "titleColor": "#FFFFFF",
    "alignment": "center"
  }
}
```

What happens internally (`src/tools/create-scene.ts:34-95`):
1. Reads fresh `composition.json` from disk
2. Checks for duplicate `sceneId` and component name collision
3. Appends the new scene entry to `composition.scenes`
4. Calls `recalculateStartFrames()` — sets `startFrame` for every scene as cumulative sum (`src/state/project-state.ts:74`)
5. Writes updated `composition.json`
6. Calls `writeSceneFile()` — generates a `.tsx` file in `scenes/` from the scene entry (`src/utils/file-ops.ts:106`)
7. Calls `regenerateRootTsx()` — overwrites `src/Root.tsx` with fresh static imports and `<Series>` entries (`src/utils/file-ops.ts:160`)

The generated scene file (`scenes/scene-001-intro.tsx`) looks like:
```tsx
import React from 'react';
import { TitleCard } from '../src/templates/TitleCard';

// Auto-generated from composition.json — do not edit directly
export const Scene001: React.FC = () => {
  const props = { "title": "Introducing Orion", ... };
  return <TitleCard {...props} />;
};
```

The generated `src/Root.tsx` uses static imports per scene and a `<Series>` to sequence them.

Output:
```json
{
  "status": "success",
  "sceneId": "scene-001",
  "file": "scenes/scene-001-intro.tsx",
  "durationFrames": 90,
  "totalScenes": 1,
  "next_steps": "Check the preview if running, or call start_preview to see the scene."
}
```

**Scene file naming convention:** `scenes/{sceneId}-{sceneName}.tsx`. The component name is derived from the sceneId: `scene-001` → `Scene001` (`src/utils/file-ops.ts:238`).

---

### Phase 5: Preview

**Tool:** `start_preview`
**File:** `src/tools/start-preview.ts:6`

Input:
```json
{ "projectPath": "/Users/alice/videos/product-launch-video" }
```

Spawns `npx remotion studio` in the project directory via `execa` (`src/utils/process-manager.ts:16`). The process manager waits for stdout to contain `http://` before resolving, or falls back to a 3-second timeout (`src/utils/process-manager.ts:32`).

Output:
```json
{
  "status": "running",
  "url": "http://localhost:3000",
  "pid": 12345,
  "next_steps": "Tell the user to open the URL. The preview auto-reloads on file changes."
}
```

The preview auto-reloads whenever scene `.tsx` files change. This means every `create_scene`, `update_scene`, etc. call is immediately visible in the browser.

If the preview server is already running for that project path, the tool returns `"status": "already_running"` without spawning a duplicate.

---

### Phase 6: Iterating

**Tool:** `update_scene`
**File:** `src/tools/update-scene.ts:9`
**Called:** To modify any field of an existing scene (props, duration, type, transitions).

Input (partial update — only specified fields change):
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "sceneId": "scene-001",
  "durationFrames": 120,
  "props": {
    "title": "Introducing Orion",
    "subtitle": "Built for modern teams",
    "backgroundColor": "#0F172A",
    "titleColor": "#60A5FA"
  }
}
```

Merges changes into the existing scene entry and triggers the same write cycle as `create_scene`: update `composition.json` → write scene `.tsx` → regenerate `Root.tsx`.

---

**Tool:** `capture_frame`
**File:** `src/tools/capture-frame.ts:8`
**Called:** To inspect a specific frame without watching the live preview.

Input:
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "frame": 10,
  "sceneId": "scene-001"
}
```

When `sceneId` is provided, `frame` is relative to that scene's `startFrame`. The tool adds them together to get the absolute frame before invoking `npx remotion still main output/frame-{N}.png --frame={N}`.

Output:
```json
{
  "status": "success",
  "outputPath": "/Users/alice/videos/product-launch-video/output/frame-10.png",
  "frame": 10
}
```

---

**Tool:** `list_scenes`
**File:** `src/tools/list-scenes.ts:6`
**Called:** Anytime Claude needs a snapshot of current state.

Returns the full `scenes` array from `composition.json` plus computed totals:
```json
{
  "status": "success",
  "scenes": [
    { "id": "scene-001", "name": "intro", "type": "title-card", "durationFrames": 120, "startFrame": 0 },
    { "id": "scene-002", "name": "features", "type": "text-scene", "durationFrames": 150, "startFrame": 120 }
  ],
  "totalFrames": 270,
  "totalSeconds": 9,
  "fps": 30,
  "sceneCount": 2
}
```

---

**Tool:** `reorder_scenes`
**File:** `src/tools/reorder-scenes.ts:6`
**Called:** To change scene sequence. All scene IDs must be included.

Input:
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "sceneOrder": ["scene-003", "scene-001", "scene-002"]
}
```

Validates that the provided array contains every existing scene ID with no extras, then reorders the `scenes` array and recalculates all `startFrame` values.

---

**Tool:** `delete_scene`
**File:** `src/tools/delete-scene.ts:8`

Input:
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "sceneId": "scene-002"
}
```

Removes the `.tsx` file, splices the entry from `composition.scenes`, recalculates `startFrame` for remaining scenes, and regenerates `Root.tsx`.

---

**Tool:** `update_composition`
**File:** `src/tools/update-composition.ts:6`
**Called:** To change global settings — style theme, dimensions, fps, audio config.

Input (changing theme colors):
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "style": {
    "primaryColor": "#10B981",
    "accentColor": "#F59E0B"
  }
}
```

Input (attaching background music):
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "audio": {
    "type": "background",
    "backgroundMusic": {
      "file": "audio/background.mp3",
      "volume": 0.15,
      "loop": true
    }
  }
}
```

Note: `file` paths in the `audio` config are **relative to `public/`** (not `assets/`), matching how `staticFile()` resolves them. See the Asset Management section for details.

---

### Phase 7: Render

**Tool:** `stop_preview`
**File:** `src/tools/stop-preview.ts:6`
**Called:** Before `render_video`. The preview dev server must be stopped first.

Sends SIGTERM to the running `npx remotion studio` process and waits up to 5 seconds for clean exit (`src/utils/process-manager.ts:51`).

---

**Tool:** `render_video`
**File:** `src/tools/render-video.ts:7`

Input:
```json
{
  "projectPath": "/Users/alice/videos/product-launch-video",
  "outputFormat": "mp4",
  "quality": "standard",
  "outputFileName": "product-launch-v1"
}
```

Runs `npx remotion render main output/product-launch-v1.mp4 --codec h264 --crf 18`. Quality maps to CRF values (`src/tools/render-video.ts:29`):
- `draft` → CRF 28 (fastest, largest file)
- `standard` → CRF 18 (balanced — default)
- `high` → CRF 10 (best quality, slowest)

WebM renders use codec `vp9`. The 10-minute timeout accommodates long videos.

Output:
```json
{
  "status": "success",
  "outputPath": "/Users/alice/videos/product-launch-video/output/product-launch-v1.mp4",
  "format": "mp4",
  "quality": "standard"
}
```

---

## All 13 Tools — Reference

| Tool | Phase | File | Purpose | When to Call |
|------|-------|------|---------|--------------|
| `start_session` | 1 | `src/tools/start-session.ts` | Returns onboarding questionnaire | Always first, before anything else |
| `init_project` | 1 | `src/tools/init-project.ts` | Scaffold project, run npm install | Once, after onboarding is complete |
| `list_scenes` | 1 | `src/tools/list-scenes.ts` | Read current composition state | Anytime a state snapshot is needed |
| `scan_assets` | 3 | `src/tools/scan-assets.ts` | Scan assets/, parse timestamps | After user drops files in assets/ |
| `create_scene` | 2 | `src/tools/create-scene.ts` | Add a new scene | Once per scene during creation |
| `update_scene` | 2 | `src/tools/update-scene.ts` | Modify existing scene | When iterating on props/timing |
| `delete_scene` | 2 | `src/tools/delete-scene.ts` | Remove a scene | When user wants to cut a scene |
| `reorder_scenes` | 2 | `src/tools/reorder-scenes.ts` | Change scene sequence | When user wants to rearrange |
| `update_composition` | 2 | `src/tools/update-composition.ts` | Change global settings/style/audio | For theme changes, audio updates |
| `start_preview` | 4 | `src/tools/start-preview.ts` | Launch Remotion Studio | After first scene is created |
| `stop_preview` | 4 | `src/tools/stop-preview.ts` | Kill the dev server | Before render_video |
| `capture_frame` | 4 | `src/tools/capture-frame.ts` | Export a single frame as PNG | For visual inspection mid-session |
| `render_video` | 4 | `src/tools/render-video.ts` | Produce final MP4 or WebM | Final step, after stop_preview |

**Validation enforced in every tool except `start_session` and `init_project`:** `validateProjectPath()` checks that `composition.json` exists at the given path and rejects dangerous system paths (`src/utils/file-ops.ts:12`).

---

## Template Components

All eight templates live in `src/templates/components/` and are copied into the scaffolded project at `{project}/src/templates/` during `init_project`. They are pre-built Remotion React components — Claude selects one via `sceneType` in `create_scene` and passes `props` to configure it.

### TitleCard (`src/templates/components/TitleCard.tsx:1`)

A full-screen title slide with animated entrance. Title fades in and slides up via spring physics; subtitle follows with a 15-frame delay.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `title` | `string` | required | Main heading text |
| `subtitle` | `string` | — | Optional subtitle below title |
| `backgroundColor` | `string` | `#000000` | Background fill color |
| `titleColor` | `string` | `#FFFFFF` | Title text color |
| `subtitleColor` | `string` | title color at 70% opacity | Subtitle text color |
| `titleFontSize` | `number` | `72` | Title font size in px |
| `subtitleFontSize` | `number` | `32` | Subtitle font size in px |
| `alignment` | `'center'` / `'left'` / `'right'` | `'center'` | Text alignment |
| `logoSrc` | `string` | — | Path relative to `public/` — e.g. `"images/logo.png"` |

**Animation:** Title spring (`damping: 12, stiffness: 100`), subtitle delayed by 15 frames.

---

### TextScene (`src/templates/components/TextScene.tsx:1`)

A text-only scene supporting heading, body copy, and staggered bullet points.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `heading` | `string` | — | Section heading |
| `body` | `string` | — | Paragraph body text |
| `bullets` | `string[]` | — | Bullet list items (staggered entrance, 8 frames apart) |
| `backgroundColor` | `string` | `#000000` | Background color |
| `textColor` | `string` | `#FFFFFF` | Body and bullet text color |
| `headingColor` | `string` | same as `textColor` | Heading text color |
| `headingFontSize` | `number` | `56` | Heading font size in px |
| `bodyFontSize` | `number` | `32` | Body/bullet font size in px |
| `alignment` | `'center'` / `'left'` / `'right'` | `'left'` | Text alignment |
| `animation` | `'fade'` / `'typewriter'` / `'word-by-word'` | `'fade'` | Entrance animation style |

---

### ImageScene (`src/templates/components/ImageScene.tsx:1`)

A full-screen image with optional Ken Burns zoom and overlay text.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `src` | `string` | required | Path relative to `public/` — e.g. `"images/hero.jpg"` |
| `alt` | `string` | `''` | Alt text |
| `fit` | `'cover'` / `'contain'` / `'fill'` | `'cover'` | CSS object-fit |
| `backgroundColor` | `string` | `#000000` | Background shown during letterboxing |
| `overlayText` | `string` | — | Text printed over the image |
| `overlayPosition` | `'top'` / `'center'` / `'bottom'` | `'bottom'` | Overlay vertical position |
| `overlayColor` | `string` | `#FFFFFF` | Overlay text color |
| `overlayFontSize` | `number` | `36` | Overlay font size in px |
| `kenBurns` | `boolean` | `true` | Slow zoom from 1.0x to 1.08x over scene duration |

---

### TextWithImage (`src/templates/components/TextWithImage.tsx:1`)

Split-screen layout: text on one side, image on the other. Each half slides in from opposite edges.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `imageSrc` | `string` | required | Path relative to `public/` |
| `heading` | `string` | — | Heading text (left or right panel) |
| `body` | `string` | — | Body text |
| `imagePosition` | `'left'` / `'right'` | `'right'` | Which side the image occupies |
| `backgroundColor` | `string` | `#000000` | Background |
| `textColor` | `string` | `#FFFFFF` | Body text color |
| `headingColor` | `string` | same as `textColor` | Heading color |
| `headingFontSize` | `number` | `48` | Heading font size in px |
| `bodyFontSize` | `number` | `28` | Body font size in px |

---

### KineticTypography (`src/templates/components/KineticTypography.tsx:1`)

Word-by-word animated text. Can sync to audio word timestamps for narration-driven videos.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `text` | `string` | required | Full text to animate |
| `audioWords` | `{ word, start, end }[]` | — | Word-level timestamps (seconds) for audio sync |
| `backgroundColor` | `string` | `#000000` | Background |
| `textColor` | `string` | `#FFFFFF` | Text color |
| `fontSize` | `number` | `64` | Font size in px |
| `fontWeight` | `string` | `'bold'` | CSS font-weight |
| `alignment` | `'center'` / `'left'` / `'right'` | `'center'` | Text alignment |
| `animation` | `'spring'` / `'fade'` / `'scale'` | `'spring'` | Per-word animation style |
| `wordsPerLine` | `number` | `5` | Words grouped per line before wrapping |

When `audioWords` is provided, each word appears at the exact frame matching its `start` timestamp. Without it, words are evenly spaced 3 frames apart.

---

### CodeBlock (`src/templates/components/CodeBlock.tsx:1`)

A styled code editor window with macOS-style traffic-light buttons and animated code reveal.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `code` | `string` | required | Source code string (newlines preserved) |
| `language` | `string` | `'typescript'` | Language label shown in title bar |
| `title` | `string` | — | Filename shown in title bar |
| `backgroundColor` | `string` | `#1E1E1E` | Editor background (the code pane) |
| `textColor` | `string` | `#D4D4D4` | Code text color |
| `highlightColor` | `string` | `#569CD6` | Cursor / highlight color |
| `fontSize` | `number` | `24` | Code font size in px |
| `animation` | `'typewriter'` / `'line-by-line'` / `'fade'` | `'typewriter'` | How code is revealed |

`typewriter` reveals ~`code.length / 90` characters per frame. `line-by-line` reveals one line every 6 frames. `fade` shows all code at once with opacity transition.

---

### TransitionWipe (`src/templates/components/TransitionWipe.tsx:1`)

A dedicated transition scene that fills the screen with a wipe or dissolve effect. Use between content scenes to create a clean visual break.

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `type` | `'wipe-left'` / `'wipe-right'` / `'wipe-up'` / `'wipe-down'` / `'dissolve'` / `'zoom'` | `'wipe-left'` | Transition style |
| `color` | `string` | `#000000` | Wipe fill color |
| `backgroundColor` | `string` | `#000000` | Scene background visible behind the wipe |

The progress animates from 0 to 1 over the full scene duration. Recommended `durationFrames`: 15-20 (0.5-0.7 seconds at 30fps).

---

### AnimatedObject (`src/templates/components/AnimatedObject.tsx:1`)

Low-level primitive for the `custom` scene type. Renders a single element (text, image, or shape) with per-property keyframe animations.

Used indirectly when `sceneType: 'custom'` — the generated scene file renders an array of `AnimatedObject` instances from `composition.json`'s `objects` array.

Object structure passed via `objects` in `create_scene`:
```json
{
  "id": "obj-1",
  "type": "text",
  "content": "Hello World",
  "fontSize": 64,
  "color": "#FFFFFF",
  "position": { "x": "center", "y": 400 },
  "animations": [
    {
      "property": "opacity",
      "from": 0,
      "to": 1,
      "startFrame": 0,
      "endFrame": 20,
      "easing": "ease-out"
    },
    {
      "property": "y",
      "from": 440,
      "to": 400,
      "startFrame": 0,
      "endFrame": 20,
      "easing": "spring",
      "springConfig": { "damping": 12, "stiffness": 150 }
    }
  ]
}
```

Supported `type` values: `'text'`, `'image'`, `'shape'`. Image objects require `src` (path relative to `public/`). Shape objects render colored divs with optional `borderRadius`.

Supported animation `property` values: `opacity`, `x`, `y`, `scale`, `rotation`, `width`, `height`.

Supported `easing` values: `'linear'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`, `'spring'` (physics-based via Remotion `spring()`).

---

## Audio Workflows

### Workflow A: Narration-Driven (Audio as Timeline Master)

This is the most structured workflow. Audio timestamps from a transcription tool (Whisper, AssemblyAI) drive scene durations and word-by-word animations.

**Setup:**
1. Record or generate narration → `narration.mp3`
2. Transcribe with word-level timestamps → `timestamps.json`
3. Place both in `assets/audio/` after `init_project`
4. Call `scan_assets` — it parses `timestamps.json` via `parseTimestampFile()` (`src/utils/audio-utils.ts:19`) and returns `segments` with `startTime`, `endTime`, and `words`

**Timestamp JSON format** (`src/utils/audio-utils.ts:3-16`):
```json
{
  "type": "transcription",
  "speaker": "narrator",
  "totalDuration": 47.3,
  "segments": [
    {
      "id": "seg-001",
      "text": "Welcome to our product.",
      "startTime": 0.0,
      "endTime": 3.2,
      "words": [
        { "word": "Welcome", "start": 0.0, "end": 0.5 },
        { "word": "to", "start": 0.5, "end": 0.7 },
        { "word": "our", "start": 0.7, "end": 1.0 },
        { "word": "product.", "start": 1.0, "end": 3.2 }
      ]
    }
  ]
}
```

**Frame duration from segment:**
```
durationFrames = Math.ceil((segment.endTime - segment.startTime) * fps)
// e.g. (3.2 - 0.0) * 30 = 96 frames
```

This formula is used in `segmentToDurationFrames()` (`src/utils/audio-utils.ts:28`) and must be applied by Claude when calling `create_scene` for each segment.

**Attaching audio to composition** (via `update_composition`):
```json
{
  "audio": {
    "type": "narration",
    "narration": {
      "file": "audio/narration.mp3"
    }
  }
}
```

The `file` path is **relative to `public/`** — not `assets/`. Because `public/audio/` is a symlink to `assets/audio/`, `staticFile('audio/narration.mp3')` resolves correctly (`src/utils/file-ops.ts:157-159`).

`regenerateRootTsx()` adds `<Audio src={staticFile('audio/narration.mp3')} />` inside the composition (`src/utils/file-ops.ts:186-192`).

**Using KineticTypography with word sync:**
```json
{
  "sceneType": "kinetic-typography",
  "durationFrames": 96,
  "audioSegmentIds": ["seg-001"],
  "props": {
    "text": "Welcome to our product.",
    "audioWords": [
      { "word": "Welcome", "start": 0.0, "end": 0.5 },
      { "word": "to", "start": 0.5, "end": 0.7 },
      { "word": "our", "start": 0.7, "end": 1.0 },
      { "word": "product.", "start": 1.0, "end": 3.2 }
    ],
    "animation": "spring"
  }
}
```

---

### Workflow B: Background Music Only

**Setup:**
1. Place `background.mp3` in `assets/audio/`
2. Set `durationMode: "manual"` and `durationSeconds` in `init_project`
3. After project creation, call `update_composition` with the music config

```json
{
  "audio": {
    "type": "background",
    "backgroundMusic": {
      "file": "audio/background.mp3",
      "volume": 0.15,
      "loop": true
    }
  }
}
```

`regenerateRootTsx()` generates:
```tsx
<Audio
  src={staticFile('audio/background.mp3')}
  volume={0.15}
  loop={true}
/>
```

(`src/utils/file-ops.ts:194-200`)

---

### Workflow C: No Audio

Set `audioType: "none"` in `init_project`. No `<Audio>` tag is added to `Root.tsx`. Video duration is controlled entirely by the cumulative `durationFrames` of all scenes.

---

### Both Narration and Background Music

Call `update_composition` with both `narration` and `backgroundMusic` populated. `regenerateRootTsx()` writes both `<Audio>` tags — narration at full volume, background at `volume: 0.15` by default (`src/utils/file-ops.ts:186-200`).

---

## Asset Management

### How Assets Flow to Remotion

```
assets/images/logo.png
       │
       │ symlinked during ensureProjectDirs()
       ▼
public/images/logo.png
       │
       │ staticFile('images/logo.png') resolves this
       ▼
<Img src={staticFile('images/logo.png')} />
```

`staticFile()` from `remotion` always looks in the `public/` directory. The symlinks (`public/images` → `assets/images`, `public/audio` → `assets/audio`, `public/fonts` → `assets/fonts`) are created during `init_project` (`src/utils/file-ops.ts:57-69`).

On Windows, junctions are used instead of symlinks. If symlink creation fails for any reason, the tool falls back to a full copy.

### Using Image Assets in Scenes

The `publicPath` value returned by `scan_assets` is exactly what goes into the `src` or `imageSrc` or `logoSrc` prop:

```json
{
  "sceneType": "image-scene",
  "props": {
    "src": "images/hero.jpg",
    "overlayText": "Our platform at a glance",
    "kenBurns": true
  }
}
```

```json
{
  "sceneType": "title-card",
  "props": {
    "title": "Orion",
    "logoSrc": "images/logo.png"
  }
}
```

### Audio Path Convention

Audio paths in `composition.json` (under `audio.narration.file` and `audio.backgroundMusic.file`) are stored **relative to `public/`**, not `assets/`. This aligns with how `staticFile()` resolves them at render time.

```
Stored in composition.json:  "audio/narration.mp3"
Resolved by staticFile():    public/audio/narration.mp3
                              → symlink to → assets/audio/narration.mp3
```

This convention is documented in the comment at `src/utils/file-ops.ts:157-159`.

---

## Key Code Snippets

### composition.json Structure

The full shape of `composition.json` is defined in `src/state/project-state.ts:5-52`:

```typescript
interface Composition {
  version: string;
  metadata: { title, description, createdAt, updatedAt };
  settings: { width, height, fps, totalDurationFrames, backgroundColor };
  style: { theme, primaryColor, secondaryColor, accentColor, fontFamily, ... };
  audio: { type: 'narration' | 'background' | 'none', narration?, backgroundMusic? };
  scenes: Scene[];
}

interface Scene {
  id: string;
  name: string;
  type: string;           // 'title-card', 'text-scene', etc.
  file: string;           // 'scenes/{id}-{name}.tsx'
  durationFrames: number;
  startFrame: number;     // auto-calculated — never set manually
  audioSegmentIds?: string[];
  transition?: { in: { type, durationFrames? }, out: { type, durationFrames? } };
  props?: Record<string, unknown>;
  objects?: unknown[];    // only for 'custom' type
}
```

### Root.tsx Generation

`Root.tsx` is always generated — never manually edited. The generation logic lives at `src/utils/file-ops.ts:160-235`. It produces:
- Static imports for every scene component
- A `<Composition id="main">` with computed total duration
- A `<Series>` with `<Series.Sequence durationInFrames={N}>` per scene
- `<Audio>` tags for narration and/or background music

The composition ID is always `"main"` — this is what `render_video` and `capture_frame` pass to `npx remotion render main` and `npx remotion still main`.

### startFrame Recalculation

Every mutation to the scenes array (create, delete, reorder) calls `recalculateStartFrames()` (`src/state/project-state.ts:74`):

```typescript
export function recalculateStartFrames(scenes: Scene[]): Scene[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const updated = { ...scene, startFrame: cursor };
    cursor += scene.durationFrames;
    return updated;
  });
}
```

---

## Error Handling

All tool handlers follow the same error response shape (`src/tools/create-scene.ts:96-107`):

```json
{
  "status": "error",
  "message": "Human-readable error description",
  "suggestion": "Actionable next step for Claude to take"
}
```

Common error scenarios:

| Error | Tool | Message Pattern | Recovery |
|-------|------|----------------|---------|
| Project already initialized | `init_project` | `"Project already exists at ... Found existing composition.json."` | Use `update_composition` or `create_scene` |
| No composition.json | Any tool except session/init | `"No composition.json found at ..."` | Run `init_project` first |
| Duplicate scene ID | `create_scene` | `"Scene '{id}' already exists"` | Use `update_scene` or pick a different ID |
| Scene not found | `update_scene`, `delete_scene`, `capture_frame` | `"Scene '{id}' not found"` | Call `list_scenes` to get current IDs |
| Preview already running | `start_preview` | `"status": "already_running"` | Open existing URL or call `stop_preview` first |
| npm install timeout | `init_project` | `"timed out after 2 minutes"` | Run `npm install` manually in the project dir |
| Render timeout | `render_video` | `execa` throws after 10 minutes | Check project compiles; try `draft` quality |

---

## Related Flows

- `docs/planning/remotion-mcp-server.md` — Full planning document with all 13 tool schemas, data models, and build phases
- `docs/planning/implementation-guide.md` — Phase-by-phase implementation guide
