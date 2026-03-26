# Issue: Inline Component Code Support for Scene Tools

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** Medium
**Affected Area:** Backend
**Affected Component(s):** `create_scene` tool, `update_scene` tool

---

## Problem

Creating or updating a custom scene requires two separate tool calls when the actual TSX
component code is known upfront. There is no way to pass inline component code directly
to `create_scene` or `update_scene` — the tools always generate a skeleton from the
`objects` array and write it to disk. To produce real, custom TSX, Claude must follow
up with a `write_file` call to overwrite that skeleton.

This two-step pattern is wasteful. Every additional tool call is a full LLM round-trip
with latency and token cost. For a 10-scene custom video, this pattern silently adds 10
unnecessary `write_file` calls — one per scene.

**Expected:** A single `create_scene` call with `componentCode` writes the TSX directly.
A single `update_scene` call with `componentCode` replaces the existing scene file in-place.

**Actual:** `create_scene` always calls `writeSceneFile()` → `generateSceneTsx()`, which
produces an auto-generated skeleton regardless of what TSX Claude intends to write. The
caller must then issue a `write_file` to overwrite it. `update_scene` has the same
problem — `componentCode` is not a recognized parameter.

---

## Steps to Reproduce

1. Call `create_scene` with `sceneType: "custom"` and a known TSX component body.
2. Observe that the generated file at `scenes/<sceneId>-<sceneName>.tsx` contains the
   auto-generated skeleton (renders `objects` via `<AnimatedObject>`), not the intended
   TSX.
3. Call `write_file` with `filePath: "scenes/<sceneId>-<sceneName>.tsx"` to overwrite
   with the real component code.
4. Repeat for every custom scene in the video.

---

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `registerCreateScene` | `src/tools/create-scene.ts` | 78 | Step 8 calls `writeSceneFile()` unconditionally — no bypass for inline code |
| `generateSceneTsx` | `src/utils/file-ops.ts` | 109–128 | Custom branch always renders `objects` via `AnimatedObject` — no `componentCode` path |
| `writeSceneFile` | `src/utils/file-ops.ts` | 145–153 | Always calls `generateSceneTsx()` — no way to inject raw content |
| `registerUpdateScene` | `src/tools/update-scene.ts` | 73 | Calls `writeSceneFile()` unconditionally after merging field updates — `componentCode` not in schema |
| `registerWriteFile` | `src/tools/write-file.ts` | 20–117 | Currently the only way to write raw TSX to a scene file — separate tool call required |

---

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `create-scene.ts` input schema (lines 16–32) | `componentCode` field does not exist in the Zod schema — any attempt to pass it is silently dropped |
| `update-scene.ts` input schema (lines 16–33) | Same — no `componentCode` field, not in the merge block either |
| `generateSceneTsx()` custom branch (file-ops.ts:109–128) | Hardcoded to render `objects` via `<AnimatedObject>` — no early-return path for raw content |
| `writeSceneFile()` (file-ops.ts:145–153) | Calls `generateSceneTsx()` directly — does not accept a `content` override parameter |
| `write_file` protected file list (write-file.ts:8–16) | Scene files (e.g. `scenes/scene-001-intro.tsx`) are NOT protected — `write_file` can overwrite them, confirming this workaround is valid today |

### Root Cause

`writeSceneFile()` in `src/utils/file-ops.ts` (lines 145–153) always derives file
content by calling `generateSceneTsx()`. There is no code path in either `create_scene`
or `update_scene` to short-circuit this and write raw caller-supplied TSX instead.
The Zod schemas for both tools do not declare `componentCode`, so the MCP SDK strips
it before the handler runs.

---

## Proposed Fix

### Feature 1 — `componentCode` on `create_scene`

**File:** `src/tools/create-scene.ts`

1. Add `componentCode: z.string().optional()` to the `inputSchema` Zod object (after
   the `objects` field, line 31).
2. In step 8 (line 78), check `args.componentCode` before calling `writeSceneFile()`.
   When present AND `sceneType === "custom"`, write `args.componentCode` directly to
   `path.join(args.projectPath, newScene.file)` instead of calling `writeSceneFile()`.

```
// Step 8 — write the .tsx file
if (args.componentCode && args.sceneType === 'custom') {
  // Write caller-supplied code directly — skip skeleton generation
  const filePath = path.join(args.projectPath, newScene.file);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, args.componentCode, 'utf-8');
} else {
  await writeSceneFile(args.projectPath, updatedScene, composition);
}
```

The `fs` import from `fs-extra` is already available in `create-scene.ts`? No —
currently only `file-ops.ts` helpers are imported. Add `import fs from 'fs-extra';`
at line 3 alongside the existing imports.

**Constraint:** `componentCode` should only be respected when `sceneType === "custom"`.
Silently ignore it (or return a warning field) when used with a named template type,
since named templates are auto-generated from `props` — injecting raw TSX there would
break the auto-regeneration contract.

### Feature 2 — `componentCode` on `update_scene`

**File:** `src/tools/update-scene.ts`

1. Add `componentCode: z.string().optional()` to the `inputSchema` Zod object (after
   `objects`, line 32).
2. After `writeSceneFile()` at line 73, add a conditional override: when
   `args.componentCode` is provided, write it directly to the scene file path instead
   of calling `writeSceneFile()`.

```
if (args.componentCode) {
  // Bypass template generation — write caller's TSX verbatim
  const filePath = path.join(args.projectPath, updated.file);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, args.componentCode, 'utf-8');
} else {
  await writeSceneFile(args.projectPath, updated, composition);
}
```

`fs` is already imported in `update-scene.ts` (line 3) — no additional import needed.

**Note:** For `update_scene`, allow `componentCode` regardless of `sceneType`. A
developer updating a scene that was originally a named template to a custom one should
be able to supply TSX directly in the same call (combined with setting
`sceneType: "custom"`).

### No Changes Needed to `file-ops.ts`

`writeSceneFile()` and `generateSceneTsx()` do not need to change. The bypass happens
in the tool handlers before those functions are called. Keeping `writeSceneFile()`
unchanged preserves the auto-generation path for all non-inline-code cases.

### No Changes Needed to `composition.json` / `Scene` Interface

`componentCode` is ephemeral — it is the content of the generated file, not metadata
about the scene. It must NOT be persisted to `composition.json` or added to the `Scene`
interface in `project-state.ts`. Storing raw TSX in composition.json would bloat the
file and break the "composition.json is metadata, scenes/ holds code" design principle.

---

## Related

- Files:
  - `src/tools/create-scene.ts`
  - `src/tools/update-scene.ts`
  - `src/utils/file-ops.ts` (lines 106–153)
  - `src/state/project-state.ts` (lines 50–64 — `Scene` interface, no change needed)
  - `src/tools/write-file.ts` (current workaround)
- Related issues: `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md`
