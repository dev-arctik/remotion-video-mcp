# Flow: Custom File Ops and Overlay System

**Last Updated:** 2026-04-23
**Status:** Active
**Type:** End-to-End Flow

---

## Overview

Five tools — `write_file`, `read_file`, `add_overlay`, `remove_overlay`, and `regenerate_root` — give Claude the ability to write arbitrary code into a Remotion project and register components as persistent global overlays. Overlays survive all scene mutations because they are stored in `composition.json` and regenerated into `Root.tsx` on every scene operation.

This system shipped in Phase 5. It closed three compounding gaps: no write path for custom components, no persistence layer for overlays, and a `regenerateRootTsx()` that discarded manual edits on every scene change.

---

## Architecture

```
composition.json (source of truth)
├── scenes[]           ← existing
├── audio              ← existing
└── overlays[]         ← Overlay[] — persisted here

Claude MCP Tool Calls
├── write_file         → writes arbitrary .tsx/.ts/.css/.json to project disk
├── read_file          → reads any project file back to Claude
├── add_overlay        → appends to overlays[], calls regenerateRootTsx()
└── remove_overlay     → removes from overlays[], calls regenerateRootTsx()

regenerateRootTsx()    src/utils/file-ops.ts:134
└── src/Root.tsx       ← generated — includes overlay imports + AbsoluteFill blocks
```

`list_scenes` also returns `overlays[]` alongside the scenes array so Claude always has a view of registered overlays.

---

## write_file Tool

**File:** `src/tools/write-file.ts`
**Purpose:** Write any `.tsx`, `.ts`, `.css`, or `.json` file to the project.

### Handler Flow

1. `validateProjectPath(projectPath)` — `src/utils/file-ops.ts:12`
2. Resolve absolute target path: `path.resolve(projectPath, filePath)`
3. Verify resolved path starts with `path.resolve(projectPath)` — path traversal guard
4. Check `filePath` against `PROTECTED_FILES` (exact match after normalization)
5. Check extension against `ALLOWED_EXTENSIONS`
6. `fs.ensureDir(path.dirname(resolvedPath))` — create intermediate dirs automatically
7. `fs.writeFile(resolvedPath, content, 'utf-8')`
8. Return success with `writtenPath` and file size

### Protected Files

These paths can never be overwritten by `write_file`. The tool returns an explicit error with the full list when a protected path is attempted:

```
composition.json
src/Root.tsx
src/SceneRenderer.tsx
package.json
tsconfig.json
remotion.config.ts
src/index.ts
```

### Allowed Extensions

```
.tsx  .ts  .css  .json
```

Binary assets (images, audio, fonts) go through `import_asset` instead.

---

## read_file Tool

**File:** `src/tools/read-file.ts`
**Purpose:** Read any file in the project back to Claude before editing.

### Handler Flow

1. `validateProjectPath(projectPath)`
2. Resolve absolute path, verify it starts with `path.resolve(projectPath)` — traversal guard
3. `fs.pathExists(resolvedPath)` — clear error if file does not exist
4. `fs.readFile(resolvedPath, 'utf-8')` — return full UTF-8 content

No extension restriction on reads — Claude may need to read `package.json`, template files, or any other project file. The traversal guard is the only restriction.

---

## add_overlay Tool

**File:** `src/tools/add-overlay.ts`
**Purpose:** Register a component file as a persistent global overlay.

### Handler Flow

1. `validateProjectPath(projectPath)`
2. Read composition from disk
3. `composition.overlays ??= []` — initialize if missing (pre-existing projects)
4. Check for duplicate `overlayId`
5. Verify the component file exists on disk (`fs.pathExists`)
6. Check `componentName` doesn't collide with any existing scene or overlay component name
7. Validate `startFrame < endFrame` if both provided
8. Build the `Overlay` object and push to `composition.overlays`
9. `writeComposition(projectPath, composition)`
10. `regenerateRootTsx(projectPath, composition)` — Root.tsx immediately reflects the new overlay

### Overlay Interface

Defined in `src/state/project-state.ts:79–88`:

```typescript
export interface Overlay {
  id: string;            // unique kebab-case ID, e.g. "overlay-bouncing-ball"
  name: string;          // human-readable label
  componentName: string; // named export in the .tsx file — must match exactly
  file: string;          // project-relative path, e.g. "src/overlays/BouncingBall.tsx"
  zIndex: number;        // render order — higher renders on top; default 10
  startFrame?: number;   // omit for full-video-duration
  endFrame?: number;     // omit for full-video-duration
}
```

`overlays?: Overlay[]` is an optional field on `Composition` (`src/state/project-state.ts:57`), so projects created before this feature shipped are handled transparently.

---

## remove_overlay Tool

**File:** `src/tools/remove-overlay.ts`
**Purpose:** Deregister an overlay from the composition.

### Handler Flow

1. `validateProjectPath(projectPath)`
2. Read composition from disk
3. Find the overlay by `overlayId` — error if not found
4. Capture the overlay's `file` path before removing
5. Splice the overlay from `composition.overlays`
6. `writeComposition` then `regenerateRootTsx`
7. If `deleteFile === true`, resolve the overlay file path and `fs.remove()` it

---

## regenerateRootTsx() — Overlay-Aware Generation

**File:** `src/utils/file-ops.ts:134`

This function is called by every scene-mutation tool (create, update, delete, reorder, update_composition) AND by `add_overlay` and `remove_overlay`. Because overlay data lives in `composition.json`, ALL regeneration paths automatically emit the correct overlays.

### Overlay Processing

```typescript
// src/utils/file-ops.ts:139
const overlays = (composition.overlays ?? []).sort((a, b) => a.zIndex - b.zIndex);
```

Overlays are sorted by `zIndex` ascending before generating imports and render blocks. Higher `zIndex` → rendered on top in CSS stacking.

### Generated Overlay Imports

```typescript
// src/utils/file-ops.ts:186–188
const overlayImports = overlays
  .map((o) => `import { ${o.componentName} } from '../${o.file.replace(/\.tsx$/, '')}';`)
  .join('\n');
```

### Generated Overlay Render Blocks

Full-duration overlays (no `startFrame`/`endFrame`):

```tsx
{/* Overlay: Bouncing Ball — full duration */}
<AbsoluteFill style={{ zIndex: 10, pointerEvents: 'none' as const }}>
  <BouncingBall />
</AbsoluteFill>
```

Partial-duration overlays are wrapped in `<Sequence>`:

```tsx
{/* Overlay: Intro Logo (frames 0–60) */}
<Sequence from={0} durationInFrames={60}>
  <AbsoluteFill style={{ zIndex: 10, pointerEvents: 'none' as const }}>
    <IntroLogo />
  </AbsoluteFill>
</Sequence>
```

`pointerEvents: 'none'` is intentional — overlays are visual elements and should not block mouse events in Remotion Studio preview.

### Remotion Imports (Dynamic)

`AbsoluteFill` and `Sequence` are only added to the `remotion` import when needed:

```typescript
// src/utils/file-ops.ts:209–215
if (overlays.length > 0) remotionImportParts.push('AbsoluteFill');
if (hasPartialOverlays) remotionImportParts.push('Sequence');
```

---

## End-to-End Workflow

```
1. start_session + init_project + create_scene × N

2. write_file({
     filePath: "src/overlays/BouncingBall.tsx",
     content: "import React from 'react'; ..."
   })
   → file written to disk

3. add_overlay({
     overlayId: "overlay-bouncing-ball",
     name: "Bouncing Ball",
     componentName: "BouncingBall",
     file: "src/overlays/BouncingBall.tsx",
     zIndex: 20
   })
   → composition.overlays updated
   → Root.tsx regenerated with import + AbsoluteFill block

4. start_preview
   → overlay appears in Studio immediately via HMR

5. update_scene(...)
   → Root.tsx regenerated again — overlay SURVIVES

6. render_video
   → overlay baked into final output
```

---

## Theme File Workflow (Alternative)

`write_file` is not limited to overlay components. A common pattern is writing shared theme utilities:

```
write_file({ filePath: "src/utils/theme.ts",
             content: "export const colors = { primary: '#FF0000' }" })

write_file({ filePath: "src/overlays/Watermark.tsx",
             content: "import { colors } from '../utils/theme'; ..." })

add_overlay({ file: "src/overlays/Watermark.tsx", ... })
```

---

## Error Scenarios

| Tool | Condition | Error |
|------|-----------|-------|
| `write_file` | Protected file | `"Cannot write to protected file: 'src/Root.tsx'. Protected files: ..."` |
| `write_file` | Disallowed extension | `"Extension '.sh' not allowed. Allowed: .tsx, .ts, .css, .json"` |
| `write_file` | Path traversal | `"File path must not contain '..'..."` |
| `add_overlay` | Component file not found | `"Component file not found: '...'. Use write_file to create it first."` |
| `add_overlay` | Duplicate overlay ID | `"Overlay '...' already exists. Use remove_overlay first, then re-add."` |
| `add_overlay` | componentName collision | `"componentName '...' collides with an existing scene component..."` |

---

## Related Docs

- `docs/feature_flow/usage-guide.md` — full end-to-end usage flow
- `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md` — original issue this resolved
- `src/state/project-state.ts:79–88` — `Overlay` interface definition
- `src/utils/file-ops.ts:134` — `regenerateRootTsx()` overlay processing
