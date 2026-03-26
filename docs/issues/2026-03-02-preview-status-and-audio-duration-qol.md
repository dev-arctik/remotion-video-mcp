# Issue: Preview Status Check and Audio Duration on Import — QoL Improvements

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** Low
**Affected Area:** Backend
**Affected Component(s):** `start_preview` tool, `import_asset` tool

---

## Problem

Two small quality-of-life gaps in the preview and asset tools that create friction for LLM-driven workflows. Neither is blocking, but both cause the LLM to make unnecessary tool calls or operate with insufficient information.

---

## Issue 1: No Lightweight Preview Status Check

**Expected:** A way to check whether the Remotion Studio preview server is running without side effects — useful at the start of a session or before calling `render_video`.

**Actual:** There is no dedicated `preview_status` tool. The only way to discover running state is to call `start_preview`, which is a state-mutating operation (it starts a server if one is not already running). While `start_preview` does guard correctly against double-starts (returns `status: "already_running"` instead of erroring), this means the LLM must either call `start_preview` speculatively or silently assume no server is running.

The `already_running` guard exists at `src/tools/start-preview.ts:23–33` and calls `isRunning()` from `src/utils/process-manager.ts:72–74`. The process registry is a simple `Map<string, ResultPromise>` (`src/utils/process-manager.ts:5`). PID is available on the stored process but is not exposed by `isRunning()`.

---

## Issue 2: Audio Duration Not Returned by `import_asset`

**Expected:** When `import_asset` copies an audio file (`.mp3`, `.wav`, `.aac`, `.ogg`, `.m4a`), the response should include the audio duration so the LLM can reason about looping, video length, and scene count without a follow-up tool call.

**Actual:** The response at `src/tools/import-asset.ts:137–144` includes only: `sourcePath`, `filename`, `category`, `destPath`, `publicPath`, and `sizeKB`. Duration is absent.

`scan_assets` (`src/tools/scan-assets.ts:77–85`) has the same gap — audio files return only `filename`, `path`, `publicPath`, `format`, and `sizeKB`. Duration is not parsed for raw audio files (only timestamp `.json` files are parsed via `parseTimestampFile`).

No audio metadata library is present in `package.json` — `dependencies` currently lists only `@modelcontextprotocol/sdk`, `execa`, `fs-extra`, `glob`, and `zod`.

---

## Steps to Reproduce

### Issue 1

1. Call `init_project` to scaffold a project.
2. Call `start_preview` — server starts, returns `status: "running"` with PID.
3. In a new LLM turn (or after a session reload), ask the LLM to check if the preview is running.
4. Observe: the LLM has no tool available for a read-only status check. It must call `start_preview` again (which works, returning `already_running`) or make a blind assumption.

### Issue 2

1. Call `import_asset` with an audio file, e.g., `bg-music.mp3`.
2. Observe the response — `sizeKB` is present, duration is absent.
3. The LLM must make a follow-up decision (loop? trim scenes?) without knowing how long the track is.

---

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `start_preview` tool | `src/tools/start-preview.ts` | 23–33 | Already-running guard is correct but description doesn't document idempotency |
| `stop_preview` tool | `src/tools/stop-preview.ts` | 20–29 | Has symmetric `not_running` guard — consistent pattern exists |
| `isRunning()` | `src/utils/process-manager.ts` | 72–74 | Returns `boolean`; no PID or URL exposed |
| `runningProcesses` map | `src/utils/process-manager.ts` | 5 | Stores `ResultPromise` — PID accessible via `.pid` on the stored handle |
| `import_asset` handler | `src/tools/import-asset.ts` | 84–144 | Per-file import loop; `imported[]` response built here |
| `scan_assets` audio branch | `src/tools/scan-assets.ts` | 77–85 | Same gap — raw audio files get no duration |

---

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| Does `start_preview` error on double-call? | No — returns `status: "already_running"` gracefully (line 23–33). Calling it twice is safe. |
| Is PID accessible for a status response? | Yes — `runningProcesses.get(projectPath)?.pid` would work inside `process-manager.ts`. |
| Is any audio metadata library installed? | No — `package.json` has no `music-metadata`, `mp3-duration`, or similar dependency. |
| Does `ffprobe` availability need to be assumed? | Yes — `ffprobe` is only available if the user has FFmpeg installed. Not safe to require. |
| Does `scan_assets` provide duration for raw audio? | No — only parses timestamp `.json` sidecar files via `parseTimestampFile`. Raw `.mp3`/`.wav`/etc. get only `sizeKB`. |
| Are there existing tests? | No test files found in the repo. |

### Root Cause

**Issue 1:** No `preview_status` tool was planned in any of the 5 build phases (`CLAUDE.md` → Build Phases). The `start_preview` idempotency is an implementation detail that was not surfaced in the tool description, leaving the LLM unaware it is safe to call speculatively.

**Issue 2:** Audio duration parsing requires either a native Node library or an external binary. No library was included in the initial dependencies, so `import_asset` was implemented with filesystem-only metadata (`fs.stat` → `sizeKB`). This was a known scope gap — parsing was deferred to `scan_assets` for narration timestamp `.json` files but never extended to raw audio files.

---

## Proposed Fix

### Issue 1 — Two viable options (pick one):

**Option A — Document idempotency (minimal effort, no new tool):**
Update the `description` field in `src/tools/start-preview.ts` (line 11–14) to explicitly state that calling `start_preview` when a server is already running is safe and returns `status: "already_running"` with the URL. This is sufficient for LLM-driven workflows.

**Option B — Add a dedicated `preview_status` tool (cleaner, slightly more work):**
Add `src/tools/preview-status.ts` and register it in `src/server.ts`. The tool takes `projectPath`, calls `isRunning()`, and returns:
```json
{
  "status": "running",
  "url": "http://localhost:3000",
  "pid": 12345
}
```
or:
```json
{
  "status": "stopped"
}
```
Requires exporting a `getProcessPid(projectPath)` helper from `src/utils/process-manager.ts` (or exposing `.pid` directly).

Recommendation: **Option A first** — the guard already works correctly. Improving the description costs nothing and closes the gap for LLM workflows. Revisit Option B if Claude consistently makes unnecessary `start_preview` calls in practice.

### Issue 2 — Three viable options (pick one):

**Option A — Add `music-metadata` (best accuracy, adds a dependency):**
`music-metadata` is a pure ESM Node.js package that reads ID3/FLAC/OGG/WAV headers without spawning a process. Compatible with the project's ESM setup. Install via `npm install music-metadata`. Parse duration after `fs.copy` in the per-file loop (`src/tools/import-asset.ts:134`), add `durationSeconds` and `durationFormatted` (e.g., `"3:24"`) to the `imported[]` entry.

**Option B — Shell out to `ffprobe` with availability check:**
Run `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <file>` via `execa`. Wrap in try/catch — if `ffprobe` is absent, omit `duration` from the response silently. No new dependency, but only works on machines with FFmpeg installed.

**Option C — Defer to `scan_assets` (no code change):**
Document in `import_asset`'s tool description that duration is not returned and that the LLM should call `scan_assets` after importing audio to get full metadata. Update `scan_assets` to parse raw audio duration using Option A or B above, since `scan_assets` is the existing metadata authority.

Recommendation: **Option A (`music-metadata`)** for Issue 2 if a new dependency is acceptable. **Option C** if keeping dependencies minimal is preferred — `scan_assets` is already the right semantic place for asset metadata and the LLM can chain calls.

---

## Related

- Files: `src/tools/start-preview.ts`, `src/tools/stop-preview.ts`, `src/utils/process-manager.ts`, `src/tools/import-asset.ts`, `src/tools/scan-assets.ts`, `package.json`
- Planning doc: `docs/planning/remotion-mcp-server.md`
- Prior issues: `docs/issues/2026-03-02-root-tsx-audio-bugs.md`
