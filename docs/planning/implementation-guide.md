# Implementation Guide: remotion-video-mcp MCP Server

**Version:** v1.0
**Status:** Complete
**Type:** Implementation Guide
**Created:** 2026-02-25
**Last Modified:** 2026-02-25

---

## Purpose of This Document

This is the step-by-step **HOW TO BUILD** guide for the `remotion-video-mcp` MCP server. It covers exact code patterns, file creation order, wiring conventions, and testing procedures.

Use Remotion v4 docs at https://remotion.dev for component APIs, rendering, and Studio

For the feature specification — what each tool does, input/output schemas, `composition.json` structure, and audio timestamp format — refer to the planning doc at `docs/planning/remotion-mcp-server.md`. This guide does not duplicate those details. It tells you how to implement them.

---

## What is MCP? (Brief Primer for New Developers)

MCP (Model Context Protocol) is an open protocol that lets AI models call external tools. Claude sends a tool call as JSON over **stdio**, and the MCP server reads it, executes logic, and writes a JSON response back to stdout. There is no HTTP server, no port, no REST — just a persistent Node.js process communicating over stdin/stdout.

```
Claude CLI/Desktop
      │
      │  JSON tool call (stdin)
      ▼
 MCP Server Process (node dist/index.js)
      │
      │  JSON response (stdout)
      ▼
Claude reads the result and continues the conversation
```

The server stays alive as a persistent process while Claude is running. Tool calls arrive one at a time. The MCP SDK handles JSON parsing, schema validation, and protocol framing — you only write the handler logic.

To learn more go to : https://modelcontextprotocol.io/

---

## 1. Prerequisites & Environment Setup

### Required

- **Node.js 18+** — MCP SDK and Remotion both require it. Verify with `node --version`.
- **npm 9+** — ships with Node 18. Verify with `npm --version`.
- **npx** — ships with npm. The server spawns `npx remotion studio/render/still` as child processes. Verify with `npx --version`.

### Recommended

- **TypeScript** globally installed for type checking: `npm install -g typescript`
- **ts-node** for rapid iteration (optional): `npm install -g ts-node`

No global MCP-specific tooling is needed. The SDK is an npm dependency, not a CLI.

---

## 2. Project Initialization

### 2.1 Initialize the npm Package

Run these commands inside the `remotion-video-mcp/` project root:

```bash
# The package.json already exists (project was git-initialized).
# Install all production dependencies:
npm install \
  @modelcontextprotocol/server \
  zod \
  fs-extra \
  execa \
  glob

# Install dev dependencies:
npm install --save-dev \
  typescript \
  @types/node \
  @types/fs-extra \
  tsx
```

**Dependency purpose table:**

| Package | Version | Role |
|---------|---------|------|
| `@modelcontextprotocol/server` | `^2.0.0` | MCP server framework — provides `McpServer`, `StdioServerTransport` |
| `zod` | `^3.24.0` (import as `zod/v4`) | Zod v4 sub-path is required by MCP SDK v2 for input schema validation |
| `fs-extra` | `^11.0.0` | Enhanced `fs` — `ensureDir`, `writeJson`, `readJson`, `copy`, `remove` |
| `execa` | `^9.0.0` | Promise-based child process spawner — ESM-only since v6, used for Remotion CLI processes |
| `glob` | `^10.0.0` | File pattern matching — used by `scan_assets` to find images/audio/fonts |
| `typescript` | `^5.0.0` | TypeScript compiler |
| `@types/node` | `^20.0.0` | Node.js type definitions |
| `@types/fs-extra` | `^11.0.0` | Type definitions for `fs-extra` |
| `tsx` | `^4.0.0` | Runs TypeScript directly (useful during development, not required in production) |

### 2.2 package.json Configuration

The final `package.json` should look like this:

```json
{
  "name": "remotion-video-mcp",
  "version": "1.0.0",
  "description": "MCP server bridging Claude and Remotion for programmatic video creation",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "dev:start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "start": "node dist/index.js"
  },
  "files": [
    "dist/",
    "src/templates/"
  ]
}
```

**Why `"type": "module"` (ESM)** — `execa` v6+ is ESM-only (the last CJS-compatible version is v5.1.1, which is 3+ years old with a different API). The MCP SDK v2, `glob`, and `fs-extra` all work with ESM. Going ESM avoids `ERR_REQUIRE_ESM` errors and aligns with the modern Node.js ecosystem. The tradeoff: all relative imports must include `.js` extensions (e.g., `'./server.js'`) and `__dirname` must be replaced with the `import.meta.url` pattern.

**Why `"files"` includes `src/templates/`** — Template `.tsx` files are NOT compiled — they are copied verbatim into user projects. They must be present in the installed package alongside `dist/`. If distributing via npm, listing `src/templates/` ensures these raw source files are included.

### 2.3 tsconfig.json

Create this file at the project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/templates"]
}
```

**Key decisions:**
- `"target": "ES2022"` — modern enough for async/await, top-level await, optional chaining; safe on Node 18+.
- `"module": "NodeNext"` + `"moduleResolution": "NodeNext"` — matches `"type": "module"` in `package.json`. TypeScript enforces `.js` extensions on relative imports, which is correct for ESM.
- `"exclude": ["src/templates"]` — template files are `.tsx` (React components). They are NOT compiled by this `tsconfig.json`. They are copied as-is into user projects where Remotion's own build tooling handles them.
- `"resolveJsonModule": true` — needed so `readJson` result types can flow cleanly.

### 2.4 Create the Directory Structure Manually

Before writing any code, create the full directory tree. Run this once:

```bash
mkdir -p src/tools
mkdir -p src/state
mkdir -p src/utils
mkdir -p src/templates/components
mkdir -p src/templates/utils
mkdir -p templates/project-scaffold
```

This gives you:

```
remotion-video-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    (create in Phase 1, Step 1)
│   ├── server.ts                   (create in Phase 1, Step 2)
│   ├── tools/
│   │   ├── start-session.ts        (Phase 1, Step 3)
│   │   ├── init-project.ts         (Phase 1, Step 6)
│   │   ├── list-scenes.ts          (Phase 1, Step 7)
│   │   ├── scan-assets.ts          (Phase 3)
│   │   ├── create-scene.ts         (Phase 2)
│   │   ├── update-scene.ts         (Phase 2)
│   │   ├── delete-scene.ts         (Phase 2)
│   │   ├── reorder-scenes.ts       (Phase 2)
│   │   ├── update-composition.ts   (Phase 2)
│   │   ├── start-preview.ts        (Phase 4)
│   │   ├── stop-preview.ts         (Phase 4)
│   │   ├── capture-frame.ts        (Phase 4)
│   │   └── render-video.ts         (Phase 4)
│   ├── state/
│   │   └── project-state.ts        (Phase 1, Step 4)
│   ├── templates/                  (Remotion components — copied into user projects)
│   │   ├── (Root.tsx is NOT here — always generated by file-ops.ts)
│   │   ├── SceneRenderer.tsx
│   │   ├── components/
│   │   │   ├── TitleCard.tsx
│   │   │   ├── TextScene.tsx
│   │   │   ├── ImageScene.tsx
│   │   │   ├── TextWithImage.tsx
│   │   │   ├── KineticTypography.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── TransitionWipe.tsx
│   │   │   └── AnimatedObject.tsx
│   │   └── utils/
│   │       ├── animations.ts
│   │       ├── colors.ts
│   │       └── fonts.ts
│   └── utils/
│       ├── file-ops.ts             (Phase 1, Step 5)
│       ├── process-manager.ts      (Phase 4)
│       └── audio-utils.ts          (Phase 3)
└── templates/
    └── project-scaffold/
        ├── package.json.template
        ├── tsconfig.json.template
        └── remotion.config.ts.template
```

---

## 3. Folder Structure — File by File

### 3.1 MCP Server Files (`src/`)

These are compiled TypeScript files that run as the server process.

| File | What it does | Key imports |
|------|-------------|-------------|
| `src/index.ts` | Entry point. Creates `McpServer`, imports `setupServer`, connects `StdioServerTransport`. | `@modelcontextprotocol/server`, `./server` |
| `src/server.ts` | Calls every `register*` function to attach all 13 tools to the server instance. | All files in `src/tools/`, `McpServer` type |
| `src/tools/start-session.ts` | Registers `start_session` tool. Returns hardcoded onboarding JSON. No file I/O. | `zod/v4`, `McpServer` type |
| `src/tools/init-project.ts` | Registers `init_project` tool. Scaffolds folder tree, writes templates, writes initial `composition.json`, runs `npm install`. | `zod/v4`, `fs-extra`, `execa`, `../utils/file-ops`, `../state/project-state` |
| `src/tools/list-scenes.ts` | Registers `list_scenes` tool. Reads `composition.json` and returns scenes + computed total duration. | `zod/v4`, `../state/project-state` |
| `src/tools/scan-assets.ts` | Registers `scan_assets` tool. Uses `glob` to find assets, parses image dimensions, reads timestamp JSON. | `zod/v4`, `glob`, `fs-extra`, `../utils/audio-utils` |
| `src/tools/create-scene.ts` | Registers `create_scene` tool. Writes `.tsx`, mutates `composition.json`, recalculates `startFrame`. | `zod/v4`, `../state/project-state`, `../utils/file-ops` |
| `src/tools/update-scene.ts` | Registers `update_scene` tool. Same as `create_scene` but replaces existing scene entry. | Same as `create-scene.ts` |
| `src/tools/delete-scene.ts` | Registers `delete_scene` tool. Removes `.tsx`, splices scene from array, recalculates `startFrame`. | `zod/v4`, `../state/project-state`, `fs-extra` |
| `src/tools/reorder-scenes.ts` | Registers `reorder_scenes` tool. Re-sorts scenes array, recalculates `startFrame`. | `zod/v4`, `../state/project-state` |
| `src/tools/update-composition.ts` | Registers `update_composition` tool. Patches top-level `composition.json` fields. | `zod/v4`, `../state/project-state` |
| `src/tools/start-preview.ts` | Registers `start_preview` tool. Spawns `npx remotion studio` via `execa`. | `zod/v4`, `execa`, `../utils/process-manager` |
| `src/tools/stop-preview.ts` | Registers `stop_preview` tool. Kills the tracked PID. | `zod/v4`, `../utils/process-manager` |
| `src/tools/capture-frame.ts` | Registers `capture_frame` tool. Runs `npx remotion still` and returns output path. | `zod/v4`, `execa`, `fs-extra` |
| `src/tools/render-video.ts` | Registers `render_video` tool. Runs `npx remotion render` and waits for completion. | `zod/v4`, `execa`, `path` |
| `src/state/project-state.ts` | `readComposition(projectPath)` and `writeComposition(projectPath, data)`. Pure disk I/O — no in-memory cache. | `fs-extra`, `path` |
| `src/utils/file-ops.ts` | Helpers: `ensureProjectDirs(projectPath)`, `writeSceneFile(projectPath, scene)`, `regenerateRootTsx(projectPath, composition)`. | `fs-extra`, `path` |
| `src/utils/process-manager.ts` | Tracks running processes by project path. `startProcess`, `stopProcess`, `stopAllProcesses`, `isRunning`. | `execa`, a `Map<string, ResultPromise>` (execa v9+ type) |
| `src/utils/audio-utils.ts` | `parseTimestampFile(filePath)`, `segmentToDurationFrames(segment, fps)`. | `fs-extra` |

### 3.2 Template Files (`src/templates/`)

These are `.tsx` React components that get **copied verbatim** into user projects. They are NOT compiled by the server's `tsconfig.json`. They use Remotion APIs and must contain valid JSX.

| File | Destination in user project | Purpose |
|------|-----------------------------|---------|
| `src/templates/SceneRenderer.tsx` | `{project}/src/SceneRenderer.tsx` | Maps `scene.type` string to the correct template component. Copied once during `init_project`, never regenerated. |
| *(Root.tsx is NOT a template)* | `{project}/src/Root.tsx` | **Always generated dynamically** by `regenerateRootTsx()` in `file-ops.ts`. Never copied from templates. Contains static imports for each scene and `<Series>` stitching. |
| `src/templates/components/TitleCard.tsx` | `{project}/src/templates/TitleCard.tsx` | Full-screen title card with animated text entrance |
| `src/templates/components/TextScene.tsx` | `{project}/src/templates/TextScene.tsx` | Text body / bullet list with fade or word-by-word entrance |
| `src/templates/components/ImageScene.tsx` | `{project}/src/templates/ImageScene.tsx` | Full-frame image with Ken Burns and optional text overlay |
| `src/templates/components/TextWithImage.tsx` | `{project}/src/templates/TextWithImage.tsx` | 50/50 split layout with side entrance animations |
| `src/templates/components/KineticTypography.tsx` | `{project}/src/templates/KineticTypography.tsx` | Per-word animated entrance, optionally synced to `audioWords` timestamps |
| `src/templates/components/CodeBlock.tsx` | `{project}/src/templates/CodeBlock.tsx` | Syntax-highlighted code with typewriter or line-by-line reveal |
| `src/templates/components/TransitionWipe.tsx` | `{project}/src/templates/TransitionWipe.tsx` | Standalone transition scene (wipe, dissolve, zoom) |
| `src/templates/components/AnimatedObject.tsx` | `{project}/src/templates/AnimatedObject.tsx` | Renders any object from the `objects[]` array in a `custom`-type scene |
| `src/templates/utils/animations.ts` | `{project}/src/utils/animations.ts` | `spring` and `interpolate` wrapper helpers |
| `src/templates/utils/colors.ts` | `{project}/src/utils/colors.ts` | Palette utilities using `style` block from `composition.json` |
| `src/templates/utils/fonts.ts` | `{project}/src/utils/fonts.ts` | Font loading via `@remotion/fonts` |

### 3.3 Scaffold Templates (`templates/project-scaffold/`)

These are text templates for config files that get rendered and written during `init_project`. They are plain text files (not TypeScript) and use simple `{{placeholder}}` substitution.

| File | Produces | Placeholders |
|------|---------|-------------|
| `templates/project-scaffold/package.json.template` | `{project}/package.json` | `{{projectName}}` |
| `templates/project-scaffold/tsconfig.json.template` | `{project}/tsconfig.json` | (static) |
| `templates/project-scaffold/remotion.config.ts.template` | `{project}/remotion.config.ts` | (static) |

The scaffolded project's `package.json` must include Remotion v4 dependencies:

```json
{
  "name": "{{projectName}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "studio": "npx remotion studio",
    "render": "npx remotion render",
    "still": "npx remotion still"
  },
  "dependencies": {
    "remotion": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "@remotion/media": "^4.0.0",
    "@remotion/fonts": "^4.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
```

The scaffolded `tsconfig.json.template` must enable JSX for Remotion:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src", "scenes"],
  "exclude": ["node_modules"]
}
```

The `remotion.config.ts.template` is minimal:

```typescript
import { Config } from "@remotion/cli/config";

// "jpeg" = fastest render. Change to "png" if scenes need alpha transparency.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
```

---

## 4. Build Order — What to Implement First

### Phase 1: Foundation (implement in this exact order)

#### Step 1: `src/index.ts` — Entry Point

Create the simplest possible entry point first. This is the file Node.js runs.

```typescript
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import { setupServer } from './server.js';

async function main() {
  const server = new McpServer({
    name: 'remotion-video-mcp',
    version: '1.0.0',
  });

  // Register all tools onto the server instance
  setupServer(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the process alive — MCP server runs indefinitely
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch((err) => {
  // Write errors to stderr, not stdout — stdout is reserved for MCP protocol
  console.error('Server startup error:', err);
  process.exit(1);
});
```

**Why write to `stderr`, not `stdout`:** The MCP protocol uses stdout exclusively for JSON message framing. Any accidental `console.log()` to stdout corrupts the protocol stream and causes parsing errors in Claude. Always use `console.error()` for debug output.

#### Step 2: `src/server.ts` — Tool Registration Hub

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { registerStartSession } from './tools/start-session.js';
import { registerInitProject } from './tools/init-project.js';
import { registerListScenes } from './tools/list-scenes.js';
// Phase 2 imports added here as tools are built

export function setupServer(server: McpServer): void {
  registerStartSession(server);
  registerInitProject(server);
  registerListScenes(server);
  // Phase 2: registerCreateScene(server), etc.
}
```

This pattern — one `register*` import per tool file — keeps `server.ts` as a clean manifest of what the server exposes.

#### Step 3: `src/tools/start-session.ts` — First Tool (No File I/O)

Build this first because it has zero dependencies (no filesystem, no state), which lets you verify the full MCP wiring immediately.

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export function registerStartSession(server: McpServer): void {
  server.registerTool(
    'start_session',
    {
      title: 'Start Session',
      description: `ALWAYS call this tool FIRST before any other remotion tool when the user wants
to create a video. Returns a structured onboarding guide. Walk the user through
the questions conversationally (2-3 at a time). Do NOT call init_project until
you have all required information.`,
      inputSchema: z.object({
        workingDirectory: z.string().describe('The CWD where the project will be created'),
      }),
    },
    async ({ workingDirectory }) => {
      const result = {
        status: 'onboarding',
        workingDirectory,
        message: 'Welcome to Remotion Video Creator! Gather the following from the user.',
        required_questions: [
          {
            id: 'video_purpose',
            question: 'What is this video about? What is the goal?',
            examples: ['product launch', 'explainer', 'social ad', 'tutorial', 'lyric video'],
            why: 'Determines tone, pacing, and template selection',
          },
          {
            id: 'duration',
            question: 'How long should the video be?',
            options: ['15 seconds (social media)', '30 seconds', '60 seconds', '90 seconds', 'custom'],
            note: 'If user has narration audio with timestamps, duration is auto-calculated from audio length.',
            why: 'Sets totalDurationFrames or defers to audio length',
          },
          {
            id: 'audio_type',
            question: 'What about audio?',
            options: [
              'Voiceover with timestamp JSON (narration-driven)',
              'Voiceover without timestamps',
              'Background music only',
              'No audio',
            ],
            why: 'Determines durationMode, audio sync strategy, and Root.tsx audio components',
            follow_ups: {
              voiceover_with_timestamps: 'Place MP3 + timestamp JSON in assets/audio/. Video syncs to narration automatically. Duration calculated from audio.',
              voiceover_no_timestamps: 'You need word-level timestamps for sync. Tools like Whisper or AssemblyAI can generate these.',
              background_music: 'Place music in assets/audio/. It loops in background. Specify duration separately.',
              no_audio: 'Visual-only video. You specify the duration.',
            },
          },
          {
            id: 'assets_available',
            question: 'Do you have images, logos, screenshots, or other visual assets to include?',
            follow_up: 'If yes, place them in assets/images/ after project setup, then scan with scan_assets.',
            why: 'Determines if scan_assets should be called after init_project',
          },
          {
            id: 'dimensions',
            question: 'What format/aspect ratio?',
            options: [
              '1920x1080 (landscape — YouTube, presentations)',
              '1080x1920 (vertical — TikTok, Reels, Shorts)',
              '1080x1080 (square — Instagram, social)',
            ],
            default: '1920x1080',
            why: 'Sets width/height in composition settings',
          },
          {
            id: 'visual_style',
            question: 'What visual style/vibe?',
            examples: ['clean/minimal', 'bold/energetic', 'dark/techy', 'corporate', 'playful', 'cinematic'],
            why: 'Determines color palette, animation speed, typography choices',
          },
        ],
        optional_questions: [
          { id: 'brand_colors', question: 'Any specific brand colors? (hex codes or color names)' },
          { id: 'font_preference', question: 'Any font preference?', default: 'Inter (clean modern sans-serif)' },
          { id: 'reference_style', question: 'Any reference videos or channels whose style you like?' },
          { id: 'text_content', question: 'Do you already have the text/script, or should I help write it?' },
        ],
        post_onboarding_instructions:
          'After gathering all answers: 1) Summarize video plan. 2) Ask for confirmation. 3) Call init_project. 4) If user has assets, call scan_assets. 5) Begin creating scenes.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
```

#### Step 4: `src/state/project-state.ts` — Disk State Manager

All tools that read or write composition data go through this module. It is intentionally stateless — reads and writes happen on every call with no caching.

```typescript
import fs from 'fs-extra';
import path from 'path';

// Composition shape — mirrors composition.json exactly
export interface Composition {
  version: string;
  metadata: {
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  settings: {
    width: number;
    height: number;
    fps: number;
    totalDurationFrames: number | null;
    backgroundColor: string;
  };
  style: {
    theme: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    headingFontFamily: string;
    defaultTextColor: string;
    defaultFontSize: number;
  };
  audio: {
    type: 'narration' | 'background' | 'none';
    narration?: Record<string, unknown>;
    backgroundMusic?: Record<string, unknown>;
  };
  scenes: Scene[];
}

export interface Scene {
  id: string;
  name: string;
  type: string;
  file: string;
  durationFrames: number;
  startFrame: number;
  audioSegmentIds?: string[];
  transition?: {
    in: { type: string; durationFrames?: number };
    out: { type: string; durationFrames?: number };
  };
  props?: Record<string, unknown>;
  objects?: unknown[];
}

const COMPOSITION_FILE = 'composition.json';

export async function readComposition(projectPath: string): Promise<Composition> {
  const filePath = path.join(projectPath, COMPOSITION_FILE);
  const data = await fs.readJson(filePath);
  return data as Composition;
}

export async function writeComposition(
  projectPath: string,
  data: Composition
): Promise<void> {
  const filePath = path.join(projectPath, COMPOSITION_FILE);
  // Update the timestamp on every write
  data.metadata.updatedAt = new Date().toISOString();
  await fs.writeJson(filePath, data, { spaces: 2 });
}

// Recalculate startFrame for every scene as the cumulative sum of preceding durations.
// This is called after any mutation to the scenes array (create, delete, reorder).
export function recalculateStartFrames(scenes: Scene[]): Scene[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const updated = { ...scene, startFrame: cursor };
    cursor += scene.durationFrames;
    return updated;
  });
}
```

#### Step 5: `src/utils/file-ops.ts` — File System Helpers

```typescript
import fs from 'fs-extra';
import path from 'path';
import type { Composition, Scene } from '../state/project-state.js';

// Validate that projectPath is a legitimate Remotion project directory.
// Call this at the top of every tool handler except start_session and init_project.
export async function validateProjectPath(projectPath: string): Promise<void> {
  const resolved = path.resolve(projectPath);
  // Reject paths with traversal components
  if (projectPath.includes('..')) {
    throw new Error(`Project path must not contain '..': ${projectPath}`);
  }
  // Reject obviously dangerous system paths
  const dangerous = ['/', '/usr', '/etc', '/var', '/tmp', '/bin', '/sbin'];
  if (dangerous.includes(resolved) || resolved === process.env.HOME) {
    throw new Error(`Refusing to operate on system directory: ${resolved}`);
  }
  // Verify composition.json exists (confirms this is an initialized project)
  const compositionPath = path.join(resolved, 'composition.json');
  if (!await fs.pathExists(compositionPath)) {
    throw new Error(
      `No composition.json found at ${resolved}. Did you run init_project first?`
    );
  }
}

// Create all directories needed for a new project
export async function ensureProjectDirs(projectPath: string): Promise<void> {
  const dirs = [
    'assets/images',
    'assets/audio',
    'assets/fonts',
    'scenes',
    'src/templates',
    'src/utils',
    'public',      // Remotion's staticFile() serves from public/
    'output',
  ];
  for (const dir of dirs) {
    await fs.ensureDir(path.join(projectPath, dir));
  }
  // .gitkeep files so empty dirs are committed
  const keepDirs = ['assets/images', 'assets/audio', 'assets/fonts', 'output'];
  for (const dir of keepDirs) {
    await fs.writeFile(path.join(projectPath, dir, '.gitkeep'), '');
  }
  // Symlink public/ subdirs to assets/ so staticFile() can find them.
  // On Windows, symlinks may require Admin/Developer Mode — fall back to copy.
  const assetDirs = ['images', 'audio', 'fonts'];
  for (const dir of assetDirs) {
    const target = path.join(projectPath, 'assets', dir);
    const link = path.join(projectPath, 'public', dir);
    if (!await fs.pathExists(link)) {
      try {
        await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        // Fallback: copy instead of symlink (user must re-copy after adding new assets)
        await fs.copy(target, link);
      }
    }
  }
}

// Copy template files from the MCP server's src/templates/ into the user project.
// NOTE: Root.tsx is NOT copied here — it is always generated by regenerateRootTsx().
// fs-extra's copy() copies the CONTENTS of the source dir into the dest dir (not the dir itself).
// Scene files in scenes/ import templates via '../src/templates/X' — this assumes scenes are one level deep.
export async function copyTemplates(
  projectPath: string,
  serverRoot: string
): Promise<void> {
  const templatesDir = path.join(serverRoot, 'src', 'templates');
  // SceneRenderer is copied once and never regenerated
  await fs.copy(
    path.join(templatesDir, 'SceneRenderer.tsx'),
    path.join(projectPath, 'src', 'SceneRenderer.tsx')
  );
  // Component templates: copies contents of components/ into src/templates/
  await fs.copy(
    path.join(templatesDir, 'components'),
    path.join(projectPath, 'src', 'templates')
  );
  // Utility helpers: copies contents of utils/ into src/utils/
  await fs.copy(
    path.join(templatesDir, 'utils'),
    path.join(projectPath, 'src', 'utils')
  );
}

// The server's own directory — used to locate src/templates/ at runtime.
// ESM does not have __dirname, so we derive it from import.meta.url.
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getServerRoot(): string {
  // __dirname points to dist/utils/ after compile; go up two levels to project root.
  // This assumes the package layout: {root}/dist/utils/file-ops.js and {root}/src/templates/.
  // If installed via npm, "files" in package.json ensures src/templates/ ships alongside dist/.
  const root = path.join(__dirname, '..', '..');
  return root;
}

// Generate a scene's .tsx file content from its composition.json entry
export function generateSceneTsx(scene: Scene, composition: Composition): string {
  const componentName = sceneIdToComponentName(scene.id);

  if (scene.type === 'custom') {
    // Custom scenes render objects via AnimatedObject
    return `import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedObject } from '../src/templates/AnimatedObject';

// Auto-generated from composition.json — do not edit directly
export const ${componentName}: React.FC = () => {
  const objects = ${JSON.stringify(scene.objects ?? [], null, 2)};
  const backgroundColor = ${JSON.stringify((scene.props as Record<string, unknown>)?.backgroundColor ?? '#000000')};

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {objects.map((obj: { id: string; [key: string]: unknown }) => (
        <AnimatedObject key={obj.id} object={obj} />
      ))}
    </AbsoluteFill>
  );
};
`;
  }

  // Named template types — pass props directly to the matching component
  const componentImport = sceneTypeToImport(scene.type);
  return `import React from 'react';
import { ${componentImport} } from '../src/templates/${componentImport}';

// Auto-generated from composition.json — do not edit directly
export const ${componentName}: React.FC = () => {
  const props = ${JSON.stringify(scene.props ?? {}, null, 2)};
  return <${componentImport} {...props} />;
};
`;
}

// Write a scene's .tsx file to the scenes/ directory
export async function writeSceneFile(
  projectPath: string,
  scene: Scene,
  composition: Composition
): Promise<void> {
  const filePath = path.join(projectPath, scene.file);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, generateSceneTsx(scene, composition));
}

// Regenerate Root.tsx from the current scenes array.
// Called after any scene mutation so the composition always reflects reality.
// This also wires up <Audio> components for narration and background music.
//
// CRITICAL — Audio Path Convention:
// All file paths stored in composition.json (audio.narration.file, audio.backgroundMusic.file,
// and scene object src fields) MUST be relative to public/, NOT assets/.
//   Correct: "audio/voiceover.mp3"  →  staticFile('audio/voiceover.mp3')  →  public/audio/voiceover.mp3
//   Wrong:   "assets/audio/voiceover.mp3"  →  looks for public/assets/audio/voiceover.mp3 (does not exist)
// The planning doc's composition.json example uses the wrong format ("assets/audio/...").
// Follow this implementation guide's convention instead.
//
// NOTE on architecture: The planning doc (remotion-mcp-planning.md) shows a dynamic Root.tsx
// that imports composition.json and uses SceneRenderer to dispatch scene types at runtime.
// That is pseudocode for illustration. The actual implementation uses static per-scene imports
// generated below. SceneRenderer.tsx is copied for advanced users but is NOT used in generated code.
export async function regenerateRootTsx(
  projectPath: string,
  composition: Composition
): Promise<void> {
  const { settings, scenes, audio } = composition;
  // Guard against zero-duration composition (happens after init_project before any scenes exist)
  // Remotion rejects durationInFrames: 0, so default to 1 as a placeholder
  const totalFrames =
    settings.totalDurationFrames ??
    scenes.reduce((sum, s) => sum + s.durationFrames, 0) || 1;

  const sceneImports = scenes
    .map((s) => {
      const name = sceneIdToComponentName(s.id);
      return `import { ${name} } from '../scenes/${path.basename(s.file, '.tsx')}';`;
    })
    .join('\n');

  const seriesEntries = scenes
    .map((s) => {
      const name = sceneIdToComponentName(s.id);
      return `      <Series.Sequence durationInFrames={${s.durationFrames}}>\n        <${name} />\n      </Series.Sequence>`;
    })
    .join('\n');

  // Build audio JSX based on composition.json audio config.
  // <Audio> is imported from @remotion/media (NOT from 'remotion').
  // IMPORTANT: staticFile() resolves from public/, and public/audio/ is symlinked to assets/audio/.
  // So composition.json stores paths like "audio/voiceover.mp3" (relative to public/), NOT "assets/audio/...".
  const hasAudio = audio.type !== 'none';
  const audioImport = hasAudio ? `import { Audio } from '@remotion/media';\nimport { staticFile } from 'remotion';` : '';

  let audioJsx = '';
  if (audio.type === 'narration' && audio.narration) {
    const narrationFile = (audio.narration as Record<string, unknown>).file as string;
    audioJsx += `\n        {/* Narration audio — synced to scene timeline */}\n        <Audio src={staticFile('${narrationFile}')} />`;
  }
  if (audio.backgroundMusic) {
    const bgMusic = audio.backgroundMusic as Record<string, unknown>;
    const bgFile = bgMusic.file as string;
    const volume = bgMusic.volume ?? 0.15;
    const loop = bgMusic.loop ?? true;
    audioJsx += `\n        {/* Background music */}\n        <Audio\n          src={staticFile('${bgFile}')}\n          volume={${volume}}\n          loop={${loop}}\n        />`;
  }

  const rootContent = `import React from 'react';
import { Composition, Series } from 'remotion';
${hasAudio ? audioImport : ''}
${sceneImports}

// Auto-generated from composition.json — do not edit directly
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="main"
        component={MainComposition}
        durationInFrames={${totalFrames}}
        fps={${settings.fps}}
        width={${settings.width}}
        height={${settings.height}}
      />
    </>
  );
};

const MainComposition: React.FC = () => {
  return (
    <>
      <Series>
${seriesEntries}
      </Series>${audioJsx}
    </>
  );
};
`;

  await fs.writeFile(path.join(projectPath, 'src', 'Root.tsx'), rootContent);
}

// "scene-001" → "Scene001", "001-intro" → "Scene001Intro" (prefix added if starts with digit)
export function sceneIdToComponentName(sceneId: string): string {
  let result = sceneId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  // JSX component names must start with an uppercase letter, not a digit
  if (/^\d/.test(result)) result = 'Scene' + result;
  return result;
}

// "title-card" → "TitleCard"
function sceneTypeToImport(sceneType: string): string {
  return sceneType
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
```

#### Step 6: `src/tools/init-project.ts` — Project Scaffold Tool

This is the most complex Phase 1 tool. It reads scaffold templates, writes config files, copies Remotion template components, writes the initial `composition.json`, and runs `npm install`.

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  ensureProjectDirs,
  copyTemplates,
  getServerRoot,
  regenerateRootTsx,
} from '../utils/file-ops.js';
import { writeComposition } from '../state/project-state.js';
import type { Composition } from '../state/project-state.js';

export function registerInitProject(server: McpServer): void {
  server.registerTool(
    'init_project',
    {
      title: 'Initialize Project',
      description: `Scaffold a new Remotion video project. ONLY call after start_session onboarding
is complete. Creates directory tree, copies template components, writes
composition.json, and runs npm install.`,
      inputSchema: z.object({
        projectName: z.string().describe("Folder name in kebab-case, e.g. 'product-launch-video'"),
        workingDirectory: z.string().describe('Parent directory where project folder will be created'),
        title: z.string().describe('Human-readable video title'),
        width: z.number().optional().default(1920),
        height: z.number().optional().default(1080),
        fps: z.number().optional().default(30),
        durationMode: z.enum(['audio', 'manual']),
        durationSeconds: z.number().optional(),
        audioType: z.enum(['narration', 'background', 'none']),
        style: z
          .object({
            theme: z.string().optional(),
            primaryColor: z.string().optional(),
            secondaryColor: z.string().optional(),
            accentColor: z.string().optional(),
            fontFamily: z.string().optional(),
          })
          .optional(),
      }),
    },
    async (args) => {
      const projectPath = path.join(args.workingDirectory, args.projectName);

      try {
        // Guard against re-initializing an existing project
        if (await fs.pathExists(path.join(projectPath, 'composition.json'))) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                message: `Project already exists at ${projectPath}. Found existing composition.json.`,
                suggestion: 'Use update_composition or create_scene to modify the existing project.',
              }),
            }],
          };
        }

        // 1. Create all directories
        await ensureProjectDirs(projectPath);

        // 2. Copy template components from the MCP server package
        const serverRoot = getServerRoot();
        await copyTemplates(projectPath, serverRoot);

        // 3. Write package.json from scaffold template
        const packageTemplate = await fs.readFile(
          path.join(serverRoot, 'templates', 'project-scaffold', 'package.json.template'),
          'utf-8'
        );
        await fs.writeFile(
          path.join(projectPath, 'package.json'),
          packageTemplate.replace(/\{\{projectName\}\}/g, args.projectName)
        );

        // 4. Write tsconfig.json and remotion.config.ts from scaffold templates
        await fs.copy(
          path.join(serverRoot, 'templates', 'project-scaffold', 'tsconfig.json.template'),
          path.join(projectPath, 'tsconfig.json')
        );
        await fs.copy(
          path.join(serverRoot, 'templates', 'project-scaffold', 'remotion.config.ts.template'),
          path.join(projectPath, 'remotion.config.ts')
        );

        // 5. Build initial composition.json
        const totalDurationFrames =
          args.durationMode === 'manual' && args.durationSeconds
            ? Math.ceil(args.durationSeconds * (args.fps ?? 30))
            : null;

        const composition: Composition = {
          version: '1.0',
          metadata: {
            title: args.title,
            description: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          settings: {
            width: args.width ?? 1920,
            height: args.height ?? 1080,
            fps: args.fps ?? 30,
            totalDurationFrames,
            backgroundColor: '#000000',
          },
          style: {
            theme: args.style?.theme ?? 'minimal',
            primaryColor: args.style?.primaryColor ?? '#2563EB',
            secondaryColor: args.style?.secondaryColor ?? '#1E293B',
            accentColor: args.style?.accentColor ?? '#F59E0B',
            fontFamily: args.style?.fontFamily ?? 'Inter',
            headingFontFamily: args.style?.fontFamily ?? 'Inter',
            defaultTextColor: '#FFFFFF',
            defaultFontSize: 48,
          },
          audio: {
            type: args.audioType,
          },
          scenes: [],
        };

        await writeComposition(projectPath, composition);

        // 6. Generate an initial empty Root.tsx
        await regenerateRootTsx(projectPath, composition);

        // 6b. Write src/index.ts — Remotion entry point
        // Remotion v4 auto-discovers the root component from src/index.ts.
        // Without this file, `npx remotion studio` may fail with "No composition found".
        await fs.writeFile(
          path.join(projectPath, 'src', 'index.ts'),
          `// Remotion entry point — re-exports the root composition\n// Remotion auto-discovers this file and registers all <Composition> elements\nexport { RemotionRoot } from './Root';\n`
        );

        // 7. Run npm install with a 2-minute timeout to avoid hanging on slow networks
        try {
          await execa('npm', ['install'], {
            cwd: projectPath,
            stdio: 'pipe',
            timeout: 120_000,
          });
        } catch (installErr) {
          const installError = installErr as Error;
          if (installError.message.includes('timed out')) {
            throw new Error(
              `npm install timed out after 2 minutes. Run 'cd ${projectPath} && npm install' manually.`
            );
          }
          throw installError;
        }

        const result = {
          status: 'success',
          projectPath,
          message: `Project '${args.projectName}' scaffolded and dependencies installed.`,
          next_steps: 'Place assets in assets/ then call scan_assets, or call create_scene directly.',
          structure_created: [
            'assets/images/', 'assets/audio/', 'assets/fonts/',
            'scenes/', 'src/', 'public/', 'output/',
            'composition.json', 'package.json', 'tsconfig.json', 'remotion.config.ts',
            'src/index.ts', 'src/Root.tsx',
          ],
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Check that workingDirectory exists and you have write permissions.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Step 7: `src/tools/list-scenes.ts` — Read-Only Scene Query

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readComposition } from '../state/project-state.js';
import { validateProjectPath } from '../utils/file-ops.js';

export function registerListScenes(server: McpServer): void {
  server.registerTool(
    'list_scenes',
    {
      title: 'List Scenes',
      description: 'Returns the current scenes array from composition.json with computed total duration. Call this whenever you need a snapshot of the current video state.',
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);
        const { scenes, settings } = composition;
        const totalFrames = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

        const result = {
          status: 'success',
          scenes,
          totalFrames,
          totalSeconds: totalFrames / settings.fps,
          fps: settings.fps,
          sceneCount: scenes.length,
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Verify projectPath points to a valid project with composition.json.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Step 8: Build and Test Phase 1

```bash
# Compile TypeScript
npm run build

# The server should start with no errors when run directly
node dist/index.js
# Expected: silence (server waiting on stdin) — press Ctrl+C to exit
```

If `node dist/index.js` exits immediately or throws, there is a wiring error — check the import paths. The server should block indefinitely waiting for MCP messages.

---

### Phase 2: Scene Management Tools

Implement in this order (each depends on `project-state.ts` and `file-ops.ts` from Phase 1):

1. `src/tools/create-scene.ts` — Write `.tsx`, mutate `composition.json`, recalculate `startFrame`, regenerate `Root.tsx`
2. `src/tools/update-scene.ts` — Same as create but find-and-replace existing scene entry
3. `src/tools/delete-scene.ts` — Remove `.tsx`, splice scene, recalculate, regenerate `Root.tsx`
4. `src/tools/reorder-scenes.ts` — Re-sort by provided ID order, recalculate, regenerate `Root.tsx`
5. `src/tools/update-composition.ts` — Shallow-merge top-level fields only (settings, style, audio, metadata)

For full input schemas and response formats for each tool, refer to `docs/planning/remotion-mcp-server.md` — Tools 4–9.

After each tool is written, add its `register*` import and call to `src/server.ts`.

#### Skeleton: `src/tools/create-scene.ts` (most complex Phase 2 tool)

This establishes the mutation pattern that `update-scene`, `delete-scene`, and `reorder-scenes` all follow:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import type { Scene } from '../state/project-state.js';
import { validateProjectPath, writeSceneFile, regenerateRootTsx, sceneIdToComponentName } from '../utils/file-ops.js';

export function registerCreateScene(server: McpServer): void {
  server.registerTool(
    'create_scene',
    {
      title: 'Create Scene',
      description: `Create a new scene file in scenes/ and register it in composition.json.
For narration-driven videos, set durationFrames from audio segment timing:
  durationFrames = Math.ceil((segmentEndTime - segmentStartTime) * fps)
After creating, remind the user to check the preview.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe("Unique scene ID, e.g. 'scene-001'"),
        sceneName: z.string().describe("Human-readable name, e.g. 'intro'"),
        sceneType: z.enum([
          'title-card', 'text-scene', 'image-scene', 'text-with-image',
          'kinetic-typography', 'code-block', 'transition-wipe', 'custom',
        ]),
        durationFrames: z.number().describe('Duration in frames. At 30fps: 30=1sec, 90=3sec'),
        audioSegmentIds: z.array(z.string()).optional(),
        transition: z.object({
          in: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
          out: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
        }).optional(),
        props: z.record(z.unknown()).optional(),
        objects: z.array(z.record(z.unknown())).optional(),
      }),
    },
    async (args) => {
      try {
        // Validate project exists
        await validateProjectPath(args.projectPath);

        // 1. Read fresh state from disk
        const composition = await readComposition(args.projectPath);

        // 2. Check for duplicate scene ID
        if (composition.scenes.find(s => s.id === args.sceneId)) {
          throw new Error(`Scene '${args.sceneId}' already exists. Use update_scene to modify it.`);
        }

        // 3. Check for component name collision (e.g. "scene-001" and "scene001" both → "Scene001")
        const newComponentName = sceneIdToComponentName(args.sceneId);
        const existingNames = composition.scenes.map(s => sceneIdToComponentName(s.id));
        if (existingNames.includes(newComponentName)) {
          throw new Error(`Scene ID '${args.sceneId}' produces component name '${newComponentName}' which collides with an existing scene.`);
        }

        // 4. Build the new scene entry
        const newScene: Scene = {
          id: args.sceneId,
          name: args.sceneName,
          type: args.sceneType,
          file: `scenes/${args.sceneId}-${args.sceneName}.tsx`,
          durationFrames: args.durationFrames,
          startFrame: 0, // placeholder — recalculated below
          audioSegmentIds: args.audioSegmentIds,
          transition: args.transition as Scene['transition'],
          props: args.props,
          objects: args.objects,
        };

        // 5. Append to scenes array
        composition.scenes.push(newScene);

        // 6. Recalculate ALL startFrame values
        composition.scenes = recalculateStartFrames(composition.scenes);

        // 7. Write back to disk
        await writeComposition(args.projectPath, composition);

        // 8. Generate the .tsx file
        const updatedScene = composition.scenes.find(s => s.id === args.sceneId)!;
        await writeSceneFile(args.projectPath, updatedScene, composition);

        // 9. Regenerate Root.tsx to include the new scene
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              sceneId: args.sceneId,
              file: newScene.file,
              durationFrames: args.durationFrames,
              totalScenes: composition.scenes.length,
              next_steps: 'Check the preview if running, or call start_preview to see the scene.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Ensure projectPath is valid and sceneId is unique.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Skeleton: `src/tools/update-scene.ts` (most-used tool during iteration)

This is the tool Claude calls most frequently. It replaces the entire scene entry and regenerates the file — no diffing.

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import type { Scene } from '../state/project-state.js';
import { validateProjectPath, writeSceneFile, regenerateRootTsx } from '../utils/file-ops.js';

export function registerUpdateScene(server: McpServer): void {
  server.registerTool(
    'update_scene',
    {
      title: 'Update Scene',
      description: `Modify an existing scene. Can update props, objects, animations, duration, or transitions.
Only modifies the specified scene. After updating, remind the user to check the preview.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe('ID of the scene to update'),
        // All fields below are optional — only specified fields are updated
        sceneName: z.string().optional(),
        sceneType: z.enum([
          'title-card', 'text-scene', 'image-scene', 'text-with-image',
          'kinetic-typography', 'code-block', 'transition-wipe', 'custom',
        ]).optional(),
        durationFrames: z.number().optional(),
        audioSegmentIds: z.array(z.string()).optional(),
        transition: z.object({
          in: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
          out: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
        }).optional(),
        props: z.record(z.unknown()).optional(),
        objects: z.array(z.record(z.unknown())).optional(),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Find the existing scene
        const sceneIndex = composition.scenes.findIndex(s => s.id === args.sceneId);
        if (sceneIndex === -1) {
          throw new Error(`Scene '${args.sceneId}' not found. Use list_scenes to see available scenes.`);
        }

        // Merge updates into the existing scene entry (full replacement for provided fields)
        const existing = composition.scenes[sceneIndex];
        const updated: Scene = {
          ...existing,
          ...(args.sceneName !== undefined && { name: args.sceneName }),
          ...(args.sceneType !== undefined && { type: args.sceneType }),
          ...(args.durationFrames !== undefined && { durationFrames: args.durationFrames }),
          ...(args.audioSegmentIds !== undefined && { audioSegmentIds: args.audioSegmentIds }),
          ...(args.transition !== undefined && { transition: args.transition as Scene['transition'] }),
          ...(args.props !== undefined && { props: args.props }),
          ...(args.objects !== undefined && { objects: args.objects }),
        };

        // Update the file path if name changed
        if (args.sceneName !== undefined && args.sceneName !== existing.name) {
          updated.file = `scenes/${args.sceneId}-${args.sceneName}.tsx`;
          // Delete the old file
          const oldPath = path.join(args.projectPath, existing.file);
          if (await fs.pathExists(oldPath)) await fs.remove(oldPath);
        }

        composition.scenes[sceneIndex] = updated;

        // Recalculate if duration changed
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(args.projectPath, composition);
        await writeSceneFile(args.projectPath, updated, composition);
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              sceneId: args.sceneId,
              file: updated.file,
              durationFrames: updated.durationFrames,
              next_steps: 'Check the preview — it should update automatically.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Verify sceneId exists with list_scenes.',
            }),
          }],
        };
      }
    }
  );
}
```

Note: `update-scene.ts` needs these additional imports at the top:
```typescript
import fs from 'fs-extra';
import path from 'path';
```

#### Skeleton: `src/tools/delete-scene.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerDeleteScene(server: McpServer): void {
  server.registerTool(
    'delete_scene',
    {
      title: 'Delete Scene',
      description: `Delete a scene. Removes the .tsx file, removes the entry from composition.json,
recalculates startFrame for all subsequent scenes, and updates Root.tsx.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe('ID of the scene to delete'),
      }),
    },
    async ({ projectPath, sceneId }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);

        const sceneIndex = composition.scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) {
          throw new Error(`Scene '${sceneId}' not found. Use list_scenes to see available scenes.`);
        }

        // Remove the .tsx file from disk
        const sceneFile = composition.scenes[sceneIndex].file;
        const filePath = path.join(projectPath, sceneFile);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }

        // Splice the scene from the array
        composition.scenes.splice(sceneIndex, 1);

        // Recalculate startFrames for remaining scenes
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(projectPath, composition);
        await regenerateRootTsx(projectPath, composition);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              deletedSceneId: sceneId,
              deletedFile: sceneFile,
              remainingScenes: composition.scenes.length,
              next_steps: 'Scene removed. Check the preview to verify.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Verify sceneId exists with list_scenes.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Skeleton: `src/tools/reorder-scenes.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerReorderScenes(server: McpServer): void {
  server.registerTool(
    'reorder_scenes',
    {
      title: 'Reorder Scenes',
      description: 'Change the order of scenes. Provide the new order as an array of scene IDs. Recalculates all startFrame values and regenerates Root.tsx.',
      inputSchema: z.object({
        projectPath: z.string(),
        sceneOrder: z.array(z.string()).describe('Ordered array of scene IDs in desired sequence'),
      }),
    },
    async ({ projectPath, sceneOrder }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);

        // Validate that all IDs exist and no IDs are missing
        const existingIds = new Set(composition.scenes.map(s => s.id));
        const newIds = new Set(sceneOrder);

        for (const id of sceneOrder) {
          if (!existingIds.has(id)) {
            throw new Error(`Scene '${id}' not found in composition.`);
          }
        }
        for (const id of existingIds) {
          if (!newIds.has(id)) {
            throw new Error(`Scene '${id}' is missing from the new order. All scenes must be included.`);
          }
        }
        if (sceneOrder.length !== composition.scenes.length) {
          throw new Error(`Expected ${composition.scenes.length} scene IDs, got ${sceneOrder.length}.`);
        }

        // Reorder scenes by mapping IDs to their scene objects
        const sceneMap = new Map(composition.scenes.map(s => [s.id, s]));
        composition.scenes = sceneOrder.map(id => sceneMap.get(id)!);

        // Recalculate all startFrames
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(projectPath, composition);
        await regenerateRootTsx(projectPath, composition);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              newOrder: sceneOrder,
              scenes: composition.scenes.map(s => ({ id: s.id, name: s.name, startFrame: s.startFrame })),
              next_steps: 'Scenes reordered. Check the preview to verify the new sequence.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Use list_scenes to get current scene IDs, then provide ALL IDs in the desired order.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Skeleton: `src/tools/update-composition.ts` (global settings tool)

This tool patches top-level composition.json fields without touching individual scenes. It's how you change the theme, swap audio config, or change resolution after initial setup.

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readComposition, writeComposition } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerUpdateComposition(server: McpServer): void {
  server.registerTool(
    'update_composition',
    {
      title: 'Update Composition',
      description: `Update global composition settings — style, audio config, dimensions, fps, etc.
Does NOT modify individual scenes (use update_scene for that).
Use this for changing the overall theme, swapping audio, or changing resolution.`,
      inputSchema: z.object({
        projectPath: z.string(),
        settings: z.object({
          width: z.number().optional(),
          height: z.number().optional(),
          fps: z.number().optional(),
          totalDurationFrames: z.number().nullable().optional(),
          backgroundColor: z.string().optional(),
        }).optional(),
        style: z.object({
          theme: z.string().optional(),
          primaryColor: z.string().optional(),
          secondaryColor: z.string().optional(),
          accentColor: z.string().optional(),
          fontFamily: z.string().optional(),
          headingFontFamily: z.string().optional(),
          defaultTextColor: z.string().optional(),
          defaultFontSize: z.number().optional(),
        }).optional(),
        audio: z.object({
          type: z.enum(['narration', 'background', 'none']).optional(),
          narration: z.record(z.unknown()).optional(),
          backgroundMusic: z.record(z.unknown()).optional(),
        }).optional(),
        metadata: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
        }).optional(),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Shallow-merge each top-level section
        if (args.settings) {
          composition.settings = { ...composition.settings, ...args.settings };
        }
        if (args.style) {
          composition.style = { ...composition.style, ...args.style };
        }
        if (args.audio) {
          composition.audio = { ...composition.audio, ...args.audio };
        }
        if (args.metadata) {
          composition.metadata = { ...composition.metadata, ...args.metadata };
        }

        await writeComposition(args.projectPath, composition);
        // Regenerate Root.tsx in case dimensions, fps, or audio changed
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: 'Composition settings updated.',
              updatedSections: [
                args.settings && 'settings',
                args.style && 'style',
                args.audio && 'audio',
                args.metadata && 'metadata',
              ].filter(Boolean),
              next_steps: 'Check the preview to see global changes applied.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Verify projectPath and check composition.json is valid.',
            }),
          }],
        };
      }
    }
  );
}
```

---

### Phase 3: Asset Scanning and Audio Utils

1. `src/utils/audio-utils.ts` — `parseTimestampFile(filePath)` and `segmentToDurationFrames(segment, fps)`
2. `src/tools/scan-assets.ts` — Uses `glob` to find files, `image-size` or `sharp` (optional) for image dimensions, `audio-utils` for timestamps

For tool spec, refer to `docs/planning/remotion-mcp-server.md` — Tool 3.

#### Skeleton: `src/utils/audio-utils.ts`

```typescript
import fs from 'fs-extra';

export interface AudioSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface TimestampData {
  type: string;
  speaker: string;
  totalDuration: number;
  segments: AudioSegment[];
}

// Parse a timestamp JSON file (Whisper/AssemblyAI format)
export async function parseTimestampFile(filePath: string): Promise<TimestampData> {
  const data = await fs.readJson(filePath);
  // Basic validation
  if (!data.segments || !Array.isArray(data.segments)) {
    throw new Error(`Invalid timestamp file: missing 'segments' array in ${filePath}`);
  }
  return data as TimestampData;
}

// Calculate frame duration from an audio segment
export function segmentToDurationFrames(segment: AudioSegment, fps: number): number {
  return Math.ceil((segment.endTime - segment.startTime) * fps);
}
```

#### Skeleton: `src/tools/scan-assets.ts`

This tool scans the user's `assets/` directory and returns a structured inventory. Claude uses the results to plan scenes — e.g., matching images to narration segments.

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { validateProjectPath } from '../utils/file-ops.js';
import { parseTimestampFile } from '../utils/audio-utils.js';

export function registerScanAssets(server: McpServer): void {
  server.registerTool(
    'scan_assets',
    {
      title: 'Scan Assets',
      description: `Scan the assets folder and analyze all files.
Call this whenever the user says they've added files to assets/.
For images: returns file names, dimensions (if detectable), and sizes.
For audio: parses timestamp JSON files and returns segment info.
For fonts: lists available custom font files.
After scanning, present a summary and propose how assets could be used.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);

        const assetsDir = path.join(projectPath, 'assets');

        // Scan images
        const imageFiles = await glob('images/**/*.{png,jpg,jpeg,gif,svg,webp}', { cwd: assetsDir });
        const images = await Promise.all(
          imageFiles.map(async (file) => {
            const fullPath = path.join(assetsDir, file);
            const stat = await fs.stat(fullPath);
            return {
              filename: path.basename(file),
              path: `assets/${file}`,         // for user display ("your file is here")
              publicPath: file,               // for staticFile() and composition.json
              sizeKB: Math.round(stat.size / 1024),
              format: path.extname(file).slice(1),
            };
          })
        );

        // Scan audio files
        const audioFiles = await glob('audio/**/*.{mp3,wav,ogg,m4a,json}', { cwd: assetsDir });
        const audio = [];
        for (const file of audioFiles) {
          const fullPath = path.join(assetsDir, file);
          const stat = await fs.stat(fullPath);
          const ext = path.extname(file).slice(1);

          if (ext === 'json') {
            // Parse as timestamp file
            try {
              const timestamps = await parseTimestampFile(fullPath);
              audio.push({
                filename: path.basename(file),
                path: `assets/${file}`,
                publicPath: file,             // for staticFile() and composition.json
                type: 'timestamps',
                segmentCount: timestamps.segments.length,
                totalDuration: timestamps.totalDuration,
                segments: timestamps.segments,
              });
            } catch {
              // Not a valid timestamp file — just list it
              audio.push({
                filename: path.basename(file),
                path: `assets/${file}`,
                publicPath: file,
                type: 'unknown-json',
                sizeKB: Math.round(stat.size / 1024),
              });
            }
          } else {
            audio.push({
              filename: path.basename(file),
              path: `assets/${file}`,
              publicPath: file,               // for staticFile() and composition.json
              format: ext,
              sizeKB: Math.round(stat.size / 1024),
            });
          }
        }

        // Scan fonts
        const fontFiles = await glob('fonts/**/*.{ttf,otf,woff,woff2}', { cwd: assetsDir });
        const fonts = fontFiles.map((file) => ({
          filename: path.basename(file),
          path: `assets/${file}`,
          publicPath: file,                   // for staticFile() and composition.json
        }));

        const result = {
          status: 'success',
          assets: { images, audio, fonts },
          summary: {
            imageCount: images.length,
            audioFileCount: audio.length,
            fontCount: fonts.length,
          },
          instructions_for_claude:
            'Present a summary of all assets. For narration audio, explain segment count and duration. Propose a scene plan based on available assets and narration segments.',
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Ensure projectPath is valid and assets/ directory exists.',
            }),
          }],
        };
      }
    }
  );
}
```

---

### Phase 4: Preview and Render

1. `src/utils/process-manager.ts` — Process tracking map (**see Section 8 for the full implementation skeleton**)
2. `src/tools/start-preview.ts` — Spawns Remotion Studio
3. `src/tools/stop-preview.ts` — Kills process by project path key
4. `src/tools/capture-frame.ts` — Runs `npx remotion still`
5. `src/tools/render-video.ts` — Runs `npx remotion render`

For tool specs, refer to `docs/planning/remotion-mcp-server.md` — Tools 10–13.

> **Build order note:** Implement `process-manager.ts` first (Step 1) before any Phase 4 tools — `start-preview.ts` and `stop-preview.ts` both import from it. The full `process-manager.ts` skeleton is in **Section 8: Process Management** below. Copy that skeleton into `src/utils/process-manager.ts` as the first step of this phase.

> **Phase placement note:** The planning doc (`remotion-mcp-planning.md`) places `update_composition` in Phase 4, but it is implemented in Phase 2 (above) because scene-creation and audio-wiring workflows benefit from early access to global settings updates.

#### Skeleton: `src/tools/start-preview.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { validateProjectPath } from '../utils/file-ops.js';
import { startProcess, isRunning } from '../utils/process-manager.js';

export function registerStartPreview(server: McpServer): void {
  server.registerTool(
    'start_preview',
    {
      title: 'Start Preview',
      description: `Start the Remotion Studio dev server for live preview.
Launches 'npx remotion studio' in the project directory.
The preview auto-reloads when scene files change.
Tell the user to open the URL in their browser.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);

        if (isRunning(projectPath)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'already_running',
                message: 'Preview server is already running.',
                suggestion: 'Open http://localhost:3000 in your browser.',
              }),
            }],
          };
        }

        const { pid } = await startProcess(projectPath, 'npx', ['remotion', 'studio']);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'running',
              url: 'http://localhost:3000',
              pid,
              message: 'Remotion Studio is running. Open http://localhost:3000 to preview.',
              next_steps: 'Tell the user to open the URL. The preview auto-reloads on file changes.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Check that dependencies are installed (npm install) and no other process uses port 3000.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Skeleton: `src/tools/stop-preview.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { validateProjectPath } from '../utils/file-ops.js';
import { stopProcess, isRunning } from '../utils/process-manager.js';

export function registerStopPreview(server: McpServer): void {
  server.registerTool(
    'stop_preview',
    {
      title: 'Stop Preview',
      description: 'Stop the Remotion Studio dev server. Call this before render_video or when done previewing.',
      inputSchema: z.object({
        projectPath: z.string().describe('Path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);

        if (!isRunning(projectPath)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'not_running',
                message: 'No preview server is running for this project.',
              }),
            }],
          };
        }

        await stopProcess(projectPath);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'stopped',
              message: 'Preview server stopped.',
              next_steps: 'You can now call render_video to produce the final output.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'error', message: error.message }),
          }],
        };
      }
    }
  );
}
```

#### Skeleton: `src/tools/capture-frame.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { execa } from 'execa';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';
import { readComposition } from '../state/project-state.js';

export function registerCaptureFrame(server: McpServer): void {
  server.registerTool(
    'capture_frame',
    {
      title: 'Capture Frame',
      description: `Render a single frame as a PNG image for review.
Useful for verifying text positioning, image placement, and animation states.
If a sceneId is provided, the frame number is relative to that scene's startFrame.`,
      inputSchema: z.object({
        projectPath: z.string(),
        frame: z.number().describe('Frame number to capture (0-based)'),
        sceneId: z.string().optional().describe('Optional — makes frame relative to this scene'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        let absoluteFrame = args.frame;

        // If sceneId provided, offset frame by scene's startFrame
        if (args.sceneId) {
          const composition = await readComposition(args.projectPath);
          const scene = composition.scenes.find(s => s.id === args.sceneId);
          if (!scene) throw new Error(`Scene '${args.sceneId}' not found.`);
          absoluteFrame = scene.startFrame + args.frame;
        }

        const outputPath = path.join('output', `frame-${absoluteFrame}.png`);

        await execa('npx', [
          'remotion', 'still', 'main', outputPath,
          '--frame', String(absoluteFrame),
        ], {
          cwd: args.projectPath,
          stdio: 'pipe',
          timeout: 60_000,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              outputPath: path.resolve(args.projectPath, outputPath),
              frame: absoluteFrame,
              next_steps: 'Review the captured frame. If you have vision, analyze it and suggest improvements.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Ensure the project compiles and the frame number is within range.',
            }),
          }],
        };
      }
    }
  );
}
```

#### Skeleton: `src/tools/render-video.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { execa } from 'execa';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';

export function registerRenderVideo(server: McpServer): void {
  server.registerTool(
    'render_video',
    {
      title: 'Render Video',
      description: `Render the final video as MP4 or WebM. Stop the preview server before rendering.
Output is saved to the project's output/ directory.`,
      inputSchema: z.object({
        projectPath: z.string(),
        outputFormat: z.enum(['mp4', 'webm']).optional().default('mp4'),
        quality: z.enum(['draft', 'standard', 'high']).optional().default('standard'),
        outputFileName: z.string().optional().default('output'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        const ext = args.outputFormat ?? 'mp4';
        const outputPath = path.join('output', `${args.outputFileName ?? 'output'}.${ext}`);

        // Map quality to CRF (lower = better quality, larger file)
        const crfMap = { draft: 28, standard: 18, high: 10 };
        const crf = crfMap[args.quality ?? 'standard'];

        await execa('npx', [
          'remotion', 'render', 'main', outputPath,
          '--codec', ext === 'webm' ? 'vp9' : 'h264', // vp9 > vp8: better quality at same bitrate, widely supported
          '--crf', String(crf),
        ], {
          cwd: args.projectPath,
          stdio: 'pipe',
          timeout: 600_000, // 10-minute timeout for long renders
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              outputPath: path.resolve(args.projectPath, outputPath),
              format: ext,
              quality: args.quality,
              next_steps: 'Video rendered! Check the output/ directory.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Ensure the preview server is stopped and the project compiles.',
            }),
          }],
        };
      }
    }
  );
}
```

---

### Phase 5: Template Components & Polish

Build all `src/templates/components/*.tsx` files. These are React components that use Remotion APIs (`useCurrentFrame`, `interpolate`, `spring`, `staticFile`) to create animations. They live in the MCP server package and get copied into user projects by `init_project`.

For full prop definitions and animation specs for each template, refer to `remotion-mcp-planning.md` — "TEMPLATE COMPONENTS — DETAILED SPECS" section.

Build order: TitleCard first (simplest), then TextScene, ImageScene, TextWithImage, AnimatedObject (needed for custom scenes), then KineticTypography and CodeBlock (most complex).

#### Implementation: `src/templates/components/TitleCard.tsx`

The simplest template — establishes the Remotion animation pattern that all other templates follow.

```tsx
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';

interface TitleCardProps {
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  titleColor?: string;
  subtitleColor?: string;
  titleFontSize?: number;
  subtitleFontSize?: number;
  alignment?: 'center' | 'left' | 'right';
  logoSrc?: string; // path relative to public/, e.g. "images/logo.png"
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  backgroundColor = '#000000',
  titleColor = '#FFFFFF',
  subtitleColor,
  titleFontSize = 72,
  subtitleFontSize = 32,
  alignment = 'center',
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title: fade in + slide up from 20px below (spring, frames 0-25)
  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });
  const titleTranslateY = interpolate(titleY, [0, 1], [20, 0]);

  // Subtitle: fade in + slide up, delayed by 15 frames
  const subtitleOpacity = interpolate(frame, [15, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subtitleSpring = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 12, mass: 0.5, stiffness: 100 } });
  const subtitleTranslateY = interpolate(subtitleSpring, [0, 1], [20, 0]);

  // Logo: fade in at frame 0, fully visible by frame 20
  const logoOpacity = logoSrc
    ? interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  const textAlign = alignment;
  const resolvedSubtitleColor = subtitleColor ?? `${titleColor}B3`; // 70% opacity fallback

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start',
        padding: '0 120px',
      }}
    >
      {logoSrc && (
        <Img
          src={staticFile(logoSrc)}
          style={{
            height: 80,
            objectFit: 'contain',
            opacity: logoOpacity,
            marginBottom: 24,
          }}
        />
      )}
      <div
        style={{
          fontSize: titleFontSize,
          fontWeight: 'bold',
          color: titleColor,
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
          textAlign,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: subtitleFontSize,
            color: resolvedSubtitleColor,
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleTranslateY}px)`,
            textAlign,
            marginTop: 16,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};
```

**Key Remotion patterns used:**
- `useCurrentFrame()` — returns the current frame number (0-based, resets per `<Series.Sequence>`)
- `interpolate(frame, inputRange, outputRange, options)` — maps frame numbers to CSS values
- `spring({ frame, fps, config })` — physics-based easing that returns 0→1 over time
- `extrapolateRight: 'clamp'` — prevents values from exceeding the target after animation ends

#### Implementation: `src/templates/components/AnimatedObject.tsx`

The generic renderer for custom scenes. Takes one object from the `objects[]` array and applies all its animations based on the current frame.

```tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, staticFile } from 'remotion';

// Map easing names to Remotion Easing functions
const EASING_MAP: Record<string, ((t: number) => number) | undefined> = {
  'linear': undefined, // undefined = linear (interpolate default)
  'ease-in': Easing.in(Easing.ease),
  'ease-out': Easing.out(Easing.ease),
  'ease-in-out': Easing.inOut(Easing.ease),
};

interface Animation {
  property: 'opacity' | 'x' | 'y' | 'scale' | 'rotation' | 'width' | 'height';
  from: number;
  to: number;
  startFrame: number;
  endFrame: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
  springConfig?: { damping?: number; mass?: number; stiffness?: number };
}

interface ObjectConfig {
  id: string;
  type: 'text' | 'image' | 'shape' | 'svg';
  src?: string;
  content?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  position?: { x: number | string; y: number | string };
  size?: { width: number | string; height: number | string };
  borderRadius?: number | string;
  animations?: Animation[];
  [key: string]: unknown;
}

interface AnimatedObjectProps {
  object: ObjectConfig;
}

export const AnimatedObject: React.FC<AnimatedObjectProps> = ({ object: config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Compute animated values for each property
  const animatedValues: Record<string, number> = {};

  for (const anim of config.animations ?? []) {
    let value: number;

    if (frame < anim.startFrame) {
      // Before animation starts — hold initial value
      value = anim.from;
    } else if (frame > anim.endFrame) {
      // After animation ends — hold final value
      value = anim.to;
    } else if (anim.easing === 'spring') {
      // Spring physics animation
      const springVal = spring({
        frame: frame - anim.startFrame,
        fps,
        config: {
          damping: anim.springConfig?.damping ?? 10,
          mass: anim.springConfig?.mass ?? 1,
          stiffness: anim.springConfig?.stiffness ?? 100,
        },
      });
      value = interpolate(springVal, [0, 1], [anim.from, anim.to]);
    } else {
      // Linear or eased interpolation using Remotion's Easing module
      const easingFn = EASING_MAP[anim.easing ?? 'linear'];
      value = interpolate(
        frame,
        [anim.startFrame, anim.endFrame],
        [anim.from, anim.to],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          ...(easingFn ? { easing: easingFn } : {}),
        }
      );
    }

    animatedValues[anim.property] = value;
  }

  // Resolve position — supports both numeric (px) and string ("center", "50%") values
  const resolvePosition = (val: number | string | undefined, fallback: number): number => {
    if (val === undefined) return fallback;
    if (typeof val === 'number') return val;
    if (val === 'center') return fallback; // caller handles centering via CSS
    return fallback;
  };

  const x = animatedValues.x ?? resolvePosition(config.position?.x, 0);
  const y = animatedValues.y ?? resolvePosition(config.position?.y, 0);
  const opacity = animatedValues.opacity ?? 1;
  const scale = animatedValues.scale ?? 1;
  const rotation = animatedValues.rotation ?? 0;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: typeof config.position?.x === 'string' && config.position.x === 'center' ? '50%' : x,
    top: typeof config.position?.y === 'string' && config.position.y === 'center' ? '50%' : y,
    transform: `scale(${scale}) rotate(${rotation}deg)${
      config.position?.x === 'center' || config.position?.y === 'center' ? ' translate(-50%, -50%)' : ''
    }`,
    opacity,
  };

  // Render based on object type
  switch (config.type) {
    case 'text':
      return (
        <div
          style={{
            ...style,
            fontSize: config.fontSize ?? 48,
            fontWeight: (config.fontWeight as React.CSSProperties['fontWeight']) ?? 'normal',
            color: config.color ?? '#FFFFFF',
          }}
        >
          {config.content}
        </div>
      );

    case 'image':
      return (
        <Img
          src={staticFile(config.src ?? '')}
          style={{
            ...style,
            width: config.size?.width ?? 'auto',
            height: config.size?.height ?? 'auto',
          }}
        />
      );

    case 'shape':
      return (
        <div
          style={{
            ...style,
            width: config.size?.width ?? 100,
            height: config.size?.height ?? 100,
            backgroundColor: config.color ?? '#FFFFFF',
            borderRadius: typeof config.borderRadius === 'number' || typeof config.borderRadius === 'string'
              ? config.borderRadius : 0,
          }}
        />
      );

    default:
      return null;
  }
};
```

**Key patterns:**
- Each animation property is computed independently based on its own `startFrame`/`endFrame` range
- `spring` easing uses Remotion's physics engine; all other easings fall through to `interpolate`
- Values are held at `from` before animation starts and `to` after it ends — no flickering
- `Img` from `remotion` handles image loading; `staticFile()` resolves paths from `public/`

#### Remaining templates to build

After TitleCard and AnimatedObject are working, build the remaining templates following the same patterns. Refer to `remotion-mcp-planning.md` for full prop specs:

| Template | Key Remotion APIs | Complexity |
|----------|------------------|------------|
| `TextScene.tsx` | `interpolate` for fade/slide, `useCurrentFrame` for typewriter char counting | Low |
| `ImageScene.tsx` | `Img`, `staticFile`, `interpolate` for Ken Burns (scale 1.0→1.08 over scene duration) | Low |
| `TextWithImage.tsx` | Combine `Img` + text with staggered `spring` entrances from opposite sides | Medium |
| `CodeBlock.tsx` | `useCurrentFrame` for typewriter/line-by-line reveal, monospace font styling | Medium |
| `TransitionWipe.tsx` | `interpolate` to animate a clip-path or overlay div across the frame | Medium |
| `KineticTypography.tsx` | `audioWords` timestamps → per-word `spring` entrance synced to `startTime * fps` | High |

**KineticTypography audio sync pattern:**
```tsx
// For each word, calculate its entrance frame from audio timestamps
const wordFrame = Math.round(audioWord.start * fps);
const isVisible = frame >= wordFrame;
const wordSpring = spring({
  frame: Math.max(0, frame - wordFrame),
  fps,
  config: { damping: 12, stiffness: 200 },
});
```

#### Template Utilities

These files live in `src/templates/utils/` and get copied to `{project}/src/utils/` during scaffolding. They're imported by template components, so they must exist even if minimal.

##### `src/templates/utils/colors.ts`

```typescript
// Palette utilities — reads style block from composition.json
export interface StyleConfig {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

// Sensible defaults when composition.json style block is sparse
const DEFAULTS: Required<StyleConfig> = {
  primaryColor: '#4F46E5',
  secondaryColor: '#7C3AED',
  backgroundColor: '#0F172A',
  textColor: '#F8FAFC',
  accentColor: '#22D3EE',
  fontFamily: 'Inter',
};

// Merge user style config with defaults
export function resolveStyle(style?: Partial<StyleConfig>): Required<StyleConfig> {
  return { ...DEFAULTS, ...style };
}
```

##### `src/templates/utils/fonts.ts`

```typescript
// Font loading via @remotion/fonts (or plain CSS @font-face)
// Templates import this to ensure fonts are registered before rendering

import { staticFile } from 'remotion';

// Map of font family names → their file paths in public/fonts/
const FONT_REGISTRY: Record<string, string> = {};

// Register a font so it's available for rendering
export function registerFont(family: string, fileName: string): void {
  const url = staticFile(`fonts/${fileName}`);
  FONT_REGISTRY[family] = url;

  // Inject @font-face into the document (runs at composition evaluation time)
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: '${family}'; src: url('${url}'); }`;
  document.head.appendChild(style);
}

// Get the font-family CSS value (returns the family name if registered, or the raw input)
export function getFontFamily(family: string): string {
  return family; // the @font-face registration makes it available by name
}
```

##### `src/templates/utils/animations.ts`

```typescript
// Wrapper helpers for common Remotion animation patterns
import { interpolate, spring, useVideoConfig, useCurrentFrame } from 'remotion';

// Fade in over a range of frames
export function fadeIn(frame: number, startFrame: number, durationFrames: number): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// Slide in from a direction (returns a translateX or translateY pixel offset)
export function slideIn(
  frame: number,
  startFrame: number,
  durationFrames: number,
  distancePx: number = 100,
): number {
  return interpolate(frame, [startFrame, startFrame + durationFrames], [distancePx, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// Spring-based entrance — returns 0→1 progress
export function springEntrance(frame: number, fps: number, delay: number = 0): number {
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 200 },
  });
}
```

#### Additional Phase 5 tasks

1. Error handling hardening — add specific error messages for all known failure modes listed in `remotion-mcp-planning.md` ("ERROR HANDLING" section)
2. Verify all templates compile inside a scaffolded project with `npx remotion studio`
3. Test word-level sync accuracy: KineticTypography word entrances should be within 1 frame of `audioWords` timestamps

---

## 5. MCP Server Wiring Pattern

### The Registration Function Pattern

Every tool file exports exactly one function. The function's only job is to call `server.registerTool()`. Tool files do NOT create their own server instance — they receive it as an argument.

```
src/tools/example-tool.ts
    │
    │ exports registerExampleTool(server: McpServer)
    ▼
src/server.ts
    │
    │ imports registerExampleTool, calls it with the shared server instance
    ▼
src/index.ts
    │
    │ creates server, calls setupServer(server), connects transport
    ▼
    node dist/index.js (running process)
```

```typescript
// src/tools/example-tool.ts

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export function registerExampleTool(server: McpServer): void {
  server.registerTool(
    'example_tool',     // tool name (snake_case)
    {
      title: 'Example Tool',
      description: 'What Claude reads to decide when/how to call this tool.',
      inputSchema: z.object({
        requiredParam: z.string(),
        optionalParam: z.number().optional(),
      }),
    },
    async ({ requiredParam, optionalParam }) => {
      // Handler receives args already validated and typed by Zod
      try {
        const result = { status: 'success', data: 'example' };
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Describe what the user should check or fix.',
            }),
          }],
        };
      }
    }
  );
}
```

### Standard Response Shapes

Every tool returns `{ content: [{ type: 'text', text: string }] }` where `text` is a JSON string.

**Success:**
```json
{
  "status": "success",
  "...domain-specific fields...",
  "next_steps": "Human-readable suggestion for what Claude should do next."
}
```

**Error:**
```json
{
  "status": "error",
  "message": "Concise description of what went wrong.",
  "suggestion": "What the user or Claude should do to resolve this."
}
```

The `next_steps` field in success responses is important — Claude reads it and uses it to continue the workflow without needing further prompting. Always include it.

### Error Handling Pattern

Wrap every tool handler's body in a `try/catch`. Never let an exception propagate out of the handler — the MCP SDK does not guarantee clean error surfacing if an unhandled error escapes.

```typescript
async ({ projectPath }) => {
  try {
    // ... handler logic
    return { content: [{ type: 'text', text: JSON.stringify({ status: 'success' }) }] };
  } catch (err) {
    const error = err as Error;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'error',
          message: error.message,
          suggestion: 'Check that projectPath exists and contains composition.json.',
        }),
      }],
    };
  }
}
```

---

## 6. State Management Pattern

The server is **stateless between tool calls**. No in-memory caching of composition data. Every tool that reads or mutates state follows this three-step pattern:

```
1. readComposition(projectPath)    →  load fresh from disk
2. mutate the in-memory object     →  make the change
3. writeComposition(projectPath, data)  →  persist to disk
```

Example — the full mutation lifecycle for `create_scene`:

```typescript
// 1. Read fresh state
const composition = await readComposition(projectPath);

// 2. Build the new scene entry
const newScene: Scene = {
  id: sceneId,
  name: sceneName,
  type: sceneType,
  file: `scenes/${sceneId}-${sceneName}.tsx`,
  durationFrames,
  startFrame: 0, // placeholder — will be recalculated
  props,
  objects,
};

// 3. Append to scenes array
composition.scenes.push(newScene);

// 4. Recalculate ALL startFrame values from scratch
composition.scenes = recalculateStartFrames(composition.scenes);

// 5. Write back to disk
await writeComposition(projectPath, composition);

// 6. Generate the .tsx file from the updated scene entry
await writeSceneFile(projectPath, composition.scenes.find(s => s.id === sceneId)!, composition);

// 7. Regenerate Root.tsx to include the new scene
await regenerateRootTsx(projectPath, composition);
```

### `startFrame` Recalculation

`startFrame` is **never trusted from disk** — it is always recomputed. The `recalculateStartFrames` function in `project-state.ts` iterates scenes in order and assigns each one a `startFrame` equal to the cumulative sum of all preceding durations.

```
scenes[0].startFrame = 0
scenes[1].startFrame = scenes[0].durationFrames
scenes[2].startFrame = scenes[0].durationFrames + scenes[1].durationFrames
...
```

Any time the scenes array changes — create, delete, reorder, or duration update — call `recalculateStartFrames` before writing.

---

## 7. Template System

### How Templates Get Into User Projects

Templates are raw `.tsx` source files in `src/templates/` inside the MCP server package. When `init_project` runs, `copyTemplates()` in `file-ops.ts` copies them verbatim into the scaffolded project's `src/` directory.

```
MCP Server Package                    Scaffolded User Project
─────────────────────                 ──────────────────────────
src/templates/SceneRenderer.tsx →     {project}/src/SceneRenderer.tsx       (copied once)
src/templates/components/*.tsx  →     {project}/src/templates/*.tsx          (copied once)
src/templates/utils/*.ts        →     {project}/src/utils/*.ts              (copied once)
(no template)                   →     {project}/src/Root.tsx                (GENERATED by regenerateRootTsx)
```

**Root.tsx is NOT copied from templates.** It is always generated dynamically by `regenerateRootTsx()` in `file-ops.ts`. This is because Root.tsx must contain static imports for every scene component and match the exact scenes in `composition.json`. Copying a static template would immediately be overwritten.

After this copy, Remotion's own build tooling (Webpack-based) compiles these files when the user runs `npx remotion studio` or `npx remotion render`. The MCP server's `tsconfig.json` explicitly excludes `src/templates/` to avoid double-compilation.

### Root.tsx — Dynamic Stitching

`Root.tsx` is the only template file that is **regenerated** (not just copied once). Every time scenes are added, removed, or reordered, `regenerateRootTsx()` in `file-ops.ts` rewrites it from scratch. This means:

- Every scene component is imported by name
- Every scene is wrapped in `<Series.Sequence durationInFrames={...}>`
- The `<Composition>` element reflects the current total frame count, fps, and dimensions

`Root.tsx` is the entry point that Remotion's CLI looks for. It must always be consistent with `composition.json`.

### SceneRenderer.tsx — Static Dispatcher

`SceneRenderer.tsx` is copied once during `init_project` and **never regenerated**. It is a static switch-case that maps `scene.type` to the correct template component:

```tsx
// src/templates/SceneRenderer.tsx
import { TitleCard } from './templates/TitleCard';
import { TextScene } from './templates/TextScene';
// ... etc

export const SceneRenderer: React.FC<{ scene: SceneData }> = ({ scene }) => {
  switch (scene.type) {
    case 'title-card':   return <TitleCard {...scene.props} />;
    case 'text-scene':   return <TextScene {...scene.props} />;
    case 'image-scene':  return <ImageScene {...scene.props} />;
    // ... etc
    case 'custom':       return <CustomScene objects={scene.objects} />;
    default:             return null;
  }
};
```

Scene `.tsx` files generated by `writeSceneFile()` import directly from the named template components, bypassing `SceneRenderer`. `SceneRenderer` is a convenience utility for users who want to customize beyond the generated code — e.g., rendering scenes dynamically from JSON without pre-generated `.tsx` files. It is NOT used by any generated code in the default flow, but is included because it's useful for advanced customization.

### Asset Path Convention for `staticFile()`

Because `public/` subdirectories are symlinked to `assets/` subdirectories, `staticFile()` paths must NOT include the `assets/` prefix.

```
Physical location (user-facing):   assets/audio/voiceover.mp3
Symlink:                            public/audio/ → assets/audio/
staticFile() argument:              staticFile('audio/voiceover.mp3')
composition.json "file" field:      "audio/voiceover.mp3"  (relative to public/)
```

**Convention:** All file paths stored in `composition.json` (audio files, image references) use paths relative to `public/`. The `scan_assets` tool should return both formats:
- `path`: `"assets/audio/voiceover.mp3"` — for user display ("your file is here")
- `publicPath`: `"audio/voiceover.mp3"` — for use in `staticFile()` and `composition.json`

This ensures `staticFile()` can always resolve the file correctly. If a user stores `"assets/audio/voiceover.mp3"` in composition.json, `staticFile()` will look for `public/assets/audio/voiceover.mp3` which does not exist — resulting in a silent 404 and muted audio.

---

## 8. Process Management

### Why `execa` Instead of `child_process`

`execa` provides: Promise-based API, clean cross-platform process termination, structured output, and better error messages than raw `child_process.spawn`. It is critical for `render_video` and `capture_frame` where you need to await completion.

### `src/utils/process-manager.ts`

The process manager uses a `Map<string, ResultPromise>` keyed by `projectPath`. Note: execa v9+ exports `ResultPromise` as the process type (not `ExecaChildProcess` which was v5/v6). This allows multiple projects to have simultaneous preview servers.

```typescript
import { execa } from 'execa';
import type { ResultPromise } from 'execa';
import path from 'path';

// execa v9+ exports ResultPromise as the return type of execa() (ExecaChildProcess is v5/v6)
// Running preview processes, keyed by project path
const runningProcesses = new Map<string, ResultPromise>();

export async function startProcess(
  projectPath: string,
  command: string,
  args: string[]
): Promise<{ pid: number }> {
  if (runningProcesses.has(projectPath)) {
    throw new Error(`A preview server is already running for ${projectPath}. Call stop_preview first.`);
  }

  // detached: false — process is a child of this server; killed when server exits
  const proc = execa(command, args, {
    cwd: projectPath,
    stdio: 'pipe',
    detached: false,
  });

  // Clean up map entry if the process dies unexpectedly
  proc.on('exit', () => {
    runningProcesses.delete(projectPath);
  });

  // Proc starts immediately — don't await (it runs indefinitely)
  runningProcesses.set(projectPath, proc);

  // Wait for stdout to confirm readiness, or fall back to a timeout
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 3000);
    proc.stdout?.on('data', (data: Buffer) => {
      // Remotion Studio prints a message when ready
      if (data.toString().includes('http://')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  if (!proc.pid) {
    runningProcesses.delete(projectPath);
    throw new Error('Process failed to start — no PID assigned.');
  }

  return { pid: proc.pid };
}

export async function stopProcess(projectPath: string): Promise<void> {
  const proc = runningProcesses.get(projectPath);
  if (!proc) {
    throw new Error(`No running process found for ${projectPath}.`);
  }
  proc.kill('SIGTERM');
  // Wait for the process to actually exit (up to 5s) to avoid port conflicts on restart
  await Promise.race([proc.catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
  runningProcesses.delete(projectPath);
}

// Kill all running preview servers — called on MCP server shutdown
export async function stopAllProcesses(): Promise<void> {
  const entries = [...runningProcesses.entries()];
  for (const [projectPath, proc] of entries) {
    proc.kill('SIGTERM');
    await Promise.race([proc.catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
    runningProcesses.delete(projectPath);
  }
}

export function isRunning(projectPath: string): boolean {
  return runningProcesses.has(projectPath);
}
```

### One-Shot Commands (render, still)

`render_video` and `capture_frame` run Remotion CLI as **awaited, one-shot processes** — you wait for them to complete:

```typescript
// render_video pattern
await execa('npx', ['remotion', 'render', 'main', outputPath], {
  cwd: projectPath,
  stdio: 'pipe',
});
```

```typescript
// capture_frame pattern
await execa('npx', ['remotion', 'still', 'main', outputPath, '--frame', String(frameNumber)], {
  cwd: projectPath,
  stdio: 'pipe',
});
```

### Long-Running Commands (preview)

`start_preview` spawns without awaiting — the child process runs independently:

```typescript
// start_preview pattern — do NOT await
const { pid } = await startProcess(projectPath, 'npx', ['remotion', 'studio']);
```

### Process Cleanup on Server Exit

Add cleanup to `src/index.ts` to kill all child processes when the MCP server exits:

```typescript
// In src/index.ts, after server.connect(transport):
import { stopAllProcesses } from './utils/process-manager.js';

process.on('SIGINT', async () => {
  await stopAllProcesses();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await stopAllProcesses();
  process.exit(0);
});
```

---

## 9. Testing & Debugging

### Testing the MCP Server with Claude CLI

Claude CLI connects to MCP servers via a config file. Once configured (see Section 10), you can test tools by chatting with Claude naturally:

```
"Hey Claude, I want to make a video about our product launch"
→ Claude should call start_session automatically

"Start a new project called my-video"
→ Claude should call init_project
```

### Testing Individual Tools in Isolation

The easiest way to test without Claude is using `@modelcontextprotocol/inspector` — a browser-based UI for MCP servers:

```bash
# Install and run the inspector (opens a browser UI)
npx @modelcontextprotocol/inspector node dist/index.js
```

The inspector handles the MCP initialization handshake automatically and lets you call tools from a web interface.

Alternatively, test via Claude CLI directly:

```bash
# 1. Build: npm run build
# 2. Add the server to your Claude config (see Section 10)
# 3. Start a Claude session and ask: "What video tools do you have?"
# 4. Claude lists your registered tools — call them naturally
```

**Note:** Raw `echo '...' | node dist/index.js` will NOT work because MCP requires an initialization handshake (`initialize` → `initialized` notification) before tool calls are accepted.

### Testing the Scaffolded Remotion Project

After calling `init_project`, verify the scaffolded project compiles by running Remotion Studio inside it:

```bash
cd /path/to/scaffolded-project
npx remotion studio
# Should open http://localhost:3000 — blank composition is fine at this stage
```

If Remotion throws TypeScript errors, the issue is in one of the copied template files. Fix in `src/templates/` and re-copy.

### Common Issues and Fixes

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `Cannot find module '@modelcontextprotocol/server'` | Package not installed or wrong name | Run `npm install @modelcontextprotocol/server`. Do NOT use `@modelcontextprotocol/sdk` (that's the v1 package name). |
| `console.log` output appears but Claude gets no response | Writing debug output to `stdout` | Change all debug logging to `console.error()` |
| Server exits immediately when started | Unhandled `await` error at top level | Wrap `main()` in `.catch()` as shown in `index.ts` pattern |
| Remotion Studio crashes with `Module not found` | Template component missing import | Check `SceneRenderer.tsx` imports match files that were actually copied |
| `execa` throws `ENOENT` for `npx` | `npx` not in PATH when invoked by MCP | Use the full path `process.execPath` resolved `npx`, or ensure PATH is inherited |
| `zod/v4` import not found | Using `zod` directly instead of `zod/v4` | Import must be `import * as z from 'zod/v4'` — this is a sub-path export of the `zod` package (namespace import) |
| `startFrame` values are wrong | `recalculateStartFrames` not called after mutation | Always call it immediately after any push/splice/sort on the scenes array |
| Composition.json gets out of sync with `.tsx` files | `Root.tsx` not regenerated after scene change | Call `regenerateRootTsx` at the end of every create/update/delete/reorder handler |
| Remotion Studio says "No composition found" | Missing `src/index.ts` entry point in scaffolded project | `init_project` must create `src/index.ts` that re-exports `RemotionRoot` from `./Root`. Remotion v4 auto-discovers compositions from this file. |

### ESM Debug Checklist

This project uses `"type": "module"` (ESM). If you see module-related errors:

1. Check that `package.json` has `"type": "module"` (not `"commonjs"`)
2. Check `tsconfig.json` has `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`
3. Check that ALL relative imports include `.js` extensions (e.g., `'./server.js'`, not `'./server'`) — TypeScript compiles `.ts` to `.js`, so the import must reference the output file
4. If you see `ReferenceError: __dirname is not defined`, replace with the `import.meta.url` pattern (see `file-ops.ts`)
5. If you see `ERR_MODULE_NOT_FOUND`, check that the imported path matches the actual compiled file in `dist/`

---

## 10. Claude Desktop / CLI Configuration

### What the Config Does

You tell Claude Desktop or Claude CLI where to find the MCP server executable. Claude spawns it as a child process and communicates over stdio.

### macOS / Linux — Claude CLI Config

The recommended approach is using the `claude mcp add` command:

```bash
# Add the server (one-time setup)
claude mcp add remotion-video-mcp node /absolute/path/to/remotion-video-mcp/dist/index.js
```

This writes to `~/.claude.json` or `~/.claude/settings.json` (location varies by CLI version). Alternatively, manually add to the config file:

```json
{
  "mcpServers": {
    "remotion-video-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/remotion-video-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

Replace `/absolute/path/to/remotion-video-mcp` with the actual absolute path to this repository on your machine. Run `claude --help` to check the exact config file location for your CLI version.

### macOS — Claude Desktop Config

The Claude Desktop config file lives at:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add to the `mcpServers` object:

```json
{
  "mcpServers": {
    "remotion-video-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/remotion-video-mcp/dist/index.js"]
    }
  }
}
```

### Windows — Claude Desktop Config

Config lives at:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Use forward slashes or escaped backslashes in the path:

```json
{
  "mcpServers": {
    "remotion-video-mcp": {
      "command": "node",
      "args": ["C:/Users/YourName/projects/remotion-video-mcp/dist/index.js"]
    }
  }
}
```

### Verifying the Config Works

1. Build the server: `npm run build`
2. Restart Claude Desktop (or reload Claude CLI session)
3. Open a new conversation
4. Ask: "What video tools do you have available?"
5. Claude should list the registered tools (e.g., `start_session`, `init_project`, etc.)

If tools do not appear, check:
- The path in the config is correct and absolute
- `dist/index.js` exists (i.e., you ran `npm run build`)
- No syntax errors in the config JSON file
- Claude was fully restarted after config changes

### Development Workflow

During active development, use watch mode so the server auto-recompiles on changes:

```bash
# Terminal 1 — recompile on save
npm run dev

# Terminal 2 — test by running directly
node dist/index.js
```

After each rebuild, restart the Claude session to pick up the new server binary.

---

## Quality Checklist

Before considering any phase complete, verify:

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` produces `dist/` with all `.js` files
- [ ] `node dist/index.js` starts and blocks without errors (no `ERR_REQUIRE_ESM` or `ERR_MODULE_NOT_FOUND`)
- [ ] All relative imports use `.js` extensions (ESM requirement)
- [ ] All registered tools appear when Claude is asked "what tools do you have?"
- [ ] Each tool's `try/catch` returns a properly shaped error response (not a thrown exception)
- [ ] `console.log` is absent from all tool files (use `console.error` if debugging)
- [ ] After `init_project`, `npx remotion studio` compiles the scaffolded project without errors
- [ ] `composition.json` is always valid JSON after every write (test by parsing with `JSON.parse`)
- [ ] `Root.tsx` imports match the actual scene files present in `scenes/`
- [ ] `recalculateStartFrames` is called every time the scenes array is mutated

**Phase 2 additional checks:**
- [ ] Create 3 scenes, update 1, delete 1 — `list_scenes` returns correct `startFrame` values
- [ ] Scene `.tsx` files compile without errors in the scaffolded project
- [ ] `Root.tsx` imports match the scene files in `scenes/`

**Phase 3 additional checks:**
- [ ] `scan_assets` parses a timestamp JSON file without errors
- [ ] `scan_assets` returns structured image/audio/font inventory
- [ ] Scene `durationFrames` matches `Math.ceil((endTime - startTime) * fps)` for narration segments
- [ ] `update_composition` correctly wires audio config into composition.json
- [ ] `regenerateRootTsx` generates `<Audio>` components when audio is configured

**Phase 4 additional checks:**
- [ ] `start_preview` launches Remotion Studio and the URL is accessible in a browser
- [ ] `render_video` produces a non-empty MP4 that plays in QuickTime/VLC
- [ ] `capture_frame` produces a valid PNG file at the specified frame number

**Phase 5 additional checks:**
- [ ] `TitleCard` renders with spring-animated title + subtitle entrance
- [ ] `AnimatedObject` correctly applies per-property animations at frame-level precision
- [ ] Custom scene with multiple animated objects renders without errors
- [ ] `KineticTypography` word entrance timing matches `audioWords` timestamps within 1 frame
- [ ] `TransitionWipe` scenes render correctly between content scenes
- [ ] All templates compile without errors in `npx remotion studio`

---

## Implementation Notes

All 5 phases have been implemented and the server is fully functional.

### MCP SDK Package

The published npm package is `@modelcontextprotocol/sdk` v1.27.1. The v2 package name (`@modelcontextprotocol/server`) referenced in early planning docs is **not yet published to npm**. All imports come from the v1.27.1 SDK:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

The `registerTool()` API is available in SDK v1.27.1 alongside the deprecated `server.tool()` method. This project uses `registerTool()` exclusively.

### Zod v4 Notes

With `zod@4.x`, the default export gives the Zod v4 classic API:

```typescript
import { z } from "zod";
```

Key difference from v3: `z.record()` requires two arguments — a key schema and a value schema:

```typescript
// v4 (correct)
z.record(z.string(), z.unknown())

// v3 (single-arg, no longer valid in v4)
z.record(z.unknown())
```

### Build & Startup Verification

- `npm run build` completes with zero TypeScript errors
- `node dist/index.js` starts cleanly and blocks on stdin, ready for MCP client connections

---

## Conversation Flow Examples

For detailed example conversations showing the full user interaction (from onboarding through scene creation, preview, iteration, and final render), refer to `remotion-mcp-planning.md` — "CONVERSATION FLOW EXAMPLES" section.

Two example flows are documented:
1. **Narration-driven product video** — voiceover + timestamps + screenshots → 6 scenes with audio sync
2. **Background music social ad** — 15-second vertical reel with lofi music and photo cycling

These examples illustrate how Claude orchestrates tool calls in sequence and how the `next_steps` field in tool responses guides Claude's workflow decisions.

---

## References

- Feature specification (tool schemas, composition.json format, audio timestamp format): `docs/planning/remotion-mcp-server.md`
- Project conventions and architecture decisions: `CLAUDE.md`
- Full project specification, conversation flow examples, and audio mode details: `remotion-mcp-planning.md`
- MCP SDK documentation: https://github.com/modelcontextprotocol/typescript-sdk
- Remotion v4 documentation: https://www.remotion.dev/docs
