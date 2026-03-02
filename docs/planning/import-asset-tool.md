# Feature: `import_asset` MCP Tool

**Version:** v1.0
**Status:** Implemented
**Type:** Feature Spec
**Created:** 2026-03-01
**Last Modified:** 2026-03-02
**Implemented:** 2026-03-02

---

## Problem Statement

When a user uploads files (images, audio, fonts) into a Claude Desktop or MCP-compatible chat session, those files land in a **temporary OS directory** — typically `/tmp/` on macOS/Linux or `%LOCALAPPDATA%\Temp\` on Windows. There is currently no MCP tool to move those files into the project's `assets/` directory.

As a result, the user must manually copy files using their OS file manager or shell before they can be used in any scene. This breaks the fully-conversational workflow that this MCP server is designed to enable: the user should be able to say "use this image" and have Claude handle the rest end-to-end.

This gap affects every visual-asset-driven workflow: image scenes (`image-scene`, `text-with-image`), narration audio (`audio.narration`), background music (`audio.backgroundMusic`), and custom fonts.

The existing `scan_assets` tool (`src/tools/scan-assets.ts:9`) already reads from `assets/` and produces paths in the format that Remotion's `staticFile()` expects (e.g., `images/photo.jpg`). `import_asset` is the missing step that gets files into that directory.

---

## Goals & Success Criteria

- Claude can receive a file path from the MCP client (typically a temp path) and copy it into the correct `assets/{category}/` subfolder in one tool call
- The tool returns the `publicPath` (e.g., `images/photo.jpg`) ready for direct use in `staticFile()` calls and scene `props`
- The tool handles the three asset categories the project already recognises: `images`, `audio`, `fonts`
- File extension determines category automatically; Claude can override if needed
- Duplicate filename conflicts are handled predictably (overwrite by default, rename-with-suffix optional)
- Batch import works: multiple files can be imported in a single call
- The tool fits the existing error/success response conventions used by every other tool in `src/tools/`
- After import, the caller can immediately pass the returned `publicPath` into `create_scene` or `update_scene` props — no intermediate `scan_assets` call required

### Definition of Done

- [ ] `src/tools/import-asset.ts` created and registered in `src/server.ts`
- [ ] Tool correctly copies files into `assets/images/`, `assets/audio/`, or `assets/fonts/`
- [ ] Tool returns `publicPath` in the format `scan_assets` would return (e.g., `images/photo.jpg`)
- [ ] Duplicate handling works for both `overwrite` and `rename` modes
- [ ] Batch import (array of files) works in a single tool call
- [ ] `validateProjectPath()` called at the top of the handler
- [ ] Error response shape matches the existing pattern: `{ status: "error", message, suggestion }`
- [ ] TypeScript builds clean (`npm run build` — zero errors)

---

## Requirements

### Functional Requirements

- **FR-001:** Accept one or more source file paths (absolute paths — as provided by the MCP client from temp storage).
- **FR-002:** Determine the asset category (`images`, `audio`, `fonts`) from the file extension automatically. Supported extensions are the same set that `scan_assets` already recognises:
  - Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
  - Audio: `.mp3`, `.wav`, `.aac`, `.ogg`, `.m4a`, `.json` (timestamp files)
  - Fonts: `.ttf`, `.otf`, `.woff`, `.woff2`
- **FR-003:** Allow Claude to explicitly specify the category via an optional `category` param, overriding the extension-based detection. Useful when the extension is ambiguous or missing.
- **FR-004:** Allow Claude to specify a custom destination filename (rename on import) via an optional `destFilename` param. When importing a batch, this is not supported — only per-file rename is applicable.
- **FR-005:** Copy (not move) the source file into `{projectPath}/assets/{category}/{filename}`. The source file must remain at its original location in case the MCP client still needs it.
- **FR-006:** On duplicate filename: default behaviour is **overwrite**. An optional `onDuplicate` param can be set to `"rename"`, which appends a numeric suffix (e.g., `photo-1.jpg`, `photo-2.jpg`) until a non-conflicting name is found.
- **FR-007:** Return the `publicPath` for each imported file — the path relative to `public/` that can be passed directly to `staticFile()`. For example, a file copied to `assets/images/photo.jpg` → `publicPath: "images/photo.jpg"`.
- **FR-008:** Batch import: accept an array of `{ sourcePath, destFilename? }` objects in a single tool call, returning an array of results (one per file, including any per-file errors without aborting the whole batch).
- **FR-009:** Validate that the source file actually exists before attempting the copy. Return a clear error if not.
- **FR-010:** Reject source paths that resolve to obviously dangerous locations (mirror the existing `validateProjectPath` pattern in `src/utils/file-ops.ts:12`). The source path validation should specifically NOT block `/tmp/` and other temp dirs — those are the expected source locations.

### Non-Functional Requirements

- **Performance:** File copies are synchronous to the tool call. No background processing. For large files (e.g., audio > 100 MB), the copy may take a few seconds — this is acceptable as the tool description will set that expectation.
- **Security:** Source path must not contain `..` traversal components. The destination is always within `{projectPath}/assets/`, so destination traversal is structurally impossible.
- **Cross-platform:** Windows temp paths (`%LOCALAPPDATA%\Temp\`) use backslashes — use `path.resolve()` throughout to normalise. The symlink from `public/` to `assets/` already handles Windows via the `junction` type (see `src/utils/file-ops.ts:63`).
- **Idempotency:** Calling `import_asset` twice with the same source and destination is safe — with `onDuplicate: "overwrite"` (default), it simply overwrites with an identical copy.

### Assumptions

- The `public/` → `assets/` symlink already exists (created by `ensureProjectDirs` in `src/utils/file-ops.ts:35`). `import_asset` does NOT need to recreate or update it.
- URL-based import (downloading from `https://`) is **out of scope** for v1. The tool only handles local file paths. This is a deliberate deferral — see Open Questions.
- File content validation (e.g., verifying that a `.jpg` is actually a valid JPEG) is **out of scope** for v1. Extension-based category detection is sufficient.
- File size limits are **not enforced** by the tool. This is a local project — no upload bandwidth concerns.

---

## User Stories

| Priority | Story | Acceptance Criteria |
|----------|-------|---------------------|
| Must | As Claude, I want to copy a temp-path image into `assets/images/` so that I can reference it in an `image-scene` or `text-with-image` scene immediately after | Tool returns `publicPath: "images/photo.jpg"` which Claude passes directly into `create_scene` props |
| Must | As Claude, I want to copy a temp-path MP3 into `assets/audio/` so that it can be used as narration or background music | Tool returns `publicPath: "audio/voiceover.mp3"` |
| Must | As Claude, I want to import multiple uploaded images in one tool call to avoid N round-trips | Batch import with array of source paths returns array of results |
| Should | As Claude, I want to rename a file on import (e.g., `tmpfile_abc.jpg` → `product-hero.jpg`) so that the project stays organised | `destFilename` param controls the output filename |
| Should | As Claude, I want to handle a duplicate filename gracefully without asking the user | `onDuplicate: "rename"` appends `-1`, `-2` etc. until a free name is found |
| Could | As a developer, I want to see all assets in the project after import | Response includes `assetTree` showing files in each category folder |

---

## Technical Design

### Architecture Overview

```
MCP Client (Claude Desktop)
    │
    │  import_asset({ projectPath, files: [{ sourcePath, destFilename? }], onDuplicate })
    ▼
src/tools/import-asset.ts
    │
    ├── validateProjectPath(projectPath)          ← src/utils/file-ops.ts:12
    │
    ├── for each file in files[]:
    │   ├── validate source exists (fs.pathExists)
    │   ├── detect category from extension
    │   ├── resolve dest path in assets/{category}/
    │   ├── handle duplicate (overwrite | rename-with-suffix)
    │   └── fs.copy(source, dest, { overwrite: true })  ← fs-extra
    │
    └── return { status, imported: [{ publicPath, category, filename, sizeKB }], assetTree }
         │
         └──► Claude uses publicPath directly in create_scene / update_scene props
              e.g.  props: { src: "images/hero.jpg" }  →  staticFile("images/hero.jpg")
```

### Component Breakdown

| Component | File | Purpose |
|-----------|------|---------|
| Tool registration | `src/tools/import-asset.ts` (new) | Full tool handler — input validation, copy logic, response building |
| Server registration | `src/server.ts:16` | Import and call `registerImportAsset(server)` under Phase 3 Assets section |
| Path validation (reused) | `src/utils/file-ops.ts:12` | `validateProjectPath()` — confirms `composition.json` exists |
| File copy (library) | `fs-extra` (`package.json:22`) | `fs.copy(src, dest, { overwrite })` and `fs.pathExists()` |
| Category mapping | Defined inline in `src/tools/import-asset.ts` | Extension → `images` | `audio` | `fonts` |

### Extension-to-Category Mapping

This mirrors the glob patterns already used in `scan_assets` (`src/tools/scan-assets.ts:31,47,89`):

```
Category: "images"  ← .png, .jpg, .jpeg, .gif, .svg, .webp
Category: "audio"   ← .mp3, .wav, .aac, .ogg, .m4a, .json
Category: "fonts"   ← .ttf, .otf, .woff, .woff2
```

Unknown extensions are rejected with a helpful error listing valid extensions.

### Duplicate Handling Logic

```
onDuplicate = "overwrite" (default):
  fs.copy(src, dest, { overwrite: true })
  — dest filename is exactly what was requested

onDuplicate = "rename":
  if dest does NOT exist → use requested filename
  if dest exists → try filename-1.ext, filename-2.ext, ... until free
  cap at 99 attempts, error if all taken (pathological case)
```

### Input Schema (Zod)

```typescript
z.object({
  projectPath: z.string().describe('Absolute path to the Remotion project root'),
  files: z.array(
    z.object({
      sourcePath: z.string().describe('Absolute path to the source file (e.g. /tmp/upload_abc.jpg)'),
      destFilename: z.string().optional().describe(
        'Custom filename for the destination (e.g. "hero-image.jpg"). Defaults to the source filename.'
      ),
      category: z.enum(['images', 'audio', 'fonts']).optional().describe(
        'Override the auto-detected category. Omit to detect from file extension.'
      ),
    })
  ).min(1).describe('One or more files to import'),
  onDuplicate: z.enum(['overwrite', 'rename']).optional().default('overwrite').describe(
    '"overwrite" (default) replaces existing files. "rename" appends -1, -2, etc. to avoid collision.'
  ),
})
```

### Success Response Shape

Follows the existing project convention (see `src/tools/scan-assets.ts:96`, `src/tools/create-scene.ts:84`):

```json
{
  "status": "success",
  "imported": [
    {
      "sourcePath": "/tmp/upload_abc123.jpg",
      "filename": "hero.jpg",
      "category": "images",
      "destPath": "/Users/user/my-video/assets/images/hero.jpg",
      "publicPath": "images/hero.jpg",
      "sizeKB": 342
    }
  ],
  "errors": [],
  "summary": {
    "total": 1,
    "succeeded": 1,
    "failed": 0
  },
  "assetTree": {
    "images": ["hero.jpg", "logo.png"],
    "audio": ["voiceover.mp3", "timestamps.json"],
    "fonts": ["Inter-Bold.ttf"]
  },
  "next_steps": "Files are ready. Use publicPath values directly in staticFile() calls or scene props. The assetTree shows all files currently in each asset folder."
}
```

### Error Response Shape (per-file, in batch)

Batch imports do NOT abort on a single failure. Failed files are reported in the `errors` array while successes are reported in `imported`:

```json
{
  "status": "partial",
  "imported": [ ... ],
  "errors": [
    {
      "sourcePath": "/tmp/missing.png",
      "error": "Source file not found: /tmp/missing.png"
    }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 },
  "next_steps": "Check the errors array. Re-run import_asset for failed files after confirming source paths."
}
```

If ALL files fail, `status` is `"error"` (not `"partial"`). If all succeed, `status` is `"success"`.

### How `publicPath` Maps to `staticFile()`

The `public/` directory is a symlink tree pointing to `assets/` subdirectories (created at `src/utils/file-ops.ts:57`):

```
public/images  →  assets/images
public/audio   →  assets/audio
public/fonts   →  assets/fonts
```

Remotion's `staticFile()` serves from `public/`. So a file at `assets/images/hero.jpg` is accessed as:

```typescript
staticFile('images/hero.jpg')
```

This is the `publicPath` value the tool returns. It is directly usable in `ImageScene` (`src/templates/components/ImageScene.tsx:9`) and `TextWithImage` (`src/templates/components/TextWithImage.tsx:8`) props.

---

## Implementation Plan

### Phase

| Step | Task | File | Notes |
|------|------|------|-------|
| 1 | Create `src/tools/import-asset.ts` | New file | Full handler, Zod schema, copy logic, duplicate handling |
| 2 | Register tool in `src/server.ts` | `src/server.ts:16` | Import `registerImportAsset`, call under Phase 3 Assets block |
| 3 | Typecheck and build | — | `npm run build` must pass with zero errors |

### Suggested Build Order

1. Define the Zod input schema first — it forces clarity on every input edge case before writing logic.
2. Write the category-detection helper (pure function, easy to unit-test mentally).
3. Write the duplicate-rename logic (loop with counter).
4. Wire the `fs.copy` call with `overwrite: true` — `fs-extra`'s `copy()` accepts this directly per the verified API.
5. Build the batch loop: iterate files, catch per-file errors, accumulate `imported` and `errors` arrays.
6. Construct the response object and determine `status` (`"success"` | `"partial"` | `"error"`).
7. Register in `server.ts` — a one-line import and one-line call.

### Key `fs-extra` APIs (verified via Context7)

```typescript
// Check source exists before copy
const exists = await fs.pathExists(sourcePath);  // returns boolean

// Copy with overwrite (default behaviour)
await fs.copy(sourcePath, destPath, { overwrite: true });

// Copy without overwrite (used in rename mode — only after confirming dest is free)
await fs.copy(sourcePath, destPath, { overwrite: false, errorOnExist: true });

// Ensure dest directory exists (assets/images/ etc. already exist post-init_project,
// but ensureDir is safe to call redundantly)
await fs.ensureDir(destDir);
```

---

## Testing Strategy

- [ ] Single file import — happy path: copy a `.jpg` from `/tmp/` into `assets/images/`, verify returned `publicPath` is `images/filename.jpg`
- [ ] Single file import with `destFilename` rename: verify destination file has the custom name
- [ ] Explicit `category` override: supply a `.jpg` with `category: "audio"` — verify it lands in `assets/audio/`
- [ ] Duplicate `overwrite` mode: import same file twice, verify second call succeeds and file is overwritten
- [ ] Duplicate `rename` mode: import file with a name that already exists, verify `-1` suffix is applied
- [ ] Source file not found: supply a non-existent path, verify error shape is correct and other files in batch still succeed
- [ ] Batch import (3 files): verify `imported` array has 3 entries and `summary.succeeded === 3`
- [ ] Mixed batch (2 succeed, 1 fails): verify `status: "partial"`, `errors` has 1 entry, `imported` has 2
- [ ] Unknown extension: supply a `.psd` file, verify rejected with error listing valid extensions
- [ ] Source path with `..` traversal: verify rejected
- [ ] `validateProjectPath` integration: supply a `projectPath` without `composition.json`, verify the standard error is returned

---

## Rollout & Deployment

- No migration required — this is an additive new tool.
- No feature flag needed — the tool is registered at server startup and immediately available.
- The `src/server.ts` registration must be under the existing `// Phase 3 — Assets` comment block to maintain the code organisation convention.
- The tool should be listed in `start_session`'s `post_onboarding_instructions` if that string ever gets updated, but this is not blocking for v1.

---

## Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Source file path from MCP client is a URL, not a local path | Medium | Medium | Detect `http://` / `https://` prefix and return a clear "URL import not yet supported, provide a local file path" error rather than a cryptic `ENOENT` |
| Source file has already been deleted from temp dir (temp cleanup race) | Medium | Low | `fs.pathExists()` check before copy surfaces this immediately with a clear error |
| Windows junction symlinks break after import (assets in `public/` not reflecting new file) | Low | Low | Junctions point to the `assets/images/` directory, not individual files — any new file in `assets/images/` is automatically visible via `public/images/`. No action needed |
| `destFilename` supplied without extension, breaking category detection in downstream tools | Low | Medium | If `destFilename` has no extension, inherit the source file's extension. Document this in the tool description |

---

## Out of Scope (v1)

The following were considered and explicitly deferred:

- **URL/HTTP import:** Downloading from a URL adds `fetch` or `axios` dependency, redirect handling, auth headers, partial download recovery — meaningful complexity for a v2 feature. The tool description will explicitly tell Claude to request a local file path from the user instead.
- **File content validation:** Verifying that a `.jpg` is a valid JPEG (magic bytes check) adds `file-type` or similar dependency. Extension-based detection matches what `scan_assets` already does.
- **File size limits:** No enforced cap — this is a local project with no bandwidth concerns.
- **Asset registry update:** `import_asset` does NOT write to `composition.json`. Assets are referenced by path at scene-creation time. Keeping asset import stateless is consistent with the project's "composition.json is only about scenes" design.

---

## Open Questions — Resolved

- [x] **Asset inventory in response?** — **YES.** Return an `assetTree` object showing filenames grouped by category (`images`, `audio`, `fonts`) so the AI knows what's in each folder without a separate `scan_assets` call.
- [x] **File size warnings/limits?** — **NO.** This is a local project — no bandwidth or upload concerns. No `sizeWarning` field, no `maxFileSizeBytes` param.
- [x] **Include `.json` in `audio` category?** — **YES.** Consistent with `scan_assets` (`src/tools/scan-assets.ts:47`). Timestamp JSON files live in `assets/audio/` by convention.

---

## References

- `src/tools/scan-assets.ts` — extension patterns, `publicPath` format (`scan_assets` is the consumer of what `import_asset` produces)
- `src/utils/file-ops.ts:12` — `validateProjectPath()` pattern to reuse
- `src/utils/file-ops.ts:35` — `ensureProjectDirs()` — where `assets/` and the `public/` symlinks are created
- `src/tools/init-project.ts:63` — how `ensureProjectDirs` is called, confirming `assets/images/`, `assets/audio/`, `assets/fonts/` exist post-`init_project`
- `src/templates/components/ImageScene.tsx:9` — `src` prop is a `publicPath`, consumed via `staticFile(src)`
- `src/templates/components/TextWithImage.tsx:8` — `imageSrc` prop, same pattern
- `src/server.ts:16` — where the new `registerImportAsset` import and call goes
- `package.json:22` — `fs-extra ^11.3.3` (already a dependency, no new packages needed)
- Context7-verified `fs-extra` APIs: `fs.copy(src, dest, { overwrite })`, `fs.pathExists(path)`, `fs.ensureDir(dir)`
