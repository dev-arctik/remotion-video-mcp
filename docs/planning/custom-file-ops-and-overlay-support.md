# Feature: Custom File Operations and Overlay Support

**Version:** v1.0
**Status:** Implemented
**Type:** Implementation Guide
**Created:** 2026-03-01
**Last Modified:** 2026-03-02
**Implemented:** 2026-03-02

---

## Problem Statement

Claude has no ability to write arbitrary files into scaffolded Remotion projects. Every file write path in the MCP tool surface is scoped to template-based scene files. This blocks workflows where Claude needs to:

- Extract a color palette or typography spec from a user-provided screenshot and write a shared theme file
- Create a persistent global overlay (e.g., a bouncing ball or watermark) that renders on top of every scene
- Write shared hooks, utility helpers, or CSS modules that custom scene logic depends on
- Iterate on a custom component across multiple tool calls without losing work

The root cause is three compounding gaps documented in `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md`:

1. No `write_file` / `read_file` tools exist — Claude cannot write or read arbitrary files in the project
2. The `Composition` interface (`src/state/project-state.ts:5`) has no `overlays[]` field — overlay registrations have no persistence layer
3. `regenerateRootTsx()` (`src/utils/file-ops.ts:160`) does a full `fs.writeFile` replacement that reads only `scenes` and `audio` — any manually added overlay code is destroyed on the next scene mutation

---

## Goals & Success Criteria

- Claude can write a `.tsx`, `.ts`, `.css`, or `.json` file to a predefined location in the project without Claude Desktop file-system access
- A written component can be registered as a global overlay and immediately appears in Remotion Studio via HMR
- Overlay registration survives all subsequent scene mutations (`create_scene`, `update_scene`, `delete_scene`, `reorder_scenes`, `update_composition`)
- Protected system files (`composition.json`, `src/Root.tsx`, `src/SceneRenderer.tsx`, `package.json`, `tsconfig.json`, `remotion.config.ts`) cannot be overwritten by `write_file`
- Claude can read any file back from the project to inspect it before editing
- No behavioral change to any existing tool — all 13 current tools continue to work identically

**Definition of done:**
- [ ] `write_file` tool implemented and registered in `src/server.ts`
- [ ] `read_file` tool implemented and registered in `src/server.ts`
- [ ] `add_overlay` tool implemented and registered in `src/server.ts`
- [ ] `remove_overlay` tool implemented and registered in `src/server.ts`
- [ ] `Overlay` interface added to `src/state/project-state.ts` with `overlays?: Overlay[]` on `Composition`
- [ ] `regenerateRootTsx()` updated to read and emit overlays into `Root.tsx`
- [ ] `init_project` updated to write `overlays: []` in the initial composition object
- [ ] TypeScript builds clean (`npm run build`) with zero errors
- [ ] End-to-end test: write overlay component, register, verify in Remotion Studio, add scene, verify overlay survives regeneration

---

## Requirements

### Functional Requirements

- **FR-001:** `write_file` writes any file with a `.tsx`, `.ts`, `.css`, or `.json` extension to the project. The target path is relative to the project root.
- **FR-002:** `write_file` rejects writes to any path in the protected-file list. The rejection is an explicit error response — no silent skips.
- **FR-003:** `write_file` creates intermediate directories automatically so Claude does not need a separate `mkdir` call.
- **FR-004:** `read_file` returns the full UTF-8 content of any file in the project. Claude uses this before editing to avoid blind writes.
- **FR-005:** `read_file` rejects attempts to read outside the project root (path traversal protection, same as `validateProjectPath`).
- **FR-006:** `add_overlay` appends an entry to `overlays[]` in `composition.json` and immediately calls `regenerateRootTsx()`.
- **FR-007:** `add_overlay` verifies the referenced component file exists on disk before modifying `composition.json`.
- **FR-008:** `add_overlay` verifies the `componentName` does not collide with any existing scene component name.
- **FR-009:** `remove_overlay` removes the matching overlay entry from `composition.json` and calls `regenerateRootTsx()`.
- **FR-010:** `remove_overlay` optionally deletes the component `.tsx` file from disk when `deleteFile: true` is passed.
- **FR-011:** `regenerateRootTsx()` reads `overlays` from composition and generates a static import and `<AbsoluteFill>` render call per overlay, placed after the `<Series>` block and audio.
- **FR-012:** All overlay imports and render calls are sorted by `zIndex` (ascending) so higher-`zIndex` overlays render on top.

### Non-Functional Requirements

- **Path traversal protection** — `write_file` and `read_file` must resolve and validate the target path is inside the project root. Reject `..` segments and symlink escapes using the same guard pattern as `validateProjectPath` (`src/utils/file-ops.ts:12`).
- **Allowed extension list** — `write_file` only accepts `.tsx`, `.ts`, `.css`, `.json`. Reject others with a descriptive error and the allowed list.
- **No silent overwrites of protected files** — the protected-file list is checked before any write. Fail loudly.
- **TypeScript strict mode** — all new files must typecheck under `strict: true` (inherited from the root `tsconfig.json`).
- **ESM compatibility** — all new source files use `.js` extensions in relative imports (required by `"module": "NodeNext"`).

### Assumptions

- Claude will always call `write_file` to place a component on disk before calling `add_overlay` — the tool enforces this by checking file existence
- Overlays are full-video-duration by design; per-scene overlays remain out of scope (handled by scene `objects[]`)
- The `src/overlays/` directory is the recommended location for overlay components but is not enforced — any project-relative path that is not protected is valid

---

## User Stories

| Priority | Story | Acceptance Criteria |
|----------|-------|---------------------|
| Must | As Claude, I want to write a custom `.tsx` component to the project so that I can create animations that no pre-built template supports | `write_file` writes the file, creates parent dirs, returns the written path |
| Must | As Claude, I want to register a component as a global overlay so that it renders on top of all scenes for the full video | `add_overlay` appends to `overlays[]`, calls `regenerateRootTsx()`, overlay appears in Studio |
| Must | As Claude, I want overlays to survive scene mutations so that adding or reordering scenes does not destroy overlay work | After any `create_scene`/`update_scene`/`delete_scene`/`reorder_scenes` call, all registered overlays are present in the regenerated `Root.tsx` |
| Must | As Claude, I want to read a file before editing it so that I can make targeted changes without blind writes | `read_file` returns file content; Claude can then write an updated version with `write_file` |
| Must | As Claude, I want protected files to be unwritable so that I cannot accidentally corrupt `composition.json` or `Root.tsx` | `write_file` on any protected path returns an explicit error with the protected-file list |
| Should | As Claude, I want to remove an overlay and optionally delete its file so that I can clean up experiments | `remove_overlay` with `deleteFile: true` removes the entry and deletes the `.tsx` from disk |
| Should | As Claude, I want to write a shared theme file (`.ts` or `.json`) so that multiple scenes can import shared colors or typography | `write_file` accepts `.ts` and `.json` extensions; file is accessible for import |

---

## Technical Design

### Architecture Overview

```
composition.json (source of truth)
├── scenes[]           ← existing
├── audio              ← existing
└── overlays[]         ← NEW — Overlay[] array

Claude MCP Tool Calls
├── write_file         → writes arbitrary .tsx/.ts/.css/.json to project
├── read_file          → reads any project file back to Claude
├── add_overlay        → appends to overlays[], calls regenerateRootTsx()
└── remove_overlay     → removes from overlays[], calls regenerateRootTsx()

regenerateRootTsx()    ← modified — reads overlays[] from composition
└── src/Root.tsx       ← generated — now includes overlay imports + renders
```

### Generated `Root.tsx` with Overlays (After Change)

The current `Root.tsx` output (from `src/utils/file-ops.ts:202`) will gain an overlay section:

```tsx
// BEFORE (current — file-ops.ts:202-234)
const MainComposition: React.FC = () => {
  return (
    <>
      <Series>
        {/* scene entries */}
      </Series>
      {/* audio */}
    </>
  );
};

// AFTER (with overlay support)
import { BouncingBall } from '../src/overlays/BouncingBall';  // generated per overlay

const MainComposition: React.FC = () => {
  return (
    <>
      <Series>
        {/* scene entries */}
      </Series>
      {/* audio */}
      {/* Overlays — rendered above scenes for full video duration */}
      <AbsoluteFill style={{ zIndex: 10, pointerEvents: 'none' }}>
        <BouncingBall />
      </AbsoluteFill>
    </>
  );
};
```

### Component Breakdown

| Component | File | Purpose |
|-----------|------|---------|
| `Overlay` interface | `src/state/project-state.ts` | New type — overlay schema |
| `Composition` interface | `src/state/project-state.ts` | Add `overlays?: Overlay[]` field |
| `regenerateRootTsx()` | `src/utils/file-ops.ts` | Read overlays, emit imports + render blocks |
| `registerWriteFile` | `src/tools/write-file.ts` | New tool — write arbitrary file |
| `registerReadFile` | `src/tools/read-file.ts` | New tool — read arbitrary file |
| `registerAddOverlay` | `src/tools/add-overlay.ts` | New tool — register overlay in composition |
| `registerRemoveOverlay` | `src/tools/remove-overlay.ts` | New tool — deregister overlay |
| `setupServer` | `src/server.ts` | Register 4 new tools in Phase 5 block |
| `registerInitProject` | `src/tools/init-project.ts` | Add `overlays: []` to initial composition |

### Data Models / Schema Changes

#### New `Overlay` Interface (`src/state/project-state.ts`)

```typescript
export interface Overlay {
  id: string;           // unique identifier, e.g. "overlay-bouncing-ball"
  name: string;         // human-readable label, e.g. "Bouncing Ball"
  componentName: string;// named export in the .tsx file, e.g. "BouncingBall"
  file: string;         // project-relative path, e.g. "src/overlays/BouncingBall.tsx"
  zIndex: number;       // render order — higher renders on top; default 10
  startFrame?: number;  // first frame the overlay appears — omit for full-video-duration
  endFrame?: number;    // last frame the overlay appears — omit for full-video-duration
}
```

#### Updated `Composition` Interface (`src/state/project-state.ts:5`)

Add one optional field after `scenes`:

```typescript
export interface Composition {
  // ... existing fields unchanged ...
  scenes: Scene[];
  overlays?: Overlay[];  // NEW — empty array when no overlays registered
}
```

Making `overlays` optional (with `?`) means existing `composition.json` files written by `init_project` before this change remain valid — they are read as `undefined` and treated as `[]` downstream.

#### Updated `composition.json` shape

```json
{
  "version": "1.0",
  "metadata": { ... },
  "settings": { ... },
  "style": { ... },
  "audio": { ... },
  "scenes": [ ... ],
  "overlays": [
    {
      "id": "overlay-bouncing-ball",
      "name": "Bouncing Ball",
      "componentName": "BouncingBall",
      "file": "src/overlays/BouncingBall.tsx",
      "zIndex": 10
    }
  ]
}
```

### Tool Input Schemas (Zod)

#### `write_file`

```typescript
z.object({
  projectPath: z.string().describe('Absolute path to the Remotion project root'),
  filePath: z.string().describe(
    'Path relative to project root where the file will be written. ' +
    'Allowed extensions: .tsx, .ts, .css, .json. ' +
    'Example: "src/overlays/BouncingBall.tsx"'
  ),
  content: z.string().describe('Full UTF-8 file content to write'),
})
```

#### `read_file`

```typescript
z.object({
  projectPath: z.string().describe('Absolute path to the Remotion project root'),
  filePath: z.string().describe(
    'Path relative to project root of the file to read. ' +
    'Example: "src/overlays/BouncingBall.tsx"'
  ),
})
```

#### `add_overlay`

```typescript
z.object({
  projectPath: z.string(),
  overlayId: z.string().describe("Unique kebab-case ID, e.g. 'overlay-bouncing-ball'"),
  name: z.string().describe("Human-readable label, e.g. 'Bouncing Ball'"),
  componentName: z.string().describe(
    'Named export in the .tsx file — must match exactly. Example: "BouncingBall"'
  ),
  file: z.string().describe(
    'Project-relative path to the component file. Example: "src/overlays/BouncingBall.tsx"'
  ),
  zIndex: z.number().optional().default(10).describe(
    'Render order. Higher = on top. Default 10. Use values > 10 to appear above other overlays.'
  ),
  startFrame: z.number().optional().describe(
    'First frame the overlay appears. Omit for full-video-duration overlay (e.g., logo/watermark).'
  ),
  endFrame: z.number().optional().describe(
    'Last frame the overlay appears. Omit for full-video-duration overlay.'
  ),
})
```

#### `remove_overlay`

```typescript
z.object({
  projectPath: z.string(),
  overlayId: z.string().describe('ID of the overlay to remove'),
  deleteFile: z.boolean().optional().default(false).describe(
    'If true, also deletes the component .tsx file from disk. Default false.'
  ),
})
```

### Protected File List

Used by `write_file`. Checked via exact match after path resolution.

```typescript
const PROTECTED_FILES = [
  'composition.json',
  'src/Root.tsx',
  'src/SceneRenderer.tsx',
  'package.json',
  'tsconfig.json',
  'remotion.config.ts',
  'src/index.ts',
];
```

`src/index.ts` is added to this list (beyond what the issue doc proposed) because it is the Remotion entry point that calls `registerRoot(RemotionRoot)` — overwriting it would break the entire project.

### Allowed Extension List

```typescript
const ALLOWED_EXTENSIONS = ['.tsx', '.ts', '.css', '.json'];
```

Binary files (images, audio, fonts) go through `assets/` and `scan_assets`. The `write_file` tool is exclusively for code and config.

### Updated `regenerateRootTsx()` Logic

The function at `src/utils/file-ops.ts:160` currently destructures `{ settings, scenes, audio }` from composition (`line 164`). The change:

1. Also destructure `overlays = []` (default empty to handle pre-existing `composition.json` files with no `overlays` key)
2. Sort overlays by `zIndex` ascending (so that a `zIndex: 20` overlay renders after `zIndex: 10`, appearing on top in CSS stacking)
3. Generate static import lines for each overlay component
4. Generate a render block for each overlay — `<AbsoluteFill>` with `style={{ zIndex, pointerEvents: 'none' }}` wrapping the component
5. Emit overlay imports alongside scene imports; emit overlay render blocks after the audio block inside `MainComposition`

The `pointerEvents: 'none'` on overlay wrappers is intentional — overlays are visual elements and should not block mouse events in Remotion Studio preview.

Import generation logic (parallel to `sceneImports` at `file-ops.ts:171`):

```typescript
// Relative import path from src/Root.tsx to the overlay file
// overlay.file = "src/overlays/BouncingBall.tsx" → import from "../src/overlays/BouncingBall"
// overlay.file = "scenes/BouncingBall.tsx"       → import from "../scenes/BouncingBall"
const overlayImports = overlays
  .map((o) => {
    const relativePath = path.relative('src', o.file).replace(/\.tsx$/, '');
    return `import { ${o.componentName} } from '../${o.file.replace(/\.tsx$/, '')}';`;
  })
  .join('\n');
```

Note: `Root.tsx` is written to `src/Root.tsx`, so the import path prefix is always `../` relative to `src/`. The overlay's `file` field is already project-root-relative (e.g., `src/overlays/BouncingBall.tsx`), so the import is `../src/overlays/BouncingBall` — which correctly resolves from `src/Root.tsx`.

Render block generation:

```typescript
const overlayRenderBlocks = overlaysSorted
  .map((o) => {
    const inner =
      `      <AbsoluteFill style={{ zIndex: ${o.zIndex}, pointerEvents: 'none' as const }}>\n` +
      `        <${o.componentName} />\n` +
      `      </AbsoluteFill>`;
    // Partial-duration overlays are wrapped in <Sequence from={startFrame} durationInFrames={endFrame - startFrame}>
    if (o.startFrame != null || o.endFrame != null) {
      const from = o.startFrame ?? 0;
      const duration = o.endFrame != null ? `durationInFrames={${o.endFrame - from}}` : '';
      return `      {/* Overlay: ${o.name} (frames ${from}–${o.endFrame ?? 'end'}) */}\n` +
        `      <Sequence from={${from}} ${duration}>\n${inner}\n      </Sequence>`;
    }
    return `      {/* Overlay: ${o.name} — full duration */}\n${inner}`;
  })
  .join('\n');
```

`AbsoluteFill` is already imported from `remotion` in the file (`Composition, Series` import line). Confirm that `AbsoluteFill` is added to that import when overlays are present.

---

## Implementation Plan

### Phase 1 — Schema and Core Changes (foundation for everything else)

| Task | File | Change |
|------|------|--------|
| Add `Overlay` interface | `src/state/project-state.ts` | New `export interface Overlay { ... }` after `Scene` interface (line 52) |
| Add `overlays?` to `Composition` | `src/state/project-state.ts` | Add `overlays?: Overlay[]` after `scenes: Scene[]` (line 35) |
| Update `regenerateRootTsx()` | `src/utils/file-ops.ts` | Read overlays, generate imports and render blocks (see design above) |
| Update `registerInitProject` | `src/tools/init-project.ts` | Add `overlays: []` to the `Composition` object at line 95 (after `scenes: []`) |

**Why first:** The schema change and `regenerateRootTsx()` update are the shared foundation. All four new tools depend on the `Overlay` type. `init_project` update ensures new projects start with a valid empty overlays array.

### Phase 2 — `write_file` and `read_file` Tools

| Task | File | Change |
|------|------|--------|
| Create `write_file` tool | `src/tools/write-file.ts` | New file implementing `registerWriteFile` |
| Create `read_file` tool | `src/tools/read-file.ts` | New file implementing `registerReadFile` |
| Register both tools | `src/server.ts` | Add import + `registerWriteFile(server)` + `registerReadFile(server)` in Phase 5 block |

**Why second:** File I/O tools are independent of the overlay schema. They can be built, tested, and used standalone. A developer can use `write_file` to place a component file even before overlay registration exists.

### Phase 3 — `add_overlay` and `remove_overlay` Tools

| Task | File | Change |
|------|------|--------|
| Create `add_overlay` tool | `src/tools/add-overlay.ts` | New file implementing `registerAddOverlay` |
| Create `remove_overlay` tool | `src/tools/remove-overlay.ts` | New file implementing `registerRemoveOverlay` |
| Register both tools | `src/server.ts` | Add import + registration for both in Phase 5 block |

**Why last:** These tools depend on Phase 1 (`Overlay` type + `regenerateRootTsx()` overlay support) and naturally follow Phase 2 (Claude writes the file with `write_file`, then registers it with `add_overlay`).

### Suggested Build Order

1. `src/state/project-state.ts` — add `Overlay` interface and `overlays?` field
2. `src/utils/file-ops.ts` — update `regenerateRootTsx()` to handle overlays
3. `src/tools/init-project.ts` — add `overlays: []`
4. `npm run typecheck` — verify Phase 1 builds clean before writing any new tools
5. `src/tools/write-file.ts` — implement `write_file`
6. `src/tools/read-file.ts` — implement `read_file`
7. `src/server.ts` — register `write_file` and `read_file`
8. `npm run typecheck` — verify Phase 2 is clean
9. `src/tools/add-overlay.ts` — implement `add_overlay`
10. `src/tools/remove-overlay.ts` — implement `remove_overlay`
11. `src/server.ts` — register `add_overlay` and `remove_overlay`
12. `npm run build` — final full compile

---

## Detailed Implementation Notes

### `write_file` Tool (`src/tools/write-file.ts`)

**Handler flow:**
1. `validateProjectPath(projectPath)` — existing guard
2. Resolve the absolute target path: `path.resolve(projectPath, filePath)`
3. Verify resolved path starts with `path.resolve(projectPath)` — path traversal guard
4. Check `filePath` against `PROTECTED_FILES` (exact match after normalization)
5. Check extension against `ALLOWED_EXTENSIONS`
6. `fs.ensureDir(path.dirname(resolvedPath))` — create intermediate dirs
7. `fs.writeFile(resolvedPath, content, 'utf-8')` — write content
8. Return success with `writtenPath` (project-relative) and file size

**Error response shape:** consistent with all existing tools:
```json
{ "status": "error", "message": "...", "suggestion": "..." }
```

**Protected file check logic:**

```typescript
const normalizedFilePath = path.normalize(filePath);
const isProtected = PROTECTED_FILES.some(
  (p) => path.normalize(p) === normalizedFilePath
);
if (isProtected) {
  throw new Error(
    `Cannot write to protected file: '${filePath}'. ` +
    `Protected files: ${PROTECTED_FILES.join(', ')}`
  );
}
```

### `read_file` Tool (`src/tools/read-file.ts`)

**Handler flow:**
1. `validateProjectPath(projectPath)`
2. Resolve absolute path, verify it starts with `path.resolve(projectPath)` — traversal guard
3. `fs.pathExists(resolvedPath)` — return clear error if file does not exist
4. `fs.readFile(resolvedPath, 'utf-8')` — read content
5. Return success with `content`, `filePath`, and `sizeBytes`

**No extension restriction on reads** — Claude may need to read `package.json`, template files, etc. The traversal guard and project-root containment check are the only restrictions.

### `add_overlay` Tool (`src/tools/add-overlay.ts`)

**Handler flow:**
1. `validateProjectPath(projectPath)`
2. Read composition from disk
3. Check for duplicate `overlayId` in `composition.overlays ?? []`
4. Resolve the component file path and verify it exists on disk (`fs.pathExists`)
5. Check `componentName` does not collide with any `sceneIdToComponentName(s.id)` in `composition.scenes`
6. Build the `Overlay` object
7. Push to `composition.overlays` (initialize array if undefined: `composition.overlays ??= []`)
8. `writeComposition(projectPath, composition)`
9. `regenerateRootTsx(projectPath, composition)`
10. Return success with the overlay entry and `next_steps`

**Component name collision check:**

```typescript
import { sceneIdToComponentName } from '../utils/file-ops.js';

const existingComponentNames = composition.scenes.map(s => sceneIdToComponentName(s.id));
if (existingComponentNames.includes(args.componentName)) {
  throw new Error(
    `componentName '${args.componentName}' collides with an existing scene component. ` +
    `Scene component names are derived from scene IDs. Choose a different name.`
  );
}
```

### `remove_overlay` Tool (`src/tools/remove-overlay.ts`)

**Handler flow:**
1. `validateProjectPath(projectPath)`
2. Read composition from disk
3. Find the overlay by `overlayId` — throw if not found
4. Capture the overlay's `file` path before removing
5. Splice the overlay from `composition.overlays`
6. `writeComposition(projectPath, composition)`
7. `regenerateRootTsx(projectPath, composition)`
8. If `deleteFile === true`, resolve the overlay file path and `fs.remove()` it
9. Return success with `removedOverlayId`, `fileDeleted`, `remainingOverlays`

### `regenerateRootTsx()` Updated Template

The full updated template string (replacing `src/utils/file-ops.ts:202-232`):

```typescript
const overlays = (composition.overlays ?? []).sort((a, b) => a.zIndex - b.zIndex);

const overlayImports = overlays
  .map((o) => `import { ${o.componentName} } from '../${o.file.replace(/\.tsx$/, '')}';`)
  .join('\n');

const overlayRenderBlocks = overlays
  .map((o) =>
    `      {/* Overlay: ${o.name} */}\n` +
    `      <AbsoluteFill style={{ zIndex: ${o.zIndex}, pointerEvents: 'none' as const }}>\n` +
    `        <${o.componentName} />\n` +
    `      </AbsoluteFill>`
  )
  .join('\n');

// AbsoluteFill (and Sequence for partial-duration overlays) added to remotion import when overlays are present
const hasPartialOverlays = overlays.some((o) => o.startFrame != null || o.endFrame != null);
const remotionImports = overlays.length > 0
  ? `import { Composition, Series, AbsoluteFill${hasPartialOverlays ? ', Sequence' : ''} } from 'remotion';`
  : `import { Composition, Series } from 'remotion';`;

const rootContent = `import React from 'react';
${remotionImports}
${hasAudio ? audioImport : ''}
${sceneImports}
${overlayImports}

// Auto-generated from composition.json — do not edit directly
export const RemotionRoot: React.FC = () => { ... };  // unchanged

const MainComposition: React.FC = () => {
  return (
    <>
      <Series>
${seriesEntries}
      </Series>${audioJsx}
${overlayRenderBlocks}
    </>
  );
};
`;
```

---

## `src/server.ts` Registration

Add a Phase 5 block to `src/server.ts` after the existing Phase 4 imports:

```typescript
// Phase 5 — Custom File Ops & Overlays
import { registerWriteFile } from './tools/write-file.js';
import { registerReadFile } from './tools/read-file.js';
import { registerAddOverlay } from './tools/add-overlay.js';
import { registerRemoveOverlay } from './tools/remove-overlay.js';
```

And inside `setupServer()`:

```typescript
// Phase 5
registerWriteFile(server);
registerReadFile(server);
registerAddOverlay(server);
registerRemoveOverlay(server);
```

This brings the total registered tool count from 13 to 17.

---

## Example End-to-End Workflow Claude Would Execute

After this feature ships, a Claude workflow for "bouncing ball overlay from a user screenshot" would be:

```
1. start_session
2. init_project
3. create_scene × N (existing flow unchanged)
4. write_file({
     projectPath,
     filePath: "src/overlays/BouncingBall.tsx",
     content: "import React from 'react'; import { useCurrentFrame, ... } ..."
   })
5. add_overlay({
     projectPath,
     overlayId: "overlay-bouncing-ball",
     name: "Bouncing Ball",
     componentName: "BouncingBall",
     file: "src/overlays/BouncingBall.tsx",
     zIndex: 20
   })
6. start_preview        ← overlay appears in Studio automatically
7. update_scene(...)    ← Root.tsx regenerated — overlay survives
8. render_video         ← overlay baked into final output
```

For a theme-file workflow:

```
1. write_file({ filePath: "src/utils/theme.ts", content: "export const colors = {...}" })
2. write_file({ filePath: "src/overlays/Watermark.tsx", content: "import { colors } from '../utils/theme'; ..." })
3. add_overlay({ ..., file: "src/overlays/Watermark.tsx" })
```

---

## Testing Strategy

- [ ] **Unit: `write_file` path traversal** — attempt `filePath: "../../etc/passwd"`, verify rejection
- [ ] **Unit: `write_file` protected files** — attempt each file in `PROTECTED_FILES`, verify each is rejected with the protected-file list in the error message
- [ ] **Unit: `write_file` disallowed extension** — attempt `.png`, `.js`, `.sh`, verify rejection
- [ ] **Unit: `write_file` valid write** — write `src/overlays/Test.tsx`, verify file exists at expected path and content matches
- [ ] **Unit: `read_file` traversal** — attempt `../../package.json` outside project root, verify rejection
- [ ] **Unit: `read_file` non-existent** — attempt to read a file that does not exist, verify informative error
- [ ] **Unit: `add_overlay` file-not-found** — pass a `file` path that doesn't exist, verify rejection before composition is modified
- [ ] **Unit: `add_overlay` component name collision** — register an overlay whose `componentName` matches a scene's generated component name, verify rejection
- [ ] **Unit: `add_overlay` duplicate id** — call `add_overlay` twice with the same `overlayId`, verify second call is rejected
- [ ] **Integration: overlay survives scene mutation** — `add_overlay`, then `create_scene`, then read `src/Root.tsx` and verify overlay import and render block are present
- [ ] **Integration: `remove_overlay` with `deleteFile: true`** — verify overlay is removed from `composition.json` and file is deleted from disk
- [ ] **Integration: `remove_overlay` with `deleteFile: false`** — verify overlay is removed from `composition.json` but file remains on disk
- [ ] **Integration: multiple overlays sorted by zIndex** — register overlays with `zIndex: 20` and `zIndex: 5`, verify `zIndex: 5` import appears before `zIndex: 20` in `Root.tsx`
- [ ] **End-to-end: Remotion Studio preview** — scaffolded project with one overlay compiles and opens in `npx remotion studio` without errors

---

## Rollout & Deployment

No feature flags needed — this is a pure tool addition. Existing tools are not modified in behavior.

The `overlays?` field is optional on `Composition`, so:
- Projects created by the current `init_project` (without `overlays: []`) will work correctly — `regenerateRootTsx()` defaults to `[]`
- Projects created after this change will have `overlays: []` in `composition.json` from the start

No migration steps required.

---

## Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Claude writes a file with a bad import path — overlay renders as blank in Studio | Medium | Medium | `add_overlay` verifies file exists; Claude should use `read_file` after `write_file` to verify content; Studio shows TypeScript errors in console |
| Path traversal bypasses project root containment check | High | Low | Use `path.resolve()` + prefix check (same pattern as `validateProjectPath`); tested explicitly in unit tests |
| `componentName` in `add_overlay` does not match the actual named export — TS compile error in scaffolded project | Medium | Medium | Document clearly in tool description; `read_file` after `write_file` lets Claude verify the export name |
| Overlay `file` path uses Windows-style backslashes, breaking the import statement in generated `Root.tsx` | Low | Low | Normalize `file` paths with `path.posix.normalize()` or replace `\` with `/` before writing to `composition.json` |
| Developer manually edits `src/Root.tsx` — changes are lost on next scene mutation | Low | Low (this is pre-existing behavior, not introduced by this change) | Document in debug guide; the overlay system is the correct mechanism for persistent adds |
| `AbsoluteFill` is missing from the `remotion` import when overlays are added to an existing `Root.tsx` | Medium | Low | The `remotionImports` variable in `regenerateRootTsx()` switches between two import strings based on `overlays.length > 0`; covered by integration test |

---

## Open Questions — Resolved

- [x] **`write_file` overwrite behavior?** — **WARN with explanation.** When the target file already exists, the tool should still overwrite it but include a warning in the response explaining that the previous file was replaced. This gives Claude context to mention the overwrite to the user if relevant.
- [x] **Partial-duration overlays?** — **YES, support both.** Overlays can be full-video-duration (e.g., a persistent logo/watermark) OR partial-duration with optional `startFrame`/`endFrame` (e.g., an animation object that appears for a specific segment). The `Overlay` interface should include optional `startFrame?: number` and `endFrame?: number` fields — when omitted, the overlay renders for the full video.
- [x] **`list_overlays` tool?** — **NO separate tool.** Extend `list_scenes` to also return the `overlays[]` array from `composition.json` alongside the scenes list.

---

## References

- Issue doc: `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md`
- `Composition` interface: `src/state/project-state.ts:5-36`
- `Scene` interface: `src/state/project-state.ts:38-52`
- `regenerateRootTsx()`: `src/utils/file-ops.ts:160-235`
- `validateProjectPath()`: `src/utils/file-ops.ts:12-32` — path safety pattern to reuse
- `writeSceneFile()`: `src/utils/file-ops.ts:145-153` — write pattern to follow
- `registerCreateScene`: `src/tools/create-scene.ts` — tool structure to follow
- `registerInitProject`: `src/tools/init-project.ts:95-124` — initial composition build to update
- `setupServer`: `src/server.ts:24-45` — where new tools are registered
- Remotion `AbsoluteFill` API: renders a `div` with `position: absolute; width: 100%; height: 100%; top: 0; left: 0`
