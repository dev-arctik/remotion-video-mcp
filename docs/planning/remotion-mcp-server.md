# Feature: Remotion Video MCP Server

**Version:** v1.0
**Status:** Approved
**Type:** Feature Spec
**Created:** 2026-02-25
**Last Modified:** 2026-02-25

---

## Problem Statement

Creating professional programmatic videos with Remotion requires significant React/TypeScript knowledge and constant context-switching between the IDE, terminal, and browser. Non-developers and developers alike must manually write JSX scene components, run CLI commands, manage composition state, and handle audio synchronisation — all of which are tedious, repetitive tasks.

The goal of this project is to eliminate that friction entirely. By exposing Remotion's video-creation pipeline as an MCP server, Claude can act as the creative brain: it gathers requirements, generates scene files, manages state in `composition.json`, runs the preview server, and triggers renders — all through natural conversation with the user. The user never needs to touch the code directly.

---

## Goals & Success Criteria

- Claude can onboard a user with a conversational questionnaire and scaffold a fully working Remotion project with zero manual setup
- Claude can create, update, delete, and reorder scenes by calling MCP tools — no direct file editing by the user
- Narration-driven videos sync scene durations and word-by-word animations automatically to audio timestamps
- The user can preview their video live in the browser at any point during the conversation
- Claude can render a final MP4 (or WebM) by calling a single tool at the end
- All project state is persisted in a human-readable `composition.json` file that survives server restarts

**Definition of Done:**
- All 13 MCP tools are implemented and return correct responses
- A narration-driven video can be created end-to-end through Claude conversation in under 10 minutes
- A background-music social ad can be created end-to-end
- Rendered MP4 output plays correctly in standard video players

---

## Requirements

### Functional Requirements

- **FR-001:** The MCP server exposes 13 tools over stdio transport using `@modelcontextprotocol/server` (MCP SDK v2)
- **FR-002:** `start_session` returns a structured onboarding questionnaire that Claude uses to guide the user before creating anything
- **FR-003:** `init_project` scaffolds a complete Remotion v4 project including all template components, runs `npm install`, and creates the initial `composition.json`
- **FR-004:** `scan_assets` reads the `assets/` folder, extracts image dimensions, parses audio timestamp JSON files, and returns a structured summary
- **FR-005:** `create_scene` generates a `.tsx` scene file in `scenes/`, registers the scene in `composition.json`, recalculates `startFrame` for all scenes, and updates `Root.tsx`
- **FR-006:** `update_scene` performs full replacement of a scene entry in `composition.json` and regenerates its `.tsx` file; recalculates subsequent `startFrame` values if duration changed
- **FR-007:** `delete_scene` removes the `.tsx` file, removes the scene entry from `composition.json`, and recalculates all `startFrame` values
- **FR-008:** `reorder_scenes` accepts an ordered array of scene IDs and recalculates all `startFrame` values accordingly
- **FR-009:** `list_scenes` returns the full `scenes` array from `composition.json` plus the computed total video duration in frames and seconds
- **FR-010:** `update_composition` patches top-level `composition.json` fields (style, settings, audio config) without touching individual scene entries
- **FR-011:** `start_preview` launches `npx remotion studio` as a child process in the project directory and returns the preview URL (`http://localhost:3000`)
- **FR-012:** `stop_preview` terminates the dev server child process
- **FR-013:** `capture_frame` runs `npx remotion still` to render a single PNG frame and returns the file path (and optionally base64 content)
- **FR-014:** `render_video` runs `npx remotion render` and saves the output to the project's `output/` directory
- **FR-015:** Three audio modes are supported: narration-driven (MP3 + timestamp JSON), background music only (MP3, looping), and no audio
- **FR-016:** For narration-driven videos, scene `durationFrames` is computed from audio segment timestamps: `Math.ceil((segmentEndTime - segmentStartTime) * fps)`
- **FR-017:** `Root.tsx` stitches all scenes using Remotion's `<Series>` component and mounts audio tracks

### Non-Functional Requirements

- The MCP server is a standalone Node.js package (no global install required) — Claude Desktop / Claude CLI connects to it via `node dist/index.js`
- The server is stateless between calls: all persistent state lives in `composition.json` on disk, which is read fresh on each tool invocation
- All tool inputs are validated with Zod v4 schemas (`zod/v4`) using `z.object()` wrappers (required by MCP SDK v2)
- Clear, actionable error messages are returned for all failure cases; Claude relays these to the user with suggested fixes
- TypeScript is used throughout (server + scaffolded project templates)
- Node.js 18+ is required

### Assumptions

- Users have Node.js 18+ and `npx` available on their machine
- Audio timestamp files follow the schema documented in this spec (compatible with Whisper/AssemblyAI word-level output)
- The MCP server is installed as a local path reference in `claude_desktop_config.json` or `~/.claude/` MCP config
- Remotion Studio uses port 3000 by default; no port conflict handling is in scope for v1

---

## User Stories

| Priority | Story | Acceptance Criteria |
|----------|-------|---------------------|
| Must | As a user, I want to describe my video in plain language and have Claude set up the project automatically, so I don't need to configure Remotion manually | `start_session` + `init_project` flow completes with a compilable project |
| Must | As a user, I want to place my voiceover and timestamps in a folder and have the video sync to my narration automatically, so scene durations match what I say | `scan_assets` parses timestamps; `create_scene` uses segment timing for `durationFrames` |
| Must | As a user, I want to preview my video in the browser while Claude builds it, so I can give feedback in real time | `start_preview` launches Remotion Studio; changes to scene files trigger hot reload |
| Must | As a user, I want to say "make scene 3 longer" or "move the logo to the left" and have Claude update the scene, so iteration is conversational | `update_scene` patches the correct scene; `startFrame` values recalculate automatically |
| Must | As a user, I want to render a final MP4 with one command, so I can share or publish the video immediately | `render_video` produces a valid MP4 in `output/` |
| Should | As a user, I want Claude to capture a frame and tell me what it looks like, so I can review specific moments without opening the browser | `capture_frame` returns a PNG path; Claude can use vision to describe it |
| Should | As a user, I want to reorder my scenes by telling Claude the new sequence, so editing the video structure is easy | `reorder_scenes` updates order and recalculates all `startFrame` values |
| Could | As a user, I want word-by-word text animations synced to my voiceover, so the video feels professionally produced | `KineticTypography` component reads `audioWords` timestamps to drive per-word entrance timing |

---

## Technical Design

### Architecture Overview

```
┌─────────────────────┐         MCP Protocol (stdio)          ┌────────────────────────┐
│                     │ ◄───────────────────────────────────► │                        │
│   Claude CLI /      │    Tool calls (JSON) & responses       │   remotion-video-mcp   │
│   Claude Desktop    │                                        │     (MCP Server)       │
│                     │                                        │     Node.js + TS       │
└─────────────────────┘                                        └──────────┬─────────────┘
                                                                          │
                                                    ┌─────────────────────┼──────────────────────┐
                                                    │                     │                      │
                                                    ▼                     ▼                      ▼
                                            ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
                                            │  File I/O    │   │ Process Manager  │   │  State Manager   │
                                            │  (fs-extra)  │   │    (execa)       │   │ (composition.json│
                                            │              │   │                  │   │   on disk)       │
                                            └──────┬───────┘   └────────┬─────────┘   └──────────────────┘
                                                   │                    │
                                                   ▼                    ▼
                                         ┌──────────────────────────────────────────┐
                                         │           Remotion Project               │
                                         │         (in user's CWD)                  │
                                         │                                           │
                                         │  composition.json  ← source of truth     │
                                         │  scenes/*.tsx      ← generated per scene  │
                                         │  src/Root.tsx      ← composition stitcher │
                                         │  assets/           ← user-provided files  │
                                         │  output/           ← rendered videos      │
                                         │                                           │
                                         │  [npx remotion studio] ← preview server  │
                                         │  [npx remotion render] ← render pipeline │
                                         └──────────────────────────────────────────┘
```

### Component Breakdown

#### MCP Server Package

| Component | File | Purpose |
|-----------|------|---------|
| Entry point | `src/index.ts` | Instantiates `McpServer`, connects `StdioServerTransport` |
| Server setup | `src/server.ts` | Registers all 13 tools via `server.registerTool()` |
| Start session | `src/tools/start-session.ts` | Returns structured onboarding questionnaire |
| Init project | `src/tools/init-project.ts` | Scaffolds Remotion project, runs `npm install` |
| Scan assets | `src/tools/scan-assets.ts` | Reads `assets/`, parses image metadata and timestamp JSON |
| Create scene | `src/tools/create-scene.ts` | Generates `.tsx`, updates `composition.json`, updates `Root.tsx` |
| Update scene | `src/tools/update-scene.ts` | Full-replace scene in `composition.json`, regenerates `.tsx` |
| Delete scene | `src/tools/delete-scene.ts` | Removes `.tsx`, removes from `composition.json`, recalculates frames |
| Reorder scenes | `src/tools/reorder-scenes.ts` | Reorders `scenes` array, recalculates all `startFrame` values |
| List scenes | `src/tools/list-scenes.ts` | Returns scenes array + computed total duration |
| Update composition | `src/tools/update-composition.ts` | Patches top-level `composition.json` fields |
| Start preview | `src/tools/start-preview.ts` | Spawns `npx remotion studio` via `execa` |
| Stop preview | `src/tools/stop-preview.ts` | Kills the studio child process by PID |
| Capture frame | `src/tools/capture-frame.ts` | Runs `npx remotion still`, returns PNG path |
| Render video | `src/tools/render-video.ts` | Runs `npx remotion render`, outputs to `output/` |
| Project state | `src/state/project-state.ts` | Reads/writes `composition.json`; stateless — no in-memory cache |
| File ops | `src/utils/file-ops.ts` | `fs-extra` helpers for copy, write, ensure-dir |
| Process manager | `src/utils/process-manager.ts` | Tracks running dev server PIDs via `execa` |
| Audio utils | `src/utils/audio-utils.ts` | Parses timestamp JSON, computes segment durations in frames |

#### Scaffolded Remotion Project Components

| Component | File | Purpose |
|-----------|------|---------|
| Composition root | `src/Root.tsx` | Stitches all scenes with `<Series>`, mounts `<Audio>` tracks |
| Scene dispatcher | `src/SceneRenderer.tsx` | Maps `scene.type` to the correct template component |
| Title card | `src/templates/TitleCard.tsx` | Full-screen title with animated text entrance |
| Text scene | `src/templates/TextScene.tsx` | Paragraph or bullet list with fade/typewriter/word-by-word |
| Image scene | `src/templates/ImageScene.tsx` | Full-frame image with Ken Burns effect and optional overlay |
| Split layout | `src/templates/TextWithImage.tsx` | 50/50 text-and-image split with side entrance animations |
| Kinetic type | `src/templates/KineticTypography.tsx` | Per-word animated entrance, optionally audio-synced |
| Code block | `src/templates/CodeBlock.tsx` | Syntax-highlighted code with typewriter or line-by-line animation |
| Transition wipe | `src/templates/TransitionWipe.tsx` | Standalone scene-length transition (wipe, dissolve, circle) |
| Generic renderer | `src/templates/AnimatedObject.tsx` | Renders any object type (text/image/shape) from animation timeline spec |
| Animations | `src/utils/animations.ts` | `spring` and `interpolate` wrapper helpers |
| Colors | `src/utils/colors.ts` | Palette utilities from `style` block |
| Fonts | `src/utils/fonts.ts` | Google Font or custom font loading via `@remotion/fonts` |

### Data Models / Schema Changes

#### `composition.json` — The Master State File

This is the single source of truth. The Remotion project reads it; Claude writes it via MCP tools. It lives at the root of the scaffolded project.

```json
{
  "version": "1.0",
  "metadata": {
    "title": "My Product Launch Video",
    "description": "A 45-second explainer for the SaaS product",
    "createdAt": "2026-02-25T10:00:00Z",
    "updatedAt": "2026-02-25T10:30:00Z"
  },
  "settings": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "totalDurationFrames": null,
    "backgroundColor": "#000000"
  },
  "style": {
    "theme": "minimal",
    "primaryColor": "#2563EB",
    "secondaryColor": "#1E293B",
    "accentColor": "#F59E0B",
    "fontFamily": "Inter",
    "headingFontFamily": "Inter",
    "defaultTextColor": "#FFFFFF",
    "defaultFontSize": 48
  },
  "audio": {
    "type": "narration",
    "narration": {
      "file": "assets/audio/voiceover.mp3",
      "timestampFile": "assets/audio/voiceover.json",
      "totalDuration": 44.8,
      "segments": [
        {
          "id": "seg-001",
          "text": "APIs are everywhere in modern software",
          "startTime": 0.0,
          "endTime": 2.8,
          "words": [
            { "word": "APIs", "start": 0.0, "end": 0.4 },
            { "word": "everywhere", "start": 0.65, "end": 1.2 }
          ]
        }
      ]
    },
    "backgroundMusic": {
      "file": "assets/audio/bg-music.mp3",
      "volume": 0.15,
      "loop": true,
      "fadeInFrames": 30,
      "fadeOutFrames": 60
    }
  },
  "scenes": [
    {
      "id": "scene-001",
      "name": "intro",
      "type": "title-card",
      "file": "scenes/scene-001-intro.tsx",
      "durationFrames": 90,
      "startFrame": 0,
      "audioSegmentIds": ["seg-001"],
      "transition": {
        "in": { "type": "fade", "durationFrames": 15 },
        "out": { "type": "wipe-left", "durationFrames": 20 }
      },
      "props": {
        "title": "How APIs Work",
        "subtitle": "A visual guide",
        "backgroundColor": "#0f0f23",
        "titleColor": "#FFFFFF",
        "titleFontSize": 72,
        "subtitleFontSize": 32
      }
    },
    {
      "id": "scene-002",
      "name": "product-showcase",
      "type": "custom",
      "file": "scenes/scene-002-product.tsx",
      "durationFrames": 150,
      "startFrame": 90,
      "audioSegmentIds": ["seg-002", "seg-003"],
      "transition": {
        "in": { "type": "none" },
        "out": { "type": "fade", "durationFrames": 15 }
      },
      "props": { "backgroundColor": "#0f0f23" },
      "objects": [
        {
          "id": "product-img",
          "type": "image",
          "src": "assets/images/product-shot.png",
          "position": { "x": "center", "y": "center" },
          "size": { "width": "60%", "height": "auto" },
          "animations": [
            { "property": "opacity", "from": 0, "to": 1, "startFrame": 0, "endFrame": 20, "easing": "linear" },
            { "property": "scale", "from": 1.15, "to": 1.0, "startFrame": 0, "endFrame": 40, "easing": "spring",
              "springConfig": { "damping": 12, "mass": 0.5, "stiffness": 100 } }
          ]
        }
      ]
    }
  ]
}
```

**Key schema rules:**
- `settings.totalDurationFrames` — set to `null` when `durationMode = "audio"` (computed at render from narration duration); set to a number when `durationMode = "manual"`
- `audio.type` — `"narration"` | `"background"` | `"none"`
- Scene `startFrame` — always computed by the MCP server as the cumulative sum of all preceding scenes' `durationFrames`; never set manually
- Scene `type` — `"title-card"` | `"text-scene"` | `"image-scene"` | `"text-with-image"` | `"kinetic-typography"` | `"code-block"` | `"custom"`
- `"custom"` scenes use the `objects` array; all other types use the `props` object passed directly to the named template component

#### Audio Timestamp JSON (user-provided)

```json
{
  "type": "voiceover",
  "speaker": "narrator",
  "totalDuration": 44.8,
  "segments": [
    {
      "id": "seg-001",
      "text": "APIs are everywhere in modern software",
      "startTime": 0.0,
      "endTime": 2.8,
      "words": [
        { "word": "APIs", "start": 0.0, "end": 0.4 },
        { "word": "are", "start": 0.45, "end": 0.6 },
        { "word": "everywhere", "start": 0.65, "end": 1.2 },
        { "word": "in", "start": 1.25, "end": 1.35 },
        { "word": "modern", "start": 1.4, "end": 1.7 },
        { "word": "software", "start": 1.75, "end": 2.8 }
      ]
    }
  ]
}
```

Compatible with word-level timestamp output from Whisper (OpenAI) and AssemblyAI. `scan_assets` parses this file and stores the full `segments` array inside `composition.json` under `audio.narration.segments`.

### API Contracts — All 13 MCP Tools

All tools are registered with `server.registerTool()` using the MCP SDK v2 pattern (verified via Context7):

```typescript
// Pattern for every tool in src/server.ts
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'remotion-video-mcp', version: '1.0.0' });

server.registerTool(
  'tool_name',
  {
    description: '...',
    inputSchema: z.object({ /* Zod schema — must use z.object() wrapper */ })
  },
  async (input) => {
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

#### Tool 1: `start_session`

**Purpose:** Called first — always. Returns a structured onboarding guide that Claude follows conversationally to gather all parameters before initialising anything.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workingDirectory` | `string` | Yes | CWD where the project will be created |

**Returns:**
```json
{
  "status": "onboarding",
  "message": "Welcome to Remotion Video Creator! ...",
  "required_questions": [ "video_purpose", "duration", "audio_type", "assets_available", "visual_style", "dimensions" ],
  "optional_questions": [ "brand_colors", "font_preference", "reference_style", "text_content" ],
  "post_onboarding_instructions": "Summarize plan, confirm with user, then call init_project."
}
```

**MCP description (verbatim for tool registration):**
> ALWAYS call this tool FIRST before any other remotion tool when the user wants to create a video. This tool returns a structured onboarding guide. You MUST walk the user through these questions conversationally before calling init_project. Ask 2-3 questions at a time, not all at once. Do NOT call init_project until you have all required information.

---

#### Tool 2: `init_project`

**Purpose:** Scaffolds the full Remotion project in the user's CWD: directory tree, all template components, `package.json`, `tsconfig.json`, `remotion.config.ts`, initial `composition.json`, then runs `npm install`.

**Input schema:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `projectName` | `string` | Yes | — | Folder name (kebab-case) |
| `workingDirectory` | `string` | Yes | — | Parent directory where the project folder will be created |
| `title` | `string` | Yes | — | Human-readable video title |
| `width` | `number` | No | `1920` | Canvas width in px |
| `height` | `number` | No | `1080` | Canvas height in px |
| `fps` | `number` | No | `30` | Frames per second |
| `durationMode` | `"audio" \| "manual"` | Yes | — | `"audio"` = duration from narration; `"manual"` = uses `durationSeconds` |
| `durationSeconds` | `number` | No | — | Required when `durationMode = "manual"` |
| `audioType` | `"narration" \| "background" \| "none"` | Yes | — | Audio mode |
| `style` | `object` | No | — | `{ theme, primaryColor, secondaryColor, accentColor, fontFamily }` |

**Returns:**
```json
{
  "status": "success",
  "projectPath": "/Users/john/projects/product-launch-video",
  "message": "Project scaffolded and dependencies installed.",
  "next_steps": "Place assets in assets/ then call scan_assets.",
  "structure_created": ["assets/images/", "assets/audio/", "assets/fonts/", "scenes/", "src/", "public/", "output/"]
}
```

**Side effects:** Copies all template components from `src/templates/` in the MCP server package into `{projectPath}/src/templates/`. Copies `SceneRenderer.tsx`. Generates `Root.tsx` dynamically via `regenerateRootTsx()` (Root.tsx is NOT a static template — it is regenerated on every scene mutation). Creates `public/` directory with symlinks to `assets/` subdirectories so Remotion's `staticFile()` can find assets. Runs `npm install` inside `{projectPath}`.

---

#### Tool 3: `scan_assets`

**Purpose:** Reads the `assets/` folder, extracts image dimensions, detects audio files, and parses timestamp JSON. Returns a structured asset inventory for Claude to plan scenes around.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | Path to Remotion project root |

**Returns:**
```json
{
  "status": "success",
  "assets": {
    "images": [
      { "filename": "product.png", "path": "assets/images/product.png", "width": 2400, "height": 1600, "sizeKB": 450, "format": "png" }
    ],
    "audio": [
      { "filename": "voiceover.mp3", "path": "assets/audio/voiceover.mp3", "durationSeconds": 44.8, "format": "mp3" },
      { "filename": "voiceover.json", "type": "timestamps", "segmentCount": 15, "totalDuration": 44.8, "segments": ["..."] }
    ],
    "fonts": [
      { "filename": "CustomFont-Bold.woff2", "path": "assets/fonts/CustomFont-Bold.woff2" }
    ]
  },
  "instructions_for_claude": "Present asset summary; propose scene plan; confirm before proceeding."
}
```

---

#### Tool 4: `create_scene`

**Purpose:** Generates a new `.tsx` scene file in `scenes/`, registers it in `composition.json`, recalculates `startFrame` for all scenes sequentially, and updates `Root.tsx`.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | Path to project root |
| `sceneId` | `string` | Yes | Unique ID, e.g. `"scene-001"` |
| `sceneName` | `string` | Yes | Human-readable name, e.g. `"intro"` |
| `sceneType` | `string` | Yes | `"title-card"` \| `"text-scene"` \| `"image-scene"` \| `"text-with-image"` \| `"kinetic-typography"` \| `"code-block"` \| `"custom"` |
| `durationFrames` | `number` | Yes | Duration in frames (30fps: 30=1s, 90=3s, 150=5s) |
| `audioSegmentIds` | `string[]` | No | Audio segment IDs this scene covers |
| `transition` | `object` | No | `{ in: { type, durationFrames }, out: { type, durationFrames } }` |
| `props` | `object` | No | Props for template components (schema varies by `sceneType`) |
| `objects` | `array` | No | For `"custom"` type — array of animated object definitions |

**Transition types:** `"none"` \| `"fade"` \| `"slide-left"` \| `"slide-right"` \| `"slide-up"` \| `"slide-down"` \| `"wipe-left"` \| `"wipe-right"` \| `"zoom"`

**For narration-driven videos:** `durationFrames = Math.ceil((segmentEndTime - segmentStartTime) * fps)`

**Side effects:** Writes `scenes/scene-{id}-{name}.tsx`, mutates `composition.json`, regenerates `Root.tsx`.

---

#### Tool 5: `update_scene`

**Purpose:** Full-replacement update of an existing scene. Only the specified fields are changed; the tool reconstructs the complete scene entry and regenerates the `.tsx` file. Recalculates subsequent `startFrame` values if `durationFrames` changed.

**Input schema:** Same as `create_scene` — `sceneId` is the required identifier; all other fields are optional (only supplied fields are updated).

---

#### Tool 6: `delete_scene`

**Purpose:** Removes a scene's `.tsx` file, deletes its entry from `composition.json`, and recalculates `startFrame` for all scenes that follow.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |
| `sceneId` | `string` | Yes | Scene to delete |

**Note:** Claude should confirm deletion with the user before calling this tool.

---

#### Tool 7: `reorder_scenes`

**Purpose:** Changes scene order. Accepts a full ordered array of scene IDs; recalculates all `startFrame` values and regenerates `Root.tsx`.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |
| `sceneOrder` | `string[]` | Yes | All scene IDs in desired order |

---

#### Tool 8: `list_scenes`

**Purpose:** Returns the current `scenes` array from `composition.json` with computed values for total duration (in frames and seconds). Called whenever Claude needs a snapshot of the current video state.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |

**Returns:** `{ scenes: [...], totalFrames: 900, totalSeconds: 30, fps: 30 }`

---

#### Tool 9: `update_composition`

**Purpose:** Patches top-level `composition.json` fields — global style, settings (dimensions, fps, background), or audio config. Does NOT touch individual scene entries.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |
| `settings` | `object` | No | Partial `settings` block |
| `style` | `object` | No | Partial `style` block |
| `audio` | `object` | No | Partial `audio` block |
| `metadata` | `object` | No | Partial `metadata` block |

---

#### Tool 10: `start_preview`

**Purpose:** Spawns `npx remotion studio` as a background child process. Remotion Studio watches scene files for changes and hot-reloads automatically.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |

**Returns:**
```json
{
  "status": "running",
  "url": "http://localhost:3000",
  "message": "Remotion Studio is running. Open http://localhost:3000 in your browser.",
  "pid": 12345
}
```

**Process management:** The PID is stored by `process-manager.ts` so `stop_preview` can terminate it. Uses `execa` for spawning.

---

#### Tool 11: `stop_preview`

**Purpose:** Terminates the running Remotion Studio process. Call before `render_video` to free resources.

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |

---

#### Tool 12: `capture_frame`

**Purpose:** Runs `npx remotion still` to render a single frame as a PNG. Returns the output file path (and optionally base64 for vision-capable analysis).

**Input schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectPath` | `string` | Yes | — |
| `frame` | `number` | Yes | Zero-based frame number to capture |
| `sceneId` | `string` | No | If provided, `frame` is relative to the scene's `startFrame` |

**CLI command executed:**
```bash
npx remotion still src/index.ts main output/frame-{frame}.png --frame={frame}
```

---

#### Tool 13: `render_video`

**Purpose:** Runs the full Remotion render pipeline to produce the final video file in `output/`.

**Input schema:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `projectPath` | `string` | Yes | — | — |
| `outputFormat` | `"mp4" \| "webm"` | No | `"mp4"` | Output container |
| `quality` | `"draft" \| "standard" \| "high"` | No | `"standard"` | `draft` = fast/lower CRF, `high` = slow/best CRF |
| `outputFileName` | `string` | No | `"output"` | Output filename without extension |

**CLI command executed (verified via Context7):**
```bash
# standard quality (CRF 23, h264)
npx remotion render src/index.ts main output/{outputFileName}.mp4

# high quality
npx remotion render src/index.ts main output/{outputFileName}.mp4 --codec h264 --crf 18

# draft quality
npx remotion render src/index.ts main output/{outputFileName}.mp4 --codec h264 --crf 28
```

---

### Template Components — Detailed Props

#### TitleCard.tsx

Full-screen title card with animated text entrance.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | `string` | Yes | — | Main title text |
| `subtitle` | `string` | No | — | Optional subtitle |
| `backgroundColor` | `string` | Yes | — | Background fill color |
| `titleColor` | `string` | No | `#FFFFFF` | Title text color |
| `subtitleColor` | `string` | No | 70% opacity of titleColor | Subtitle color |
| `titleFontSize` | `number` | No | `72` | Title size in px |
| `subtitleFontSize` | `number` | No | `32` | Subtitle size in px |
| `alignment` | `"center" \| "left" \| "right"` | No | `"center"` | Text alignment |
| `logoSrc` | `string` | No | — | Optional logo path (via `staticFile()`) |

**Animations:** Title fades in + slides up 20px (spring, frames 0–25). Subtitle same but delayed 15 frames. Logo fades in at frame 0.

---

#### TextScene.tsx

Paragraph or bullet list with configurable entrance animation.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `heading` | `string` | No | Optional heading above body |
| `body` | `string \| string[]` | Yes | Paragraph string or bullet-point array |
| `backgroundColor` | `string` | Yes | — |
| `textColor` | `string` | Yes | — |
| `fontSize` | `number` | Yes | — |
| `textPosition` | `"center" \| "left" \| "right"` | No | — |
| `animation` | `"fade" \| "typewriter" \| "slide-up" \| "word-by-word"` | Yes | Entrance animation style |

**Animation notes:** `"word-by-word"` reads `audioWords` timestamps if available, otherwise staggers by 4 frames per word. Uses `spring` + `interpolate` from `remotion` (verified via Context7).

---

#### ImageScene.tsx

Full-frame image with optional Ken Burns pan/zoom and overlay text.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `imageSrc` | `string` | Yes | — | Asset path (via `staticFile()`) |
| `imageFit` | `"cover" \| "contain" \| "fill"` | No | `"cover"` | CSS object-fit |
| `overlayText` | `string` | No | — | Text overlaid on image |
| `overlayPosition` | `"top" \| "center" \| "bottom"` | No | `"bottom"` | — |
| `overlayBackdrop` | `boolean` | No | `true` | Semi-transparent backdrop behind text |
| `kenBurns` | `boolean` | No | `true` | Slow zoom/pan effect |
| `kenBurnsDirection` | `"in" \| "out" \| "left" \| "right"` | No | `"in"` | Zoom direction |

**Audio import note:** `<Audio>` component is imported from `@remotion/media` (not `remotion`) per Remotion v4. `staticFile()` is still imported from `remotion`.

---

#### TextWithImage.tsx

Split-screen layout — image on one side, text on the other.

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `imageSrc` | `string` | Yes | — | — |
| `imagePosition` | `"left" \| "right"` | No | `"right"` | Which side the image occupies |
| `imageSplit` | `number` | No | `50` | % of width for image panel |
| `heading` | `string` | No | — | — |
| `body` | `string` | Yes | — | — |
| `backgroundColor` | `string` | Yes | — | — |
| `textColor` | `string` | Yes | — | — |

**Animations:** Image slides in from its side; text fades in from opposite side; 10-frame stagger between the two.

---

#### KineticTypography.tsx

Per-word animated entrance — ideal for lyric videos, narration highlights, or title emphasis sequences.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `words` | `Array<{ text: string, emphasis?: boolean, color?: string }>` | Yes | Word list with optional per-word styling |
| `backgroundColor` | `string` | Yes | — |
| `defaultColor` | `string` | Yes | — |
| `animationStyle` | `"bounce" \| "scale-pop" \| "slide" \| "rotate"` | Yes | Per-word entrance motion |
| `audioWords` | `Array<{ word: string, start: number, end: number }>` | No | Word-level timestamps for audio-sync |

**Audio sync:** When `audioWords` is provided, each word's entrance frame = `Math.floor(word.start * fps)`. Without it, words stagger by 3–5 frames.

---

#### CodeBlock.tsx

Syntax-highlighted code display for developer/technical content.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `code` | `string` | Yes | Raw code string |
| `language` | `string` | Yes | Language for syntax highlighting |
| `theme` | `"dark" \| "light"` | No | Color theme (default `"dark"`) |
| `highlightLines` | `number[]` | No | Lines to visually emphasise |
| `animation` | `"typewriter" \| "line-by-line" \| "fade"` | No | How code appears |

---

#### TransitionWipe.tsx

A standalone scene-duration transition component inserted between content scenes.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `type` | `"wipe-left" \| "wipe-right" \| "wipe-up" \| "wipe-down" \| "circle" \| "dissolve"` | Yes | Wipe style |
| `color` | `string` | Yes | Wipe panel color |
| `durationFrames` | `number` | Yes | Transition length (usually 15–30 frames) |

---

#### AnimatedObject.tsx — The Generic Renderer

Reads a single object definition from a `"custom"` scene's `objects` array and applies each animation in its timeline using `spring` and `interpolate` from `remotion`.

**Object types:** `"text"` \| `"image"` \| `"shape"` \| `"svg"`

**Animation properties:** `"opacity"` \| `"x"` \| `"y"` \| `"scale"` \| `"rotation"` \| `"width"` \| `"height"`

**Easing types:** `"linear"` \| `"ease-in"` \| `"ease-out"` \| `"ease-in-out"` \| `"spring"`

**Spring config fields:** `damping` (default 10), `mass` (default 1), `stiffness` (default 100)

**Rendering logic (pseudocode):**
```typescript
// For each animation in config.animations:
// - Before startFrame: apply `from` value
// - Between startFrame and endFrame: interpolate or spring to current progress
// - After endFrame: hold at `to` value
// spring() and interpolate() are from 'remotion' (verified via Context7)
```

---

### Integration Points — Root.tsx

`Root.tsx` (generated into the scaffolded project) stitches scenes and audio using Remotion's `<Composition>` and `<Series>` components. Audio is handled by `<Audio>` from `@remotion/media` (verified via Context7 — v4 moves `<Audio>` out of core `remotion` into `@remotion/media`).

```tsx
// Structural pseudocode — Root.tsx
import { Composition, Series, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import compositionData from '../composition.json';
import { SceneRenderer } from './SceneRenderer';

export const RemotionRoot = () => {
  const { settings, scenes, audio } = compositionData;
  const totalFrames = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

  return (
    <Composition
      id="main"
      component={() => (
        <>
          {/* Background music — loops if configured */}
          {audio.backgroundMusic && (
            <Audio
              src={staticFile(audio.backgroundMusic.file)}
              volume={audio.backgroundMusic.volume}
              loop={audio.backgroundMusic.loop}
            />
          )}
          {/* Narration track */}
          {audio.type === 'narration' && (
            <Audio src={staticFile(audio.narration.file)} />
          )}
          {/* Scenes in sequence */}
          <Series>
            {scenes.map((scene) => (
              <Series.Sequence key={scene.id} durationInFrames={scene.durationFrames}>
                <SceneRenderer scene={scene} compositionData={compositionData} />
              </Series.Sequence>
            ))}
          </Series>
        </>
      )}
      durationInFrames={totalFrames}
      fps={settings.fps}
      width={settings.width}
      height={settings.height}
    />
  );
};
```

---

## Audio Modes

### Mode 1: Narration-Driven

| Attribute | Value |
|-----------|-------|
| `audio.type` | `"narration"` |
| User provides | MP3 file + timestamp JSON (word-level timing) |
| Duration source | `Math.ceil(audio.narration.totalDuration * settings.fps)` |
| Scene duration | `Math.ceil((segment.endTime - segment.startTime) * fps)` per segment |
| Sync capability | Per-word animation entrance timing |
| Compatible generators | Whisper (OpenAI), AssemblyAI word-level output |

### Mode 2: Background Music Only

| Attribute | Value |
|-----------|-------|
| `audio.type` | `"background"` |
| User provides | MP3 file (no timestamps needed) |
| Duration source | User-specified (`durationMode = "manual"`) |
| Audio behaviour | Loops in background at configurable volume with fade in/out |

### Mode 3: No Audio

| Attribute | Value |
|-----------|-------|
| `audio.type` | `"none"` |
| User provides | Nothing |
| Duration source | User-specified (`durationMode = "manual"`) |
| Use case | Silent slideshows, screen recordings overlay, muted social content |

---

## Project File Structure

### MCP Server Package

```
remotion-video-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                      ← Entry point: McpServer + StdioServerTransport
│   ├── server.ts                     ← All 13 server.registerTool() registrations
│   ├── tools/
│   │   ├── start-session.ts
│   │   ├── init-project.ts
│   │   ├── scan-assets.ts
│   │   ├── create-scene.ts
│   │   ├── update-scene.ts
│   │   ├── delete-scene.ts
│   │   ├── reorder-scenes.ts
│   │   ├── list-scenes.ts
│   │   ├── update-composition.ts
│   │   ├── start-preview.ts
│   │   ├── stop-preview.ts
│   │   ├── capture-frame.ts
│   │   └── render-video.ts
│   ├── state/
│   │   └── project-state.ts          ← read/write composition.json; stateless (no cache)
│   ├── templates/                    ← Copied into scaffolded project on init_project
│   │   ├── components/
│   │   │   ├── TitleCard.tsx
│   │   │   ├── TextScene.tsx
│   │   │   ├── ImageScene.tsx
│   │   │   ├── TextWithImage.tsx
│   │   │   ├── KineticTypography.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── TransitionWipe.tsx
│   │   │   └── AnimatedObject.tsx
│   │   ├── SceneRenderer.tsx         ← Copied once; Root.tsx is NOT here — it is GENERATED by file-ops.ts
│   │   └── utils/
│   │       ├── animations.ts
│   │       ├── colors.ts
│   │       └── fonts.ts
│   └── utils/
│       ├── file-ops.ts
│       ├── process-manager.ts
│       └── audio-utils.ts
└── templates/
    └── project-scaffold/             ← Config file templates with placeholder substitution
        ├── package.json.template
        ├── tsconfig.json.template
        └── remotion.config.ts.template
```

### Scaffolded Remotion Project (Created in User's CWD)

```
{project-name}/
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── composition.json                  ← Master state — source of truth
├── assets/
│   ├── images/
│   ├── audio/
│   └── fonts/
├── scenes/
│   ├── scene-001-intro.tsx           ← Generated per scene; re-generated on update
│   └── scene-002-main.tsx
├── src/
│   ├── Root.tsx                      ← Re-generated when scenes change
│   ├── SceneRenderer.tsx
│   ├── templates/
│   │   ├── TitleCard.tsx
│   │   ├── TextScene.tsx
│   │   ├── ImageScene.tsx
│   │   ├── TextWithImage.tsx
│   │   ├── KineticTypography.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── TransitionWipe.tsx
│   │   └── AnimatedObject.tsx
│   └── utils/
│       ├── animations.ts
│       ├── colors.ts
│       └── fonts.ts
└── output/                           ← render_video writes here
```

---

## Implementation Plan

### Phase 1: MCP Server Foundation

**Goal:** Claude can have the onboarding conversation and create a scaffolded, compilable Remotion project.

| Task | File(s) |
|------|---------|
| Set up Node.js + TypeScript package | `package.json`, `tsconfig.json` |
| Bootstrap `McpServer` with `StdioServerTransport` | `src/index.ts`, `src/server.ts` |
| Implement `start_session` tool | `src/tools/start-session.ts` |
| Build `project-scaffold/` templates | `templates/project-scaffold/` |
| Implement `init_project` tool (scaffold + `npm install`) | `src/tools/init-project.ts` |
| Implement `list_scenes` tool | `src/tools/list-scenes.ts` |
| Implement `project-state.ts` (read/write `composition.json`) | `src/state/project-state.ts` |
| Implement `file-ops.ts` helpers | `src/utils/file-ops.ts` |

**Phase complete when:** Claude calls `start_session`, asks onboarding questions, calls `init_project`, and the scaffolded project runs `npx remotion studio` without errors.

---

### Phase 2: Scene Management

**Goal:** Claude can create and modify scenes; the Remotion project compiles with each change.

| Task | File(s) |
|------|---------|
| Build all 8 template components | `src/templates/*.tsx` |
| Build `SceneRenderer.tsx` (type → component mapping) | `src/templates/SceneRenderer.tsx` |
| Build `regenerateRootTsx()` with `<Series>` stitching | `src/utils/file-ops.ts` (Root.tsx is generated dynamically, not a static template) |
| Implement `create_scene` tool | `src/tools/create-scene.ts` |
| Implement `update_scene` tool | `src/tools/update-scene.ts` |
| Implement `delete_scene` tool | `src/tools/delete-scene.ts` |
| Implement `reorder_scenes` tool | `src/tools/reorder-scenes.ts` |

**Phase complete when:** Claude can create 3+ scenes, update one, delete one, and the Remotion project still compiles. `startFrame` values are always correct.

---

### Phase 3: Assets and Audio

**Goal:** Narration-driven video syncs correctly to audio timestamps; background music loops as configured.

| Task | File(s) |
|------|---------|
| Implement `scan_assets` with image metadata extraction | `src/tools/scan-assets.ts` |
| Build `audio-utils.ts` (timestamp parsing, frame calculation) | `src/utils/audio-utils.ts` |
| Wire narration duration → `totalDurationFrames` in `composition.json` | `src/tools/scan-assets.ts` + `project-state.ts` |
| Wire `<Audio>` in `Root.tsx` for narration track | `src/utils/file-ops.ts` (`regenerateRootTsx` adds Audio imports) |
| Wire `<Audio>` in `Root.tsx` for background music with fade | `src/utils/file-ops.ts` (`regenerateRootTsx` adds Audio with fade) |
| Wire word timestamps → `KineticTypography` and `word-by-word` in `TextScene` | `src/templates/KineticTypography.tsx`, `TextScene.tsx` |

**Phase complete when:** A narration-driven video with 5 scenes renders correctly with audio in sync; `totalFrames` matches `totalDuration * fps`.

---

### Phase 4: Preview and Render

**Goal:** Full end-to-end flow — onboard → create → preview → iterate → render — works without manual terminal commands.

| Task | File(s) |
|------|---------|
| Build `process-manager.ts` (execa-based process tracking) | `src/utils/process-manager.ts` |
| Implement `start_preview` (spawn `npx remotion studio`) | `src/tools/start-preview.ts` |
| Implement `stop_preview` (kill by PID) | `src/tools/stop-preview.ts` |
| Implement `capture_frame` (`npx remotion still`) | `src/tools/capture-frame.ts` |
| Implement `render_video` (`npx remotion render` with quality flags) | `src/tools/render-video.ts` |
| Implement `update_composition` | `src/tools/update-composition.ts` |

**Phase complete when:** `render_video` produces a valid MP4 that plays in VLC/QuickTime and matches the preview seen in Remotion Studio.

---

### Phase 5: Polish and Edge Cases

| Task | Notes |
|------|-------|
| Transition support between scenes | `TransitionWipe.tsx` + scene-level `transition.in/out` in `create_scene` |
| `KineticTypography` with full audio sync | Entrance frame per word = `Math.floor(word.start * fps)` |
| `CodeBlock` animation variants | `typewriter`, `line-by-line`, `fade` |
| Error handling across all tools | See Error Handling section |
| Input validation review | All `z.object()` schemas tested with malformed input |
| Test: complex multi-scene narration video | 10+ scenes, mixed template types, word-sync |

---

## Testing Strategy

- [ ] Unit tests: `audio-utils.ts` — segment duration calculation, frame math, schema validation
- [ ] Unit tests: `project-state.ts` — read/write/patch of `composition.json`; malformed JSON handling
- [ ] Unit tests: `startFrame` recalculation after create/delete/reorder
- [ ] Integration test: `init_project` produces a project that `npx remotion studio` starts without errors
- [ ] Integration test: `create_scene` → `list_scenes` roundtrip — scene count and `startFrame` values correct
- [ ] Integration test: `render_video` produces a non-empty MP4 file from a 3-scene test project
- [ ] Edge cases:
  - Scene ID not found in `update_scene` / `delete_scene`
  - `durationSeconds` missing when `durationMode = "manual"`
  - Timestamp JSON malformed or missing fields
  - `start_preview` called when port 3000 is already in use
  - Asset file referenced in scene props does not exist in `assets/`
  - `render_video` called before `init_project` (project path invalid)

---

## Rollout & Deployment

### MCP Server Config (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "remotion-video": {
      "command": "node",
      "args": ["/absolute/path/to/remotion-video-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

### MCP Server Config (Claude CLI)

Use `claude mcp add` (recommended) or manually add to your Claude config:
```json
{
  "remotion-video": {
    "command": "node",
    "args": ["/absolute/path/to/remotion-video-mcp/dist/index.js"]
  }
}
```

### Build Process

```bash
npm install
npm run build        # tsc → compiles src/ to dist/
# dist/index.js is the entry point pointed to in MCP config
```

No feature flags. No migrations. The server is stateless — restarting it has no side effects. Existing `composition.json` files in user projects are read fresh on each tool call.

### Rollback Plan

Since the MCP server doesn't own any persistent service infrastructure, rollback is trivial: point the MCP config `args` to the previous `dist/index.js` build. User projects (Remotion projects in their CWD) are unaffected by server version changes.

---

## Dependencies

### MCP Server `package.json`

```json
{
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0",
    "zod": "^3.24.0",
    "fs-extra": "^11.0.0",
    "execa": "^9.0.0",
    "glob": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/fs-extra": "^11.0.0"
  }
}
```

**Notes:**
- `@modelcontextprotocol/server` — MCP SDK v2 package (NOT `@modelcontextprotocol/sdk` which is v1). Provides `McpServer`, `StdioServerTransport`, `server.registerTool()`.
- `zod/v4` import path — required for MCP SDK v2; schemas must use `z.object()` wrappers (not raw shapes)
- `execa` v9 — ESM-only since v6; the last CJS version was v5.1.1. Project uses `"type": "module"` to support it.
- `glob` v10 — supports both ESM and CJS

### Scaffolded Remotion Project `package.json`

```json
{
  "dependencies": {
    "remotion": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "@remotion/media": "^4.0.0",
    "@remotion/fonts": "^4.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  }
}
```

**Notes:**
- `@remotion/media` — required for `<Audio>` import in Remotion v4 (confirmed via Context7: `import { Audio } from '@remotion/media'`)
- `@remotion/fonts` — required for custom font loading in template components
- `@remotion/player` — intentionally excluded; it is for embedding the player in web apps, not needed for CLI-based rendering
- `staticFile()` is still imported from `remotion` core
- `spring`, `interpolate`, `useCurrentFrame`, `useVideoConfig`, `AbsoluteFill`, `Series`, `Composition` — all from `remotion` core (confirmed via Context7)
- Using `^4.0.0` (caret) to get patch updates. All Remotion packages must be the same version.

---

## Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| `execa` v8 ESM-only breaks CommonJS MCP server setup | High | Medium | Configure `tsconfig.json` with `"module": "Node16"` and `"type": "module"` in `package.json`; alternatively pin `execa` to v7 (CJS compatible) |
| `npx remotion studio` port 3000 already in use | Medium | Medium | Return clear error message with port info; v1 does not auto-find free port (out of scope) |
| Large video renders (60s+) cause process timeout or OOM | High | Low | Use `execa` streaming mode for render output; document memory requirements in README |
| Timestamp JSON from user doesn't match expected schema | Medium | Medium | `scan_assets` validates schema with Zod and returns actionable error if fields are missing or malformed |
| Remotion v4 API changes break template components | Medium | Low | Pin Remotion packages to exact `4.0.0` version in scaffolded `package.json.template` |
| `npm install` in `init_project` takes too long (large dep tree) | Low | Medium | Run with `--prefer-offline` flag if available; inform user via response message that install is in progress |
| Claude generates incorrect `startFrame` values if state reads stale data | High | Low | `project-state.ts` always reads `composition.json` from disk — no in-memory caching; `startFrame` is always recomputed on write |
| Scene `.tsx` file has syntax errors (fails to compile) | High | Medium | Validate generated TSX structure in `create_scene` before writing; return compile error if `npx tsc --noEmit` fails |

---

## Design Decisions

1. **`composition.json` is the single source of truth.** Scene files are generated FROM it. When `update_scene` is called, `composition.json` is updated first, then the `.tsx` file is regenerated. This means scene files are always a derived output, not a primary input.

2. **Full replacement, not diffs.** `update_scene` sends the complete scene definition. The tool replaces the entire scene entry and regenerates the file. This is simpler and more reliable than diffing TSX.

3. **Template components are pre-built, not AI-generated.** Claude selects a template and passes props/data. It does not write React code. The `"custom"` scene type with an `objects` array is the escape hatch for maximum flexibility without requiring code generation.

4. **Audio is the timeline master for narration mode.** For `audio.type = "narration"`, the total video duration and individual scene durations are computed from audio timestamps. Scene durations are never set independently when in narration mode.

5. **Hot reload is free.** Remotion Studio watches for file changes. When an MCP tool writes a new scene file, the browser preview updates automatically. No WebSocket or custom reload mechanism is needed.

6. **Each scene is a separate file.** Claude reads and writes one small file per edit, not the entire project. This reduces error surface and enables targeted iteration.

7. **The server is stateless between calls.** `composition.json` on disk is the sole persistent state. `project-state.ts` reads it fresh on every tool call. There is no in-memory cache that could diverge from disk.

8. **`<Audio>` comes from `@remotion/media`, not `remotion` core.** This is a Remotion v4 change. All template components that use audio must import from `@remotion/media`. `staticFile()` remains in `remotion` core.

---

## Open Questions — Resolved

- [x] **`capture_frame` base64 vs file path?** — **BOTH.** Return the file path AND base64 inline. Claude can "see" the rendered frame, analyze it visually, and make intelligent editing decisions (e.g., "the text is cut off, let me adjust the font size"). This makes the iterative editing loop much tighter — Claude understands what the user means and what to fix without the user having to describe it.
- [x] **`start_preview` detached vs attached?** — **ATTACHED (auto-kill).** The preview server dies when the Claude session ends. End users are likely non-developers who won't know how to find and kill orphan Node processes. Cleaner experience — if they want to preview again, they start a new conversation.
- [x] **`init_project` npm install sync vs background?** — **BACKGROUND.** Run `npm install` in the background and return immediately. Claude uses the wait time to ask the user clarifying questions about the video (style, duration, assets, etc.) — more efficient use of the conversation.
- [x] **Transitions: separate scenes vs in-scene overlays?** — **BOTH.** Support both approaches — sometimes a transition should be a separate wipe/fade entry between scenes, sometimes it should be an in-scene overlay animation. The choice depends on the type of video. Claude picks the appropriate approach per use case.

---

## References

- Remotion v4 docs: https://remotion.dev
- MCP TypeScript SDK docs: https://modelcontextprotocol.io
- MCP SDK v2 migration guide (registerTool + z.object()): confirmed via Context7 `/modelcontextprotocol/typescript-sdk`
- Remotion `<Audio>` from `@remotion/media`: confirmed via Context7 `/remotion-dev/remotion`
- Remotion `spring()` + `interpolate()` API: confirmed via Context7 `/remotion-dev/remotion`
- Remotion CLI render command flags: confirmed via Context7 `/remotion-dev/remotion`
- Source planning spec: `remotion-mcp-planning.md` (project root)
