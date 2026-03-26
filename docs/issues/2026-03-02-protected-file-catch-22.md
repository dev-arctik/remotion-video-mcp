# Issue: Protected File Catch-22 — Root.tsx Cannot Be Fixed When Auto-Generation Is Broken

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** Critical
**Affected Area:** Backend
**Affected Component(s):** `write_file` protected list, `regenerateRootTsx()`, all scene-mutation tools

---

## Problem

`src/Root.tsx` is listed in the `PROTECTED_FILES` array in `src/tools/write-file.ts` (line 10), which prevents Claude from writing to it via the `write_file` tool. This protection exists because `Root.tsx` is auto-generated — any manual edit would be wiped on the next scene mutation.

However, `regenerateRootTsx()` in `src/utils/file-ops.ts` contains logic paths that can produce broken output (see Root Cause section below). When this happens, Claude has no recourse through MCP tools: `write_file` blocks the fix, and every subsequent scene mutation re-runs the same broken generator, perpetuating the problem.

The result is a complete workflow deadlock: Claude cannot fix `Root.tsx` manually, and the tool that auto-generates it is itself the source of the bug.

**Expected:** When `Root.tsx` contains a bug, Claude should have a safe, principled path to repair it without leaving the MCP workflow.

**Actual:** Claude is permanently blocked. The user must manually edit `src/Root.tsx` outside the MCP workflow to recover. Any subsequent scene mutation will overwrite that manual fix and reintroduce the bug.

## Steps to Reproduce

### Scenario A — Undefined audio path in narration mode

1. Run `init_project` and create at least one scene
2. Call `update_composition` and set `audio.type` to `"narration"` but leave `audio.narration` undefined (or pass a narration object with no `file` key)
3. Inspect the generated `src/Root.tsx`
4. Observe: `<Audio src={staticFile('undefined')} />` — a literal string `"undefined"` is used as the file path
5. Open Remotion Studio — it crashes on the broken audio src

### Scenario B — Partial overlay produces malformed JSX

1. Register an overlay via `add_overlay` with only `startFrame` set (no `endFrame`)
2. Observe the generated `<Sequence from={N}>` block in `Root.tsx` — this is valid
3. Now call `remove_overlay` and re-add the same overlay with no `startFrame`/`endFrame`
4. Under certain race conditions in repeated calls, the overlay import block and render block can fall out of sync if `composition.overlays` is mutated in memory between the `writeComposition` call and the `regenerateRootTsx` call in the same handler

### Scenario C — Any future regression in `regenerateRootTsx()`

Any future bug introduced to `regenerateRootTsx()` has the same consequence: `Root.tsx` is broken and Claude cannot fix it.

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `PROTECTED_FILES` | `src/tools/write-file.ts` | 8–16 | Declares `src/Root.tsx` as protected — `write_file` will throw if Claude attempts to write to it |
| `regenerateRootTsx()` | `src/utils/file-ops.ts` | 160–267 | Auto-generates `Root.tsx` from `composition.json` state; all bugs here propagate directly into the scaffolded project |
| Audio narration path bug | `src/utils/file-ops.ts` | 191–193 | `audio.narration` is cast without a null guard; if `narration.file` is absent, `narrationFile` is `undefined`, producing `staticFile('undefined')` in JSX |
| Overlay import generation | `src/utils/file-ops.ts` | 204–206 | Overlay imports use `o.file.replace(/\.tsx$/, '')` — if `o.file` contains an unexpected extension or path separator style, the import path may be wrong |
| `registerCreateScene` | `src/tools/create-scene.ts` | 81 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerUpdateScene` | `src/tools/update-scene.ts` | 74 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerDeleteScene` | `src/tools/delete-scene.ts` | 44 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerReorderScenes` | `src/tools/reorder-scenes.ts` | 48 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerUpdateComposition` | `src/tools/update-composition.ts` | 65 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerAddOverlay` | `src/tools/add-overlay.ts` | 101 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerRemoveOverlay` | `src/tools/remove-overlay.ts` | 48 | Calls `regenerateRootTsx()` — propagates any generator bug |
| `registerInitProject` | `src/tools/init-project.ts` | 130 | Calls `regenerateRootTsx()` — generator bugs present from project creation |

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `write-file.ts` — `PROTECTED_FILES` array (lines 8–16) | Confirmed: `'src/Root.tsx'` is at position [1] of the array. The check at line 62–70 normalizes the path and compares — there is no exception path for emergency overrides. Any `write_file` call targeting `src/Root.tsx` returns a hard error. |
| `file-ops.ts` — audio narration null guard (lines 191–193) | Confirmed bug: `const narrationFile = (audio.narration as Record<string, unknown>).file as string`. If `audio.narration` is `undefined`, this cast does not throw — it produces `undefined`. The template literal on line 193 then emits `staticFile('undefined')`. No guard exists between line 191 and 193. |
| `file-ops.ts` — overlay import path (lines 204–206) | Potential bug: `o.file.replace(/\.tsx$/, '')` strips only the `.tsx` extension. If a user registers an overlay at a path like `src/overlays/Foo.tsx`, the import becomes `'../src/overlays/Foo'` — correct. But if the path already lacks the extension (user error via `add_overlay`), the replace is a no-op and the import is still valid. Low risk here but no validation exists. |
| `file-ops.ts` — all 7 call sites of `regenerateRootTsx()` | Confirmed: every scene-mutation tool, the overlay tools, and `init_project` all call the function. There is no call site that handles a broken generator output — `fs.writeFile` (line 266) silently succeeds even when the written content has TypeScript or JSX errors. The error only surfaces at Remotion Studio compile time. |
| `write-file.ts` — error message on protected file (lines 66–70) | Confirmed: the error message tells Claude which files are protected but offers no alternative path. The suggestion field at line 113 ("Verify the file path is relative to the project root and uses an allowed extension") does not mention how to recover from a broken `Root.tsx`. |

### Root Cause

Two independent design decisions combine into a deadlock:

1. **`Root.tsx` is protected to prevent manual edits from being silently overwritten.** This is the correct instinct — the file is owned by `regenerateRootTsx()` and manual edits have no persistence guarantee. The protection is in `write-file.ts:8–16`.

2. **`regenerateRootTsx()` can produce invalid output and has no error-detection mechanism.** It calls `fs.writeFile` unconditionally — it does not attempt to parse or type-check the generated content. The known bug at `file-ops.ts:191–193` (undefined narration path) is the most concrete example, but the function is complex enough (dynamic imports, conditional audio, sorted overlays, partial Sequence wrappers) that future regressions are plausible.

The protection is reasonable only when the generator is provably correct. Because the generator is not provably correct, the protection creates an unrecoverable failure mode.

## Proposed Fix — Three Options Evaluated

### Option 1: Remove `src/Root.tsx` from `PROTECTED_FILES`

Allow Claude to overwrite `Root.tsx` via `write_file`.

**Pros:** Immediate unblocking. Claude can diagnose and fix the file manually.

**Cons:** High risk. Claude-written `Root.tsx` will be silently overwritten by the next call to any of the 7 scene-mutation tools. Claude would need to perfectly reconstruct the auto-generation output format, including all imports, overlay blocks, and Series entries — this is error-prone. Also opens the door to Claude accidentally writing a malformed `Root.tsx` during normal operation (not just in recovery scenarios).

**Verdict:** Not recommended. The protection exists for a good reason; removing it trades one deadlock for a different, harder-to-debug failure mode.

---

### Option 2: Keep the protection and make `regenerateRootTsx()` bulletproof

Fix all known bugs in the generator and add comprehensive guards.

**Pros:** Addresses the root cause directly. If the generator never produces broken output, the catch-22 never materializes.

**Cons:** Cannot guarantee zero future regressions — `regenerateRootTsx()` is a code-generation function with multiple conditional branches. It will be extended as new features are added. The protection in `write_file` then becomes a permanent liability: any future bug in the generator is permanently unrecoverable via MCP tools.

Specific fixes needed immediately:
- `file-ops.ts:191–193` — add null guard before accessing `audio.narration.file`; throw a descriptive error if `file` is absent rather than silently writing `'undefined'`

**Verdict:** Necessary (the null guard bug should be fixed regardless of which option is chosen) but not sufficient as a standalone solution.

---

### Option 3: Add a `regenerate_root` tool (recommended)

Add a dedicated MCP tool that rebuilds `Root.tsx` from `composition.json`. Claude calls this tool after correcting data in `composition.json` (e.g., fixing the audio narration path via `update_composition`).

**Pros:**
- `Root.tsx` stays protected from direct writes — the overwrite-on-mutation problem is preserved
- Claude has a principled, MCP-native path to recover from any broken `Root.tsx`
- The tool's description can guide Claude to fix the upstream `composition.json` data first, then regenerate — addressing the cause, not just the symptom
- Zero risk of Claude writing a structurally incorrect `Root.tsx` (the generator always runs)
- Trivial to implement: the tool calls `validateProjectPath` + `readComposition` + `regenerateRootTsx` — no new logic required

**Cons:** Does not help if the bug is inside `regenerateRootTsx()` itself (rather than in bad `composition.json` data). In that case, neither this tool nor Option 1 helps — only Option 2 (fixing the generator) resolves it.

**Implementation sketch:**
```
src/tools/regenerate-root.ts
  → registerRegenerateRoot(server: McpServer)
  → inputSchema: z.object({ projectPath: z.string() })
  → calls: validateProjectPath → readComposition → regenerateRootTsx
  → returns: { status: 'success', message: 'Root.tsx regenerated from composition.json' }
```

**Verdict:** Recommended as the primary fix. Must be combined with Option 2 for the known narration null guard bug.

## Recommended Action

1. **Fix the narration null guard bug now** (`src/utils/file-ops.ts:191–193`) — this is an active bug that produces broken output independent of the catch-22
2. **Add the `regenerate_root` tool** (`src/tools/regenerate-root.ts`) — closes the deadlock for all data-driven bugs
3. **Update the `write_file` error message** (`src/tools/write-file.ts:66–70`) — when a protected file write is blocked, suggest calling `regenerate_root` after fixing `composition.json` via `update_composition`
4. **Register the new tool in `src/server.ts`** — follow the same pattern as all other tool registrations

## Related

- Files: `src/tools/write-file.ts`, `src/utils/file-ops.ts`, `src/tools/create-scene.ts`, `src/tools/update-scene.ts`, `src/tools/delete-scene.ts`, `src/tools/reorder-scenes.ts`, `src/tools/update-composition.ts`, `src/tools/add-overlay.ts`, `src/tools/remove-overlay.ts`, `src/tools/init-project.ts`
- Related issues: `docs/issues/2026-02-26-no-overlay-or-custom-component-support.md`
