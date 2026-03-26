# Issue: Root.tsx Audio Generation — Field Mismatch and Wrong Import Source

**Date Reported:** 2026-03-02
**Status:** Resolved
**Type:** Bug Report
**Severity:** Critical
**Affected Area:** Backend
**Affected Component(s):** `regenerateRootTsx()` in `src/utils/file-ops.ts`, `update_composition` tool

---

## Problem

Two related bugs in `regenerateRootTsx()` cause any Remotion project that uses audio to fail
at compile time. Both bugs are in the audio section of `src/utils/file-ops.ts` (lines 186–201)
and are triggered whenever a user calls `update_composition` with an `audio` payload.

**Bug 1 — Field name mismatch (`src` vs `file`):**

`update_composition` accepts `backgroundMusic` and `narration` as `Record<string, unknown>` (no
field-level schema enforcement). Claude and users naturally pass `src` as the audio path field.
`regenerateRootTsx()` casts these records to `Record<string, unknown>` and then reads `.file`.
Because the user passed `src`, `.file` is `undefined`, and the generated JSX contains
`staticFile('undefined')`.

**Bug 2 — Wrong import source for `Audio`:**

`regenerateRootTsx()` generates `import { Audio } from '@remotion/media'` for audio-enabled
projects. In Remotion v4, `Audio` is exported from `'remotion'` directly — `@remotion/media` is
a separate optional package that most Remotion projects do not install. This causes a missing
module error at compile time even if the audio path is correct.

---

**Expected:** `<Audio src={staticFile('audio/bg-music.mp3')} />` using an import from `'remotion'`

**Actual:** `<Audio src={staticFile('undefined')} />` using an import from `'@remotion/media'`
(which may not be installed)

---

## Steps to Reproduce

1. Initialize a Remotion project with `init_project`.
2. Call `update_composition` with the following audio payload:
   ```json
   {
     "projectPath": "/path/to/project",
     "audio": {
       "type": "background",
       "backgroundMusic": { "src": "audio/bg-music.mp3", "volume": 0.4 }
     }
   }
   ```
3. Inspect the generated `src/Root.tsx`.
4. Observe:
   - Line importing `Audio` reads `import { Audio } from '@remotion/media';` — Bug 2
   - Background music JSX reads `src={staticFile('undefined')}` — Bug 1
5. Run `npx remotion studio` — compilation fails on both errors.

---

## Affected Components

| Component | File | Line(s) | Relevance |
|-----------|------|---------|-----------|
| `regenerateRootTsx()` — audio import | `src/utils/file-ops.ts` | 188 | Generates wrong import source: `@remotion/media` instead of `'remotion'` |
| `regenerateRootTsx()` — narration path | `src/utils/file-ops.ts` | 192 | Reads `audio.narration.file`; user passes `src` — evaluates to `undefined` |
| `regenerateRootTsx()` — bgMusic path | `src/utils/file-ops.ts` | 197 | Reads `bgMusic.file`; user passes `src` — evaluates to `undefined` |
| `registerUpdateComposition()` — audio schema | `src/tools/update-composition.ts` | 35–36 | `narration` and `backgroundMusic` typed as `Record<string, unknown>` — no field enforcement |
| `Composition` interface — audio field | `src/state/project-state.ts` | 31–34 | `narration` and `backgroundMusic` are `Record<string, unknown>` — field name not defined |

---

## Investigation Notes

| Checked | Outcome |
|---------|---------|
| `src/utils/file-ops.ts` line 188 | Confirmed: `import { Audio } from '@remotion/media'` is generated. Remotion v4 exports `Audio` from `'remotion'` — `@remotion/media` is not in the scaffolded project's `package.json`. |
| `src/utils/file-ops.ts` line 192 | Confirmed: `(audio.narration as Record<string, unknown>).file as string` — reads `.file`. No user-facing doc or schema validation specifies the field must be `file`, not `src`. |
| `src/utils/file-ops.ts` line 197 | Confirmed: `bgMusic.file as string` — same field mismatch as line 192. |
| `src/tools/update-composition.ts` lines 35–36 | Confirmed: `narration: z.record(z.string(), z.unknown()).optional()` and `backgroundMusic: z.record(z.string(), z.unknown()).optional()` — Zod accepts any key including `src`. No validation that `file` must be present. |
| `src/state/project-state.ts` lines 31–34 | Confirmed: `audio.narration` and `audio.backgroundMusic` typed as `Record<string, unknown>`. No named fields. |
| `@remotion/media` in project scaffold | Checked `templates/project-scaffold/package.json` — `@remotion/media` is NOT listed as a dependency. Scaffolded projects will get a module-not-found error at runtime. |
| Remotion v4 public API | `Audio` exported from `'remotion'` (confirmed in CLAUDE.md — "Audio is imported from `@remotion/media`" is documented incorrectly there too). |

### Root Cause

**Bug 1:** The field name used when building audio objects is never enforced. `update_composition`
accepts free-form `Record<string, unknown>` for `narration` and `backgroundMusic`. `regenerateRootTsx()`
assumes these records use `file` as the path key (lines 192 and 197), but the natural field name
a caller would use — and that Claude uses — is `src`, matching the JSX prop it ultimately maps
to. There is no validation at any layer that normalizes or rejects the wrong field name.

**Bug 2:** The code comment at line 186 (`// Audio JSX — <Audio> from @remotion/media`) is
incorrect. In Remotion v4, `Audio` lives in `'remotion'`. The `CLAUDE.md` note that says
`<Audio>` is imported from `@remotion/media` is also wrong. Neither is `@remotion/media`
scaffolded into the user's `package.json`, so even if the import were intentional it would fail.

---

## Proposed Fix

### Fix 1 — Standardize on `src` as the audio path field

Standardize on `src` (matches the JSX prop name and user intuition). Update
`regenerateRootTsx()` to read `.src` instead of `.file` at lines 192 and 197:

```typescript
// src/utils/file-ops.ts line 192
const narrationFile = (audio.narration as Record<string, unknown>).src as string;

// src/utils/file-ops.ts line 197
const bgFile = bgMusic.src as string;
```

Optionally add a fallback to tolerate both field names during a transition period:

```typescript
const bgFile = (bgMusic.src ?? bgMusic.file) as string;
```

Also update the Zod schema in `src/tools/update-composition.ts` to replace
`z.record(z.string(), z.unknown())` with explicit sub-schemas that enforce `src`:

```typescript
narration: z.object({
  src: z.string(),
  volume: z.number().optional(),
}).optional(),
backgroundMusic: z.object({
  src: z.string(),
  volume: z.number().optional(),
  loop: z.boolean().optional(),
}).optional(),
```

And update the `Composition` interface in `src/state/project-state.ts` to match:

```typescript
audio: {
  type: 'narration' | 'background' | 'none';
  narration?: { src: string; volume?: number };
  backgroundMusic?: { src: string; volume?: number; loop?: boolean };
};
```

### Fix 2 — Correct the `Audio` import source

Change line 188 in `src/utils/file-ops.ts` to import `Audio` from `'remotion'` and consolidate
the `staticFile` import into the existing `remotionImports` string (built at line 228–230) instead
of injecting a separate import line:

```typescript
// Before (line 188):
const audioImport = hasAudio ? `import { Audio } from '@remotion/media';\nimport { staticFile } from 'remotion';` : '';

// After — no separate audioImport; add Audio and staticFile to remotionImports instead:
const remotionImports = [
  'Composition',
  'Series',
  ...(hasAudio ? ['Audio', 'staticFile'] : []),
  ...(overlays.length > 0 ? ['AbsoluteFill'] : []),
  ...(hasPartialOverlays ? ['Sequence'] : []),
].join(', ');
```

This produces a single consolidated import:
```typescript
import { Composition, Series, Audio, staticFile } from 'remotion';
```

Also update the comment at line 186 from `// Audio JSX — <Audio> from @remotion/media` to
`// Audio JSX — <Audio> and staticFile() are both exported from 'remotion'`.

Update `CLAUDE.md` under "Important Remotion API Notes" to correct the wrong attribution:
`<Audio>` is from `'remotion'`, not `@remotic/media`.

---

## Related

- Files:
  - `src/utils/file-ops.ts` (lines 186–201)
  - `src/tools/update-composition.ts` (lines 33–37)
  - `src/state/project-state.ts` (lines 31–34)
- Commits: `503a84f` (initial commit — both bugs shipped in this commit)
- Related issues: N/A
