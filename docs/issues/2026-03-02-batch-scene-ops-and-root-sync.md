# Issue: Batch Within-Scene Operations + Root.tsx Sync Friction

**Date Reported:** 2026-03-02
**Status:** Identified
**Type:** Bug Report
**Severity:** Medium
**Affected Area:** Backend
**Affected Component(s):** `update_scene` tool, `write_file` tool, `update_composition` tool, `regenerate_root` tool, `regenerateRootTsx()` utility

---

## Problem

Two related friction points surfaced during a 12-scene video build. Neither is a hard blocker (unlike the protected-file catch-22 or broken batch delete) but both caused significant unnecessary tool call overhead.

**Expected:** Batch-applying a code change across many scene files should be possible in a single MCP call. `update_composition` should reliably sync Root.tsx on every call.

**Actual:**
- Applying a `BeatEnergy` component import + render block across 12 scenes required 20 sequential `write_file` calls across 2 LLM rounds — no batch variant exists for within-scene code changes.
- `update_composition` appeared to regenerate `Root.tsx` with stale scene durations on at least one occasion, requiring the user to manually rewrite `Root.tsx` twice and work around a write conflict on `composition.json`.

---

## Issue 1: No Batch Within-Scene Operations (P2)

**Expected:** A single tool call can apply a code transformation — e.g. add an import and a JSX element — to multiple scene `.tsx` files at once.

**Actual:** Only three paths exist for writing to scene `.tsx` files, and none support batching across existing scenes:

| Tool | Batch support | Scope |
|------|--------------|-------|
| `update_scene` | No — single `sceneId: z.string()` | Updates metadata + optional `componentCode` rewrite for ONE scene |
| `write_file` | No — single `filePath: z.string()` | Writes ONE file per call |
| `add_overlay` | N/A — not a scene-level tool | Renders ON TOP of all scenes via Root.tsx; cannot inject code inside scene files |

The `create_scene` tool already has batch support (the `scenes[]` array added in the scene-management-efficiency fix). `update_scene` was not given the same treatment.

### Steps to Reproduce

1. Build a 12-scene video with custom `componentCode` scenes.
2. Decide to add `import { BeatEnergy } from '../src/overlays/BeatEnergy'` and `<BeatEnergy />` to every scene.
3. Attempt to do this in a single `update_scene` call — fails; `sceneId` accepts only one string.
4. Fall back to 12 separate `update_scene` (or `write_file`) calls — each is a full MCP round trip with LLM interaction latency.
5. In practice: 10 scenes updated in round 1, 10 more edits (import + JSX restructure) in round 2 = 20 sequential calls total.

### Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerUpdateScene` — inputSchema | `src/tools/update-scene.ts` | 17–37 | `sceneId: z.string()` — no array variant; entire handler is wired to one scene index |
| `registerUpdateScene` — scene lookup | `src/tools/update-scene.ts` | 44–48 | `findIndex` by single `args.sceneId` — would need to loop for batch |
| `registerUpdateScene` — `componentCode` write | `src/tools/update-scene.ts` | 76–82 | Writes to `updated.file` — this is the fast path that a batch variant would loop over |
| `registerWriteFile` — inputSchema | `src/tools/write-file.ts` | 31–39 | Single `filePath: z.string()` and `content: z.string()` — no array input |
| `registerWriteFile` — write call | `src/tools/write-file.ts` | 87 | `fs.writeFile(resolvedPath, args.content, 'utf-8')` — one file per invocation |
| `registerAddOverlay` — description | `src/tools/add-overlay.ts` | 13–18 | Explicitly "renders on top of scenes" — overlay system is not a substitute for within-scene injection |

### Root Cause

`update_scene` was designed as a single-scene metadata editor with an optional `componentCode` escape hatch. The schema at `src/tools/update-scene.ts:17–37` models one scene worth of inputs. The batch creation pattern introduced in `create_scene` (`scenes: z.array(sceneEntrySchema).min(1)`) was not mirrored in `update_scene`.

`write_file` is intentionally a single-file writer (`filePath: z.string()` at line 33) — its design predates the multi-scene batch use case.

### Proposed Fix — Three Options

**Option A — Add batch support to `update_scene`:**

Introduce an optional `scenes` array alongside the existing single-scene fields, so Claude can batch updates with or without `componentCode`:

```ts
// src/tools/update-scene.ts — updated inputSchema
inputSchema: z.object({
  projectPath: z.string(),
  // Single-scene fast path (backward compatible)
  sceneId: z.string().optional(),
  componentCode: z.string().optional(),
  // ... other single-scene fields ...

  // Batch path
  scenes: z.array(z.object({
    sceneId: z.string(),
    componentCode: z.string().optional(),
    sceneName: z.string().optional(),
    durationFrames: z.number().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    objects: z.array(z.record(z.string(), z.unknown())).optional(),
  })).optional(),
}),
```

Handler logic: if `scenes` is present, loop over all entries applying the same update logic, call `recalculateStartFrames` once at the end, write `composition.json` once, regenerate `Root.tsx` once.

**Option B — Add a `batch_write_files` tool (recommended for versatility):**

Accept an array of `{ filePath, content }` pairs — applies the same security guards as `write_file` to each entry:

```ts
// src/tools/batch-write-files.ts — new tool
inputSchema: z.object({
  projectPath: z.string(),
  files: z.array(z.object({
    filePath: z.string(),
    content: z.string(),
  })).min(1).describe('Array of files to write. Same rules as write_file: no protected files, allowed extensions only.'),
}),
```

This is strictly more general than Option A — it handles the scene-code-rewrite case AND any other multi-file operation (e.g., writing 12 custom overlay files in one call). The protected-file list check and extension validation from `write-file.ts:42–80` must be applied per entry.

**Option C — Extend the overlay system for within-scene injection:**

Add a "scene-level injection" concept: a component registered once that is automatically imported and rendered inside every scene's `<AbsoluteFill>`. This is architecturally cleaner for use cases like `BeatEnergy` that genuinely should appear in every scene uniformly.

Requires changes to `regenerateRootTsx()` in `src/utils/file-ops.ts` (currently lines 160–269) to pass injected components down through `SceneRenderer.tsx`, or to `generateSceneTsx()` (lines 106–142) to embed the import + render in every generated scene file.

**Recommendation:** Option B is the simplest implementation and highest versatility gain. Option A is the right long-term design for the `update_scene` tool. Option C is architecturally elegant but the most complex — worth considering only after A or B ships.

---

## Issue 2: Root.tsx / composition.json Sync Issues (P3)

**Expected:** Calling `update_composition` always writes `composition.json` first, then regenerates `Root.tsx` from the freshly written file. The user never sees stale data in `Root.tsx` after a successful `update_composition` call.

**Actual:** The user reported:
1. Called `update_composition` to change scene durations → `Root.tsx` was regenerated with OLD durations.
2. Had to manually rewrite `Root.tsx` twice to recover.
3. Encountered write conflicts on `composition.json`.

### Steps to Reproduce

1. Set up a project with several scenes.
2. Call `update_composition` to change `settings.fps` or a scene's `durationFrames` (note: `update_composition` cannot change per-scene durations — that requires `update_scene`. If the user passed scene durations here expecting them to apply, that is an undocumented limitation gap).
3. Inspect `Root.tsx` — depending on race condition or misuse, durations may not reflect the intended values.
4. Call `regenerate_root` — observe whether `Root.tsx` now matches `composition.json` state on disk.

### Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerUpdateComposition` — write order | `src/tools/update-composition.ts` | 70–72 | `writeComposition` (line 70) is called before `regenerateRootTsx` (line 72) — write order is correct in current code |
| `regenerateRootTsx` — parameter source | `src/utils/file-ops.ts` | 160–163 | Takes `composition: Composition` as a parameter — uses the in-memory object passed by the caller, NOT a fresh disk read |
| `readComposition` | `src/state/project-state.ts` | 68–72 | Reads `composition.json` from disk with `fs.readJson` — stateless, no caching |
| `writeComposition` | `src/state/project-state.ts` | 74–82 | Writes to disk with `fs.writeJson` — updates `metadata.updatedAt` on every call |
| `registerRegenerateRoot` — disk re-read | `src/tools/regenerate-root.ts` | 22–23 | Calls `readComposition(projectPath)` fresh from disk before regenerating — correct behavior |
| `registerUpdateComposition` — `next_steps` | `src/tools/update-composition.ts` | 86 | `'Check the preview to see global changes applied.'` — does not mention `regenerate_root` as a recovery option |

### Investigation Notes

| Checked | Outcome |
|---------|---------|
| `update_composition` write order (`src/tools/update-composition.ts:70–72`) | Write order is correct in current code: `writeComposition` is awaited at line 70, then `regenerateRootTsx` is called at line 72 with the same in-memory `composition` object. No write-before-generate race exists at this level. |
| `regenerateRootTsx` parameter source (`src/utils/file-ops.ts:160`) | The function signature is `regenerateRootTsx(projectPath: string, composition: Composition)`. It uses the caller-supplied `composition` object directly — it does NOT re-read from disk. If the caller passes a stale or partially-mutated object, the output reflects that stale state. |
| `update_composition` scope (`src/tools/update-composition.ts:57–68`) | Confirmed: `update_composition` only merges `settings`, `style`, `audio`, and `metadata` — it cannot change per-scene `durationFrames`. If the user believed they were setting scene durations here, the composition object passed to `regenerateRootTsx` at line 72 would have the correct global settings but unchanged scene durations — consistent with the "old durations" symptom. |
| `regenerate_root` disk re-read (`src/tools/regenerate-root.ts:22`) | Calls `readComposition(projectPath)` — always reads from disk. This is the correct escape hatch when the in-memory object diverges from disk state. |

### Root Cause

Two contributing factors:

1. **Tool scope mismatch:** `update_composition` controls global settings, not per-scene durations. If the user passed scene duration data expecting it to apply, the tool silently ignored those fields (Zod strips unknown keys). The `Root.tsx` then reflects the unchanged per-scene durations from `composition.json` — which were never updated. This looks like a sync bug but is actually an undocumented scope boundary.

2. **`regenerateRootTsx` uses the in-memory object, not a disk re-read:** At `src/utils/file-ops.ts:160`, the function operates on the `composition` parameter passed by the caller. If there is any divergence between the in-memory state and `composition.json` on disk (e.g., concurrent tool calls, a partially-failed earlier write), `regenerateRootTsx` will silently generate `Root.tsx` from the stale in-memory view. The `regenerate_root` tool avoids this by always re-reading from disk first (line 22 of `src/tools/regenerate-root.ts`).

3. **`next_steps` does not surface `regenerate_root` as a recovery option:** The `update_composition` success response at line 86 says only "Check the preview" — no mention of `regenerate_root` as a follow-up when something looks wrong.

### Proposed Fix

1. **Clarify `update_composition` tool description** — add a note that per-scene `durationFrames` must be changed via `update_scene`, not `update_composition`. This prevents the most common cause of the "stale durations" symptom.

2. **Update `next_steps` in `update_composition` response** (`src/tools/update-composition.ts:86`) — mention `regenerate_root` as the recovery path if `Root.tsx` looks out of sync:

   ```ts
   next_steps: 'Check the preview to see global changes applied. If Root.tsx looks out of sync, call regenerate_root to rebuild it from composition.json.',
   ```

3. **Consider making `regenerateRootTsx` always re-read from disk** (`src/utils/file-ops.ts:160`) — change the signature to take only `projectPath` and always call `readComposition` internally. This eliminates the class of bugs where a caller passes a stale in-memory object:

   ```ts
   // src/utils/file-ops.ts — proposed signature change
   export async function regenerateRootTsx(projectPath: string): Promise<void> {
     const composition = await readComposition(projectPath);
     // ... rest of the function unchanged
   }
   ```

   All callers currently pass a freshly-read `composition` object anyway, so this change would not cause regressions — it would only add a redundant (but defensive) disk read. The tradeoff is one extra `fs.readJson` call per scene mutation; acceptable given the correctness guarantee.

4. **Add a dry-run mode to `regenerate_root`** — `regenerate_root` could accept a `dryRun: boolean` flag that returns the would-be `Root.tsx` content as a string without writing to disk. This lets the user (or Claude) verify correctness before applying.

---

## Related

- Files: `src/tools/update-scene.ts`, `src/tools/write-file.ts`, `src/tools/add-overlay.ts`, `src/tools/update-composition.ts`, `src/tools/regenerate-root.ts`, `src/utils/file-ops.ts`, `src/state/project-state.ts`
- Related issues: `docs/issues/2026-03-02-protected-file-catch-22.md`, `docs/issues/2026-03-02-scene-management-efficiency.md`

---

## Status Note (2026-04-23)

**Issue 1 (batch `update_scene`):** Still open. `update_scene` at `src/tools/update-scene.ts` still accepts a single `sceneId: z.string()` — no batch variant has been added. The workaround for multi-scene code changes is multiple sequential `write_file` calls (each writing a full scene file) or registering a global overlay via `add_overlay` for effects that apply to all scenes uniformly.

**Issue 2 (Root.tsx sync):** Substantially addressed. The `regenerate_root` recovery tool (`src/tools/regenerate-root.ts`) has been available since Phase 6 and always re-reads `composition.json` from disk before regenerating — providing a reliable escape hatch. The `update_composition` `next_steps` guidance should still be updated to mention `regenerate_root` as a recovery option (this specific text change was not made). The root cause of the "stale durations" symptom was clarified: `update_composition` cannot change per-scene `durationFrames` — those must go through `update_scene`. The `regenerateRootTsx()` function signature was NOT changed to always re-read from disk; it still takes a `composition` parameter from the caller.
