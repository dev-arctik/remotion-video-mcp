import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';
import { readComposition } from '../state/project-state.js';
import { analyzeAudio } from '../utils/audio-analysis.js';

// Max file size for analysis (50MB)
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.ogg', '.m4a'];

export function registerAnalyzeAudio(server: McpServer): void {
  server.registerTool(
    'analyze_audio',
    {
      title: 'Analyze Audio',
      description: `Analyze a music/audio file for dramatic moments — bass drops, impacts, swooshes,
builds, silence breaks, and energy shifts. Returns named audio events with frame numbers
and suggested scene cut points. Also includes BPM and beat data for rhythm-aligned durations.

This replaces analyze_beats with richer frequency-based analysis. Works with any audio style —
not limited to 4/4 time signatures.

Use the returned events to:
- Place scene cuts at bass drops and impacts
- Start element entrances on transients (swooshes)
- Build tension during "build" events
- Create dramatic pauses at silence breaks

For real-time audio reactivity in scenes, use the AudioReactive primitive in componentCode:
  import { AudioReactive, useAudioReactive } from '../src/primitives';`,
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
        audioFile: z.string().describe(
          'Filename in assets/audio/ (e.g., "trailer-music.mp3"). Must be an audio file.'
        ),
        sensitivity: z.object({
          bassThreshold: z.number().optional().describe('Bass delta threshold for bass-drop detection (default: 0.35)'),
          transientThreshold: z.number().optional().describe('High-freq delta for transient/swoosh detection (default: 0.40)'),
          silenceThreshold: z.number().optional().describe('RMS floor for silence detection (default: 0.02)'),
          impactThreshold: z.number().optional().describe('Combined band delta for impact detection (default: 0.50)'),
          buildMinFrames: z.number().optional().describe('Minimum rising frames to count as a build (default: 30)'),
        }).optional().describe('Tune detection sensitivity — lower thresholds = more events detected'),
        bpmRange: z.object({
          min: z.number().optional().default(60),
          max: z.number().optional().default(200),
        }).optional().describe('Constrain BPM detection range'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        // Validate extension
        const ext = path.extname(args.audioFile).toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(ext)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Invalid audio file extension '${ext}'. Expected one of: ${AUDIO_EXTENSIONS.join(', ')}`,
                suggestion: 'Provide a music file (mp3, wav, aac, ogg, m4a).',
              }),
            }],
          };
        }

        // Verify file exists
        const audioPath = path.join(args.projectPath, 'assets', 'audio', args.audioFile);
        if (!await fs.pathExists(audioPath)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Audio file not found: assets/audio/${args.audioFile}`,
                suggestion: 'Run import_asset first to copy the audio into the project.',
              }),
            }],
          };
        }

        // File size guard
        const stat = await fs.stat(audioPath);
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          const sizeMB = Math.round(stat.size / (1024 * 1024));
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Audio file is ${sizeMB}MB — exceeds the 50MB limit.`,
                suggestion: 'Trim the audio or use a compressed format (mp3 instead of wav).',
              }),
            }],
          };
        }

        // Get fps from composition
        const composition = await readComposition(args.projectPath);
        const fps = composition.settings.fps;

        // Run full audio analysis
        const result = await analyzeAudio(audioPath, fps, args.sensitivity, args.bpmRange);

        if (result.events.length === 0 && result.beatCount === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: 'No audio events or beats detected in this file.',
                suggestion: 'The audio may be too quiet or uniform. Try lowering sensitivity thresholds or use a more dynamic audio file.',
              }),
            }],
          };
        }

        // Save analysis JSON sidecar
        const audioNameWithoutExt = path.basename(args.audioFile, ext);
        const analysisFilename = `${audioNameWithoutExt}-analysis.json`;
        const analysisPath = path.join(args.projectPath, 'assets', 'audio', analysisFilename);
        await fs.writeJson(analysisPath, result, { spaces: 2 });

        // Build next_steps guidance
        const eventSummary = result.events.length > 0
          ? result.events
              .sort((a, b) => b.intensity - a.intensity)
              .slice(0, 5)
              .map(e => `  - ${e.type} at frame ${e.frame} (${e.time}s) — intensity ${Math.round(e.intensity * 100)}%`)
              .join('\n')
          : '  No dramatic events detected — this may be ambient or very uniform audio.';

        const cutSummary = result.suggestedSceneCuts
          .map(c => `  - Frame ${c.frame}: ${c.reason}`)
          .join('\n');

        const nextSteps = [
          `Analysis saved to assets/audio/${analysisFilename}.`,
          ``,
          `Top events (strongest first):`,
          eventSummary,
          ``,
          `Suggested scene cuts:`,
          cutSummary,
          ``,
          result.bpm > 0
            ? `BPM: ${result.bpm} — use suggestedSceneDurations for beat-aligned scene lengths.`
            : `No BPM detected — use events and energy shifts to guide scene timing.`,
          ``,
          `For real-time audio reactivity in scenes, wrap elements in <AudioReactive>:`,
          `  import { AudioReactive, useAudioReactive } from '../src/primitives';`,
        ].join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              audioFile: args.audioFile,
              analysisJsonPath: `assets/audio/${analysisFilename}`,
              ...result,
              next_steps: nextSteps,
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
              suggestion: 'Verify the audio file is valid. If MP3 decode fails, try converting to WAV first.',
            }),
          }],
        };
      }
    }
  );
}
