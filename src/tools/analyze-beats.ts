import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';
import { readComposition } from '../state/project-state.js';
import { analyzeBeats } from '../utils/beat-analysis.js';

// Max file size for beat analysis (50MB) — large files can exhaust memory during PCM decode
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.ogg', '.m4a'];

export function registerAnalyzeBeats(server: McpServer): void {
  server.registerTool(
    'analyze_beats',
    {
      title: 'Analyze Beats',
      description: `Detect BPM and beat positions in a background music / instrumental audio file.
Returns beat timestamps mapped to Remotion frame numbers, plus suggested scene
durations at 4-beat, 8-beat, and 16-beat multiples. Saves a beats JSON sidecar
file alongside the audio in assets/audio/.

Works best with 4/4 time signature music (EDM, pop, rock, trailer music).
Results may be less accurate for jazz, classical, or irregular rhythms.

Call this ONLY after the user confirms the audio is instrumental/beats — not narration.
The import_asset tool's response will guide you on when to suggest this.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
        audioFile: z.string().describe(
          'Filename in assets/audio/ (e.g., "trailer-music.mp3"). Must be an audio file, not a .json timestamp file.'
        ),
        bpmRange: z.object({
          min: z.number().optional().default(60).describe('Minimum expected BPM (default: 60)'),
          max: z.number().optional().default(200).describe('Maximum expected BPM (default: 200)'),
        }).optional().describe('Constrain BPM detection range for better accuracy with known genres'),
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
                suggestion: 'Provide a music file (mp3, wav, aac, ogg, m4a). JSON timestamp files are for narration, not beat analysis.',
              }),
            }],
          };
        }

        // Resolve full path and verify file exists
        const audioPath = path.join(args.projectPath, 'assets', 'audio', args.audioFile);
        if (!await fs.pathExists(audioPath)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Audio file not found: assets/audio/${args.audioFile}`,
                suggestion: 'Run import_asset first to copy the audio into the project, or verify the audioFile filename matches exactly.',
              }),
            }],
          };
        }

        // File size guard — large files can exhaust memory during PCM decode
        const stat = await fs.stat(audioPath);
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          const sizeMB = Math.round(stat.size / (1024 * 1024));
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Audio file is ${sizeMB}MB — exceeds the 50MB limit for beat analysis.`,
                suggestion: 'Trim the audio to a shorter clip before importing, or use a compressed format (mp3 instead of wav).',
              }),
            }],
          };
        }

        // Read composition to get fps
        const composition = await readComposition(args.projectPath);
        const fps = composition.settings.fps;

        // Run beat detection
        const beatData = await analyzeBeats(audioPath, fps, args.bpmRange);

        if (beatData.beatCount === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: 'No beats detected in this audio file.',
                suggestion: 'This may not be a rhythmic track, or the audio is too short. Try a different file or adjust bpmRange if the tempo is outside the default 60–200 BPM range.',
              }),
            }],
          };
        }

        // Save beats JSON sidecar — <audioName>-beats.json
        const audioNameWithoutExt = path.basename(args.audioFile, ext);
        const beatsFilename = `${audioNameWithoutExt}-beats.json`;
        const beatsPath = path.join(args.projectPath, 'assets', 'audio', beatsFilename);
        await fs.writeJson(beatsPath, beatData, { spaces: 2 });

        const result = {
          status: 'success',
          audioFile: args.audioFile,
          beatsJsonPath: `assets/audio/${beatsFilename}`,
          bpm: beatData.bpm,
          beatCount: beatData.beatCount,
          beatIntervalMs: beatData.beatIntervalMs,
          fps,
          beats: beatData.beats,
          suggestedSceneDurations: beatData.suggestedSceneDurations,
          next_steps: [
            `Beat data saved to assets/audio/${beatsFilename}.`,
            `Use suggestedSceneDurations to set scene durationFrames that align with beats:`,
            `  - 4-beat phrases (${beatData.suggestedSceneDurations['4-beat'].frames} frames / ${beatData.suggestedSceneDurations['4-beat'].seconds}s) — quick cuts, fast transitions`,
            `  - 8-beat phrases (${beatData.suggestedSceneDurations['8-beat'].frames} frames / ${beatData.suggestedSceneDurations['8-beat'].seconds}s) — standard scene length`,
            `  - 16-beat phrases (${beatData.suggestedSceneDurations['16-beat'].frames} frames / ${beatData.suggestedSceneDurations['16-beat'].seconds}s) — longer scenes with more content`,
            `For a ${beatData.bpm} BPM track, 8-beat scenes feel natural for most content.`,
            `Use beats[N].frame values if you need an entrance to land exactly on a specific beat.`,
          ].join('\n'),
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Verify the audio file is a valid music file and the projectPath is correct.',
            }),
          }],
        };
      }
    }
  );
}
