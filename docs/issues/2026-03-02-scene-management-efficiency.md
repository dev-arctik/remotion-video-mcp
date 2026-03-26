# Issue: Scene Management Efficiency Improvements

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** High
**Affected Area:** Backend
**Affected Component(s):** `delete_scene` tool, `create_scene` tool, `update_scene` tool

---

## Problem

Three related inefficiencies in the scene management tools force Claude to make unnecessary sequential tool calls, produce invalid filenames with spaces, and omit useful data from responses. Bundled here because all three affect the same two files and share a fix window.

---

## Issue 1: No Batch Scene Operations (P1)

**Expected:** `delete_scene` and `create_scene` accept arrays so multiple scenes can be created or deleted in a single tool call.

**Actual:** Both tools accept only one scene at a time. Deleting 11 scenes requires 11 sequential MCP round trips. Each round trip has LLM interaction latency — this compounds significantly for large projects.

### Steps to Reproduce

1. Scaffold a project and create 11 scenes via `create_scene`.
2. Attempt to delete all 11 scenes in a single `delete_scene` call — fails; only `sceneId: string` is accepted.
3. Issue 11 separate `delete_scene` calls to complete the operation.

### Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerDeleteScene` | `src/tools/delete-scene.ts` | 15–18 | Input schema only accepts `sceneId: z.string()`, no array variant |
| `registerCreateScene` | `src/tools/create-scene.ts` | 16–32 | Input schema accepts one scene worth of fields, no `scenes[]` batch input |
| `recalculateStartFrames` | `src/state/project-state.ts` | 86–93 | Recalculates startFrames across the whole array — already batch-safe, no changes needed here |

### Root Cause

The Zod input schemas in both tools were designed for single-scene operations. `delete_scene` at `src/tools/delete-scene.ts:17` declares `sceneId: z.string()`, and `create_scene` at `src/tools/create-scene.ts:16–32` accepts flat per-scene fields — neither provides an array input path.

### Proposed Fix

**`delete_scene`** — accept a union of single string or array, plus a `deleteAll` escape hatch:

```ts
// src/tools/delete-scene.ts — updated inputSchema
inputSchema: z.object({
  projectPath: z.string(),
  sceneId: z.string().optional().describe('Single scene ID to delete'),
  sceneIds: z.array(z.string()).optional().describe('Multiple scene IDs to delete in one call'),
  deleteAll: z.boolean().optional().describe('When true, deletes all scenes in the project'),
}),
```

Handler logic: resolve `deleteAll` → all IDs, else merge `sceneIds` + `[sceneId]` into a deduplicated list, then loop the existing file-remove + splice logic, call `recalculateStartFrames` once after all deletions, and write `composition.json` + regenerate `Root.tsx` once.

**`create_scene`** — accept a `scenes` array for batch creation:

```ts
// src/tools/create-scene.ts — updated inputSchema
inputSchema: z.object({
  projectPath: z.string(),
  scenes: z.array(z.object({
    sceneId: z.string(),
    sceneName: z.string(),
    sceneType: z.enum([...]),
    durationFrames: z.number(),
    audioSegmentIds: z.array(z.string()).optional(),
    transition: z.object({ ... }).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    objects: z.array(z.record(z.string(), z.unknown())).optional(),
  })),
}),
```

Handler logic: validate all IDs for duplicates upfront, push all entries to `composition.scenes`, call `recalculateStartFrames` once, write `composition.json` once, generate all `.tsx` files, regenerate `Root.tsx` once.

---

## Issue 2: Scene File Naming With Spaces (P1)

**Expected:** Scene `.tsx` filenames use kebab-case with no spaces, regardless of what the user passes as `sceneName`.

**Actual:** The filename is built by concatenating `sceneId` and `sceneName` directly with no sanitization. A `sceneName` of `"Setup Tools"` produces `scenes/scene-003-Setup Tools.tsx` — a filename with a literal space.

### Steps to Reproduce

1. Call `create_scene` with `sceneId: "scene-003"`, `sceneName: "Setup Tools"`.
2. Observe `composition.json` entry: `"file": "scenes/scene-003-Setup Tools.tsx"`.
3. Verify the file on disk contains a space in its name.
4. Attempt `npx remotion studio` — TypeScript import resolution may fail depending on shell/OS escaping.

The same bug exists in `update_scene` when `sceneName` is changed: `update-scene.ts:61` runs the same unescaped concatenation.

### Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerCreateScene` | `src/tools/create-scene.ts` | 58 | `file: \`scenes/${args.sceneId}-${args.sceneName}.tsx\`` — no sanitization |
| `registerUpdateScene` | `src/tools/update-scene.ts` | 61 | `updated.file = \`scenes/${args.sceneId}-${args.sceneName}.tsx\`` — same pattern |

### Root Cause

Both files construct the filesystem path directly from user-supplied `sceneName` without any normalization step. The `name` field stored in `composition.json` (the human-readable display label) is correct, but the `file` path inherits the raw string including any spaces, capital letters, or special characters.

### Proposed Fix

Introduce a `toSafeFilename` helper (or inline the transform at both call sites) that kebab-cases the name before building the path:

```ts
// Sanitize sceneName to a safe filename segment
const safeFilename = args.sceneName
  .toLowerCase()
  .replace(/\s+/g, '-')      // spaces → hyphens
  .replace(/[^a-z0-9-]/g, ''); // strip anything that isn't alphanumeric or hyphen

// src/tools/create-scene.ts:58 — updated
file: `scenes/${args.sceneId}-${safeFilename}.tsx`,

// src/tools/update-scene.ts:61 — updated
updated.file = `scenes/${args.sceneId}-${safeFilename}.tsx`;
```

The `name` field in `composition.json` is set from `args.sceneName` unchanged, so the display name stays human-readable. Only the `file` path uses the sanitized form.

**Migration note:** existing projects with space-containing filenames in `composition.json` will have stale `file` references. A one-time migration step or a `fix_composition` tool may be needed for projects created before this fix ships.

---

## Issue 3: `create_scene` Should Return Updated Scene List (P2)

**Expected:** The `create_scene` success response includes the full updated scene list with recalculated `startFrame` values, so Claude has everything it needs to reason about the timeline without an additional `list_scenes` call.

**Actual:** The response at `src/tools/create-scene.ts:83–94` only returns `{ status, sceneId, file, durationFrames, totalScenes, next_steps }`. Claude must follow up with `list_scenes` to see updated `startFrame` values for all scenes — an extra round trip.

### Steps to Reproduce

1. Call `create_scene` on a project with 3 existing scenes.
2. Inspect the response — `totalScenes: 4` is returned, but no scene list or `startFrame` data.
3. Claude must call `list_scenes` to determine where the new scene starts in the timeline.

### Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerCreateScene` — response block | `src/tools/create-scene.ts` | 83–94 | Returns partial summary only; omits the updated `scenes[]` array |
| `recalculateStartFrames` | `src/state/project-state.ts` | 86–93 | Already returns the fully updated array with correct `startFrame` on each scene — the data is in scope, just not returned |

### Root Cause

The response was written conservatively to keep payload size small. However, because `recalculateStartFrames` is already called at line 71 and the updated `composition.scenes` array is in scope, returning it costs nothing extra computationally — it just wasn't included.

### Proposed Fix

Extend the success response to include the updated scene list:

```ts
// src/tools/create-scene.ts:83–94 — updated response
return {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      status: 'success',
      sceneId: args.sceneId,
      file: newScene.file,
      durationFrames: args.durationFrames,
      totalScenes: composition.scenes.length,
      scenes: composition.scenes.map(s => ({
        id: s.id,
        name: s.name,
        startFrame: s.startFrame,
        durationFrames: s.durationFrames,
      })),
      next_steps: 'Check the preview if running, or call start_preview to see the scene.',
    }, null, 2),
  }],
};
```

The same pattern should be applied to `delete_scene` and `update_scene` for consistency, though that is a lower-priority follow-on.

---

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `delete_scene` input schema (`src/tools/delete-scene.ts:15–18`) | Confirmed: only `sceneId: z.string()` — no array support |
| `create_scene` input schema (`src/tools/create-scene.ts:16–32`) | Confirmed: flat per-scene fields, no `scenes[]` array path |
| `create_scene` file path construction (`src/tools/create-scene.ts:58`) | Confirmed: `scenes/${args.sceneId}-${args.sceneName}.tsx` — no sanitization |
| `update_scene` file path construction (`src/tools/update-scene.ts:61`) | Confirmed: same pattern `scenes/${args.sceneId}-${args.sceneName}.tsx` |
| `create_scene` response shape (`src/tools/create-scene.ts:83–94`) | Confirmed: returns only `totalScenes`, not the full updated `scenes[]` |
| `recalculateStartFrames` (`src/state/project-state.ts:86–93`) | Confirmed: already batch-safe, returns full updated array — no changes needed |

---

## Related

- Files: `src/tools/delete-scene.ts`, `src/tools/create-scene.ts`, `src/tools/update-scene.ts`, `src/state/project-state.ts`
- Related issues: `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md`
