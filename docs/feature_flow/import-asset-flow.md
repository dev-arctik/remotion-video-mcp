# Flow: import_asset Tool

**Last Updated:** 2026-04-23
**Status:** Active
**Type:** End-to-End Flow

---

## Overview

`import_asset` copies files from any location (typically Claude Desktop temp uploads) into the project's `assets/` directory. It sanitizes filenames to kebab-case, detects the asset category from the file extension, returns a ready-to-use `publicPath` for `staticFile()`, and guides Claude to ask the user what type of audio was imported before taking further action.

This is the gateway tool for all binary assets. It runs before any scene that references images, audio, or fonts. Code files go through `write_file` instead.

---

## Architecture Diagram

```
Claude Desktop (MCP client)
    │
    │  import_asset({ projectPath, files: [{ sourcePath, destFilename? }] })
    ▼
src/tools/import-asset.ts
    │
    ├── validateProjectPath(projectPath)          src/utils/file-ops.ts:12
    │
    ├── for each file in files[]:
    │   ├── reject URLs (http/https prefix guard)
    │   ├── reject source paths containing '..'
    │   ├── fs.pathExists(sourcePath)             — clear error if missing
    │   ├── resolve filename:
    │   │     if destFilename → use as-is (inherit ext if missing)
    │   │     else → toSafeFilename(basename)     src/utils/file-ops.ts (toSafeFilename)
    │   ├── detect category from extension        EXTENSION_CATEGORY map (line 10–16)
    │   ├── fs.ensureDir(assets/{category}/)
    │   ├── handle duplicate:
    │   │     overwrite (default) → copy with { overwrite: true }
    │   │     rename → findAvailableFilename()    appends -1, -2...
    │   ├── fs.copy(sourcePath, destPath)
    │   └── if audio (non-.json): parseFile() → durationSeconds, durationFormatted
    │
    ├── buildAssetTree(projectPath)               shows all files in each category
    │
    └── return { status, imported[], errors[], summary, assetTree, next_steps }
         │
         └── next_steps: if audio imported → ask user about audio type
             (narration / background music / lyrics — triggers analyze_beats if music)
```

**File:** `src/tools/import-asset.ts`
**Registered in:** `src/server.ts` (Phase 3 Assets block)

---

## Filename Sanitization

Every imported file name is sanitized to kebab-case when no custom `destFilename` is provided. This prevents broken `staticFile()` calls caused by spaces, parentheses, and special characters in user-uploaded files.

```typescript
// src/tools/import-asset.ts:105–119
const rawSourceName = path.basename(file.sourcePath);
const sourceExt = path.extname(rawSourceName);

if (file.destFilename) {
  filename = file.destFilename;
  if (!path.extname(file.destFilename)) filename = file.destFilename + sourceExt;
} else {
  const safeName = toSafeFilename(rawSourceName.replace(/\.[^.]+$/, ''));
  filename = (safeName || 'imported-file') + sourceExt;
}
```

`toSafeFilename()` is defined in `src/utils/file-ops.ts`. It lowercases, replaces whitespace with hyphens, and strips all non-alphanumeric-or-hyphen characters. Examples:

| Input | Output |
|-------|--------|
| `My Track (Final Mix v2).mp3` | `my-track-final-mix-v2.mp3` |
| `Hero Image.png` | `hero-image.png` |
| `Font_Bold.ttf` | `font-bold.ttf` |

When `destFilename` is explicitly provided, sanitization is skipped entirely — the caller's intent is honored.

---

## Extension-to-Category Mapping

Category is detected from the file extension (case-insensitive). The same map mirrors the glob patterns used by `scan_assets`.

```
Category: "images"  ← .png .jpg .jpeg .gif .svg .webp
Category: "audio"   ← .mp3 .wav .aac .ogg .m4a .json
Category: "fonts"   ← .ttf .otf .woff .woff2
```

`src/tools/import-asset.ts:10–16` — `EXTENSION_CATEGORY` constant.

An explicit `category` override on the file entry takes precedence over extension detection.

---

## Audio Duration Parsing

For audio files (category `audio`, extension not `.json`), the tool calls `parseFile()` from `music-metadata` after the copy to extract duration:

```typescript
// src/tools/import-asset.ts:157–172
const metadata = await parseFile(destPath);
if (metadata.format.duration) {
  entry.durationSeconds = Math.round(dur * 10) / 10;
  entry.durationFormatted = `${mins}:${secs}`;  // e.g. "3:24"
}
```

Duration is non-critical metadata — if parsing fails, the import still succeeds.

---

## Duplicate Handling

| `onDuplicate` | Behavior |
|---|---|
| `"overwrite"` (default) | Copies with `{ overwrite: true }` — existing file replaced silently |
| `"rename"` | Calls `findAvailableFilename()` — appends `-1`, `-2`, etc. until a free name is found, capped at 99 attempts |

---

## Audio-Type Guidance in next_steps

When any audio file (non-`.json`) is imported, the `next_steps` field switches to a multi-choice prompt that Claude must relay to the user before proceeding:

```
"Audio files imported. IMPORTANT — before using this audio, ask the user:
 'What type of audio is this?'
   (a) Narration or voiceover — spoken words synced to scenes
   (b) Background music or beats — instrumental track with no lyrics
   (c) Music with lyrics — songs where words are part of the content

 If the user says (b) background music/beats:
   Tell them: 'I can analyze the beats in this track to sync animations...'
   If yes → call analyze_beats with the imported audio filename.

 If the user says (a) narration:
   Ask for the timestamp JSON file (Whisper/AssemblyAI format)..."
```

This is the intended trigger for beat analysis — Claude never calls `analyze_beats` automatically; the user always makes that call.

---

## Success Response Shape

```json
{
  "status": "success",
  "imported": [
    {
      "sourcePath": "/tmp/upload_abc123.jpg",
      "filename": "hero-image.jpg",
      "category": "images",
      "destPath": "/Users/user/my-video/assets/images/hero-image.jpg",
      "publicPath": "images/hero-image.jpg",
      "sizeKB": 342
    }
  ],
  "errors": [],
  "summary": { "total": 1, "succeeded": 1, "failed": 0 },
  "assetTree": {
    "images": ["hero-image.jpg"],
    "audio": [],
    "fonts": []
  },
  "next_steps": "Files are ready. Use publicPath values directly in staticFile() calls or scene props."
}
```

For audio imports the `next_steps` field is replaced with the audio-type guidance described above. Audio entries also carry `durationSeconds` and `durationFormatted`.

**Status values:** `"success"` (all succeeded) · `"partial"` (some failed) · `"error"` (all failed).

Batch imports do not abort on a per-file failure — each file is processed independently and failures are collected in `errors[]`.

---

## publicPath to staticFile() Mapping

The `publicPath` returned by `import_asset` is the exact string for `staticFile()`:

```
assets/images/hero-image.jpg  →  publicPath: "images/hero-image.jpg"
staticFile("images/hero-image.jpg")  →  resolves via public/ symlink
```

The `public/` symlinks are created once during `init_project` (`src/utils/file-ops.ts:57–69`):

```
public/images  →  assets/images
public/audio   →  assets/audio
public/fonts   →  assets/fonts
```

---

## Example Workflow

```
1. User uploads "My Epic Trailer (v2).mp3" via Claude Desktop
   → file lands at /tmp/upload_abc123.mp3

2. Claude calls:
   import_asset({
     projectPath: "/Users/alice/my-video",
     files: [{ sourcePath: "/tmp/upload_abc123.mp3" }]
   })

3. Tool sanitizes: "My Epic Trailer (v2)" → "my-epic-trailer-v2"
   Copies to: assets/audio/my-epic-trailer-v2.mp3
   Returns: publicPath: "audio/my-epic-trailer-v2.mp3"
             durationSeconds: 89.4

4. next_steps tells Claude to ask the user about audio type.
   User says "background music" → Claude explains beat sync → user agrees.

5. Claude calls:
   analyze_beats({ audioFile: "my-epic-trailer-v2.mp3", ... })
   → beat data written to assets/audio/my-epic-trailer-v2-beats.json
```

---

## Error Scenarios

| Condition | Error message |
|-----------|--------------|
| Source file not found | `"Source file not found: '/tmp/...'"` |
| URL passed instead of local path | `"URL import is not supported. Provide a local file path..."` |
| Unknown extension | `"Unknown extension '.psd' for file '...'. Valid extensions: ..."` |
| `..` in source path | `"Source path must not contain '..'..."` |
| No `composition.json` at projectPath | Standard `validateProjectPath` error |

---

## Related Docs

- `docs/feature_flow/beat-detection-flow.md` — what happens after the user says "background music"
- `docs/feature_flow/usage-guide.md` — full end-to-end workflow from session to render
- `src/tools/scan-assets.ts` — alternative way to discover existing assets already in `assets/`

