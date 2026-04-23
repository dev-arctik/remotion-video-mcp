# Issue: No Overlay or Custom Component Support in MCP Tools

**Date Reported:** 2026-02-26
**Status:** Resolved
**Type:** Bug Report
**Severity:** High
**Affected Area:** Backend
**Affected Component(s):** `regenerateRootTsx()`, `Composition` schema, MCP tool surface

---

## Problem

The MCP server has no mechanism for Claude to add custom React components or persistent global overlays to a Remotion video project. Any component written directly to the filesystem and any manual edit made to `Root.tsx` are silently destroyed the next time any scene-mutation tool is called.

**Expected:** Claude should be able to register a custom component (e.g., a bouncing ball animation) as a global overlay that renders on top of all scenes for the full video duration, and that registration should survive all subsequent scene operations.

**Actual:** There is no `write_component` tool, no `overlays` field in `composition.json`, and `regenerateRootTsx()` performs a full file replacement that discards any manually added imports or render calls in `Root.tsx`.

## Steps to Reproduce

1. Run the full pipeline: `start_session` → `init_project` → `create_scene` ×N → `start_preview`
2. Manually write a custom `.tsx` component (e.g., `BouncingBall.tsx`) to the project filesystem
3. Manually add the import and render call for `BouncingBall` into `src/Root.tsx`
4. Verify the overlay appears in the Remotion Studio preview
5. Call `update_scene` on any existing scene (even a no-op change)
6. Observe: `src/Root.tsx` is fully rewritten — the `BouncingBall` import and render call are gone

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `Composition` interface | `src/state/project-state.ts` | 5–36 | Defines the schema for `composition.json` — has `scenes[]` but no `overlays[]` field |
| `regenerateRootTsx()` | `src/utils/file-ops.ts` | 160–235 | Fully replaces `src/Root.tsx` on every call; reads only `scenes` and `audio` from `composition.json` — overlays have no representation here |
| `registerInitProject` | `src/tools/init-project.ts` | 95–124 | Builds the initial `Composition` object with `scenes: []` — no `overlays` field initialized |
| `registerUpdateScene` | `src/tools/update-scene.ts` | 74 | Calls `regenerateRootTsx()` unconditionally after every scene update |
| `registerCreateScene` | `src/tools/create-scene.ts` | 81 | Calls `regenerateRootTsx()` after writing each new scene |
| `registerDeleteScene` | `src/tools/delete-scene.ts` | 44 | Calls `regenerateRootTsx()` after removing a scene |
| `registerReorderScenes` | `src/tools/reorder-scenes.ts` | 48 | Calls `regenerateRootTsx()` after reordering |
| `registerUpdateComposition` | `src/tools/update-composition.ts` | 65 | Calls `regenerateRootTsx()` after any global settings change |
| `setupServer` | `src/server.ts` | 24–45 | Registers all 13 tools — no overlay tools present |

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `src/state/project-state.ts` — `Composition` interface | Confirmed: `scenes: Scene[]` at line 35 is the only array-type field. No `overlays` field exists. The `Scene` interface (lines 38–52) is scene-specific and has no overlay semantics. |
| `src/utils/file-ops.ts` — `regenerateRootTsx()` | Confirmed: function at line 160 destructures only `{ settings, scenes, audio }` from composition (line 164). Overlay data has no code path into this function. The generated file is written with `fs.writeFile` (line 234), which is a full replacement with no merge logic. |
| `src/tools/` — all 13 tool files | Confirmed: no tool named `write_component`, `add_overlay`, or `remove_overlay` exists. The only write path for `.tsx` files is `writeSceneFile()` in `file-ops.ts`, which is scoped to `scenes/` files only. |
| `src/tools/init-project.ts` — initial composition object | Confirmed: the `Composition` object built at lines 95–124 initializes `scenes: []` but has no `overlays` field. New projects start with no overlay support baked in. |
| Regeneration call sites | Confirmed: `regenerateRootTsx()` is called in 5 tools — `create_scene` (line 81), `update_scene` (line 74), `delete_scene` (line 44), `reorder_scenes` (line 48), `update_composition` (line 65) — plus `init_project` (line 129). Any one of these 6 calls destroys manual `Root.tsx` edits. |

### Root Cause

Three independent gaps compound into one blocking limitation:

1. **No write path for custom components.** The MCP tool surface has no mechanism to write arbitrary `.tsx` files into the project. `writeSceneFile()` (`file-ops.ts:144`) only handles files registered as scenes. Claude must write files directly to disk outside the MCP, which breaks the agent workflow.

2. **No overlay slot in `composition.json`.** The `Composition` interface (`project-state.ts:5`) has no `overlays[]` array. Without a persistence layer for overlay registrations, there is nowhere to store overlay metadata that survives across tool calls.

3. **`regenerateRootTsx()` does full replacement with no overlay awareness.** The function at `file-ops.ts:160` builds `Root.tsx` purely from `scenes` and `audio`. It calls `fs.writeFile` (line 234) to atomically overwrite the file. There is no mechanism to read back existing manual additions or merge them in. Since 5 scene-mutation tools all call this function, every scene operation is a destructive event for any manually-added overlay code.

## Proposed Fix

Three new tools and two code changes are needed:

**New tool: `write_component`** (`src/tools/write-component.ts`)
Accepts a file path (relative to project root) and full `.tsx` file content. Writes the file to disk. Must include path traversal protection and a protected-file list that prevents overwriting `composition.json`, `src/Root.tsx`, and `src/SceneRenderer.tsx`. No schema change required.

**New tool: `add_overlay`** (`src/tools/add-overlay.ts`)
Accepts an overlay ID, display name, component name, file path (relative to project root), and optional z-index. Verifies the component file exists on disk. Checks for component name collisions with existing scene component names. Appends an entry to a new `overlays[]` array in `composition.json` and calls `regenerateRootTsx()` so the overlay is immediately rendered.

**New tool: `remove_overlay`** (`src/tools/remove-overlay.ts`)
Accepts an overlay ID. Removes the matching entry from `overlays[]` in `composition.json` and calls `regenerateRootTsx()`. Optionally accepts a flag to also delete the `.tsx` file from disk.

**Schema change** (`src/state/project-state.ts`)
Add a new `Overlay` interface and an optional `overlays?: Overlay[]` field to the `Composition` interface. Suggested shape:
```ts
export interface Overlay {
  id: string;
  name: string;
  componentName: string; // must match the named export in the .tsx file
  file: string;          // relative path from project root, e.g. "src/BouncingBall.tsx"
  zIndex?: number;       // render order; higher = on top; default 10
}
```

**Update `regenerateRootTsx()`** (`src/utils/file-ops.ts:160`)
Read `overlays` from the composition. Generate a static import for each overlay component. After the `<Series>` and audio blocks in `MainComposition`, render each overlay inside an `<AbsoluteFill>` with `style={{ zIndex: overlay.zIndex ?? 10 }}`. Because overlay data now lives in `composition.json`, all 6 regeneration call sites automatically produce correct output with no further changes.

**Update `init_project`** (`src/tools/init-project.ts:95`)
Add `overlays: []` to the initial `Composition` object so new projects have a valid empty overlays array from the start.

## Related

- Files: `src/state/project-state.ts`, `src/utils/file-ops.ts`, `src/server.ts`, `src/tools/init-project.ts`, `src/tools/update-scene.ts`, `src/tools/create-scene.ts`, `src/tools/delete-scene.ts`, `src/tools/reorder-scenes.ts`, `src/tools/update-composition.ts`
- Detailed implementation plan: `/Users/devanshraj/.claude/plans/swirling-snuggling-hennessy.md`

---

## Resolution

**Resolved in:** Phase 5 (commit: custom file ops + overlay system)
**Resolved on:** 2026-03-02

All three root-cause gaps were addressed:

**1. write_file and read_file tools** (`src/tools/write-file.ts`, `src/tools/read-file.ts`):
Claude can now write arbitrary `.tsx`, `.ts`, `.css`, or `.json` files into the project. Protected files (`composition.json`, `src/Root.tsx`, `src/SceneRenderer.tsx`, `package.json`, `tsconfig.json`, `remotion.config.ts`, `src/index.ts`) cannot be overwritten — an explicit error is returned. `read_file` has no extension restriction and a traversal guard.

**2. overlays[] field on Composition** (`src/state/project-state.ts:57`):
The `Overlay` interface was added (`src/state/project-state.ts:79–88`) and `overlays?: Overlay[]` was added to the `Composition` interface. The `?` makes it backward-compatible — existing projects without the field are treated as `[]`. `init_project` now writes `overlays: []` in the initial composition object.

**3. regenerateRootTsx() overlay-awareness** (`src/utils/file-ops.ts:134`):
The function now reads `composition.overlays`, sorts them by `zIndex` ascending, generates static imports, and emits `<AbsoluteFill>` render blocks after the scene series and audio. Partial-duration overlays (`startFrame`/`endFrame` set) are wrapped in `<Sequence>`. `AbsoluteFill` and `Sequence` are conditionally added to the `remotion` import only when needed. Because all 6 regeneration call sites (create_scene, update_scene, delete_scene, reorder_scenes, update_composition, add_overlay) pass through this function, overlays persist through all scene mutations.

**4. add_overlay and remove_overlay tools** (`src/tools/add-overlay.ts`, `src/tools/remove-overlay.ts`):
`add_overlay` verifies the component file exists on disk before modifying `composition.json`, checks for `overlayId` and `componentName` collisions, then writes composition and calls `regenerateRootTsx`. `remove_overlay` splices the entry and optionally deletes the file from disk (`deleteFile: true`).

For the full flow, see `docs/feature_flow/custom-file-ops-and-overlays-flow.md`.
