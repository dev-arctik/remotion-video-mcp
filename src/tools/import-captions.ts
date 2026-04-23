import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';
import { readComposition, writeComposition } from '../state/project-state.js';
import type { Caption } from '../state/project-state.js';

// SRT timestamp parser: "HH:MM:SS,mmm" → milliseconds
function srtTimestampToMs(ts: string): number {
  const m = ts.trim().match(/^(\d+):(\d+):(\d+)[,.](\d+)$/);
  if (!m) return 0;
  const [, h, mm, ss, ms] = m;
  return Number(h) * 3600_000 + Number(mm) * 60_000 + Number(ss) * 1000 + Number(ms);
}

// Minimal SRT parser — produces @remotion/captions Caption[] (sentence-level).
// For TRUE word-level captions, use Whisper or assemblyai upstream and import the JSON directly.
function parseSrt(srt: string): { text: string; startMs: number; endMs: number; timestampMs: number | null }[] {
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const captions: { text: string; startMs: number; endMs: number; timestampMs: number | null }[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    // First line is index (skip), second is timestamp range, rest is text
    const tsLineIdx = lines[0].includes('-->') ? 0 : 1;
    const tsLine = lines[tsLineIdx];
    const [start, end] = tsLine.split('-->').map((s) => s.trim());
    if (!start || !end) continue;
    const text = lines.slice(tsLineIdx + 1).join(' ').trim();
    if (!text) continue;
    captions.push({
      text,
      startMs: srtTimestampToMs(start),
      endMs: srtTimestampToMs(end),
      timestampMs: srtTimestampToMs(start),
    });
  }
  return captions;
}

// Import an SRT or pre-parsed Caption[] JSON file into the project.
// Saves to assets/captions/<id>.json so the Captions primitive can read it.
export function registerImportCaptions(server: McpServer): void {
  server.registerTool(
    'import_captions',
    {
      title: 'Import Captions',
      description: `Import an SRT subtitle file OR a pre-parsed @remotion/captions Caption[] JSON into the
project. Parsed captions are saved to assets/captions/<id>.json and registered in
composition.captions[]. Use the Captions primitive in componentCode to render them.

For TRUE word-level captions (TikTok-style), pre-process audio with Whisper or AssemblyAI
to get word-level timestamps, then pass the resulting Caption[] JSON via captionsJson.`,
      inputSchema: {
        projectPath: z.string().describe('Absolute path to the Remotion project'),
        sourcePath: z.string().optional().describe('Absolute path to a .srt or .json file to import. Either sourcePath OR captionsJson required.'),
        captionsJson: z.array(z.object({
          text: z.string(),
          startMs: z.number(),
          endMs: z.number(),
          timestampMs: z.number().nullable().optional(),
          confidence: z.number().nullable().optional(),
        })).optional().describe('Pre-parsed @remotion/captions Caption[] (when you already have word-level data from Whisper/AssemblyAI)'),
        captionId: z.string().describe("Identifier used in Captions primitive — e.g. 'narration' or 'lyrics'"),
        name: z.string().optional().describe('Display name for the captions track'),
        language: z.string().optional().describe('BCP 47 language tag, e.g. "en-US"'),
      },
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        let captions: { text: string; startMs: number; endMs: number; timestampMs: number | null }[];
        if (args.captionsJson) {
          captions = args.captionsJson.map((c) => ({
            text: c.text,
            startMs: c.startMs,
            endMs: c.endMs,
            timestampMs: c.timestampMs ?? c.startMs,
          }));
        } else if (args.sourcePath) {
          if (!await fs.pathExists(args.sourcePath)) {
            throw new Error(`Source file not found: ${args.sourcePath}`);
          }
          const content = await fs.readFile(args.sourcePath, 'utf-8');
          if (args.sourcePath.toLowerCase().endsWith('.srt')) {
            captions = parseSrt(content);
          } else if (args.sourcePath.toLowerCase().endsWith('.json')) {
            captions = JSON.parse(content);
          } else {
            throw new Error('sourcePath must be .srt or .json');
          }
        } else {
          throw new Error('Either sourcePath or captionsJson is required');
        }

        if (captions.length === 0) {
          throw new Error('Parsed 0 captions — file may be malformed or empty');
        }

        // Save parsed captions to assets/captions/<id>.json
        const captionsDir = path.join(args.projectPath, 'assets', 'captions');
        await fs.ensureDir(captionsDir);
        const captionsFile = path.join(captionsDir, `${args.captionId}.json`);
        await fs.writeJson(captionsFile, captions, { spaces: 2 });

        // Mirror to public/ so staticFile() can serve it
        const publicDir = path.join(args.projectPath, 'public', 'captions');
        await fs.ensureDir(publicDir);
        await fs.copy(captionsFile, path.join(publicDir, `${args.captionId}.json`));

        // Register in composition
        const composition = await readComposition(args.projectPath);
        composition.captions = composition.captions ?? [];
        const existing = composition.captions.findIndex((c: Caption) => c.id === args.captionId);
        const captionEntry: Caption = {
          id: args.captionId,
          name: args.name ?? args.captionId,
          file: `assets/captions/${args.captionId}.json`,
          language: args.language,
        };
        if (existing >= 0) {
          composition.captions[existing] = captionEntry;
        } else {
          composition.captions.push(captionEntry);
        }
        await writeComposition(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              captionId: args.captionId,
              entries: captions.length,
              file: captionEntry.file,
              durationMs: captions[captions.length - 1].endMs,
              next_steps: `Use Captions primitive in scene componentCode: import captions from staticFile('captions/${args.captionId}.json'), then <Captions captions={captions} position="bottom" />.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'For SRT files, ensure standard format: index, HH:MM:SS,mmm --> HH:MM:SS,mmm, text. For word-level captions, run audio through Whisper first.',
            }),
          }],
        };
      }
    }
  );
}
