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

        const downbeatCount = beatData.downbeatFrames.length;
        const fourBarCount = beatData.phrases.fourBar.length;
        const eightBarCount = beatData.phrases.eightBar.length;

        // Quality verdict — guides Claude on whether to trust the analysis
        const conf = beatData.stats.avgConfidence;
        const drift = beatData.stats.beatGapStdDev;
        const downbeatStrong = beatData.stats.downbeatStrength >= 1.15;
        const tempoStable = drift < 0.03;
        const verdict =
          conf >= 0.8 && tempoStable
            ? 'high'
            : conf >= 0.6 && (tempoStable || drift < 0.06)
            ? 'medium'
            : 'low';

        const result = {
          status: 'success',
          schemaVersion: beatData.schemaVersion,
          audioFile: args.audioFile,
          beatsJsonPath: `assets/audio/${beatsFilename}`,
          bpm: beatData.bpm,
          beatCount: beatData.beatCount,
          beatIntervalMs: beatData.beatIntervalMs,
          durationSeconds: beatData.durationSeconds,
          fps,
          // Tier counts — surfaces immediately what's available without re-reading the JSON
          tiers: {
            beats: beatData.beatCount,
            downbeats: downbeatCount,
            bars: beatData.phrases.bar.length,
            fourBarPhrases: fourBarCount,
            eightBarPhrases: eightBarCount,
            sixteenBarPhrases: beatData.phrases.sixteenBar.length,
          },
          // Quality stats — Claude should warn the user if low
          quality: {
            verdict,
            avgConfidence: beatData.stats.avgConfidence,
            tempoStability: tempoStable ? 'stable' : drift < 0.06 ? 'moderate-drift' : 'unstable',
            beatGapStdDev: beatData.stats.beatGapStdDev,
            downbeatDetection: downbeatStrong ? 'strong' : 'weak',
            downbeatStrength: beatData.stats.downbeatStrength,
          },
          suggestedSceneDurations: beatData.suggestedSceneDurations,
          // Truncated preview — full data is in the sidecar JSON
          beatsPreview: beatData.beats.slice(0, 8),
          next_steps: [
            `Beat data saved to assets/audio/${beatsFilename}.`,
            ``,
            `WHAT YOU CAN DO NOW (tier-aware):`,
            `  • ${downbeatCount} downbeats detected — anchor MAJOR scene changes here (use beatData.downbeatFrames or useBeat({ tier: 'downbeat' }))`,
            `  • ${fourBarCount} 4-bar phrases (${beatData.suggestedSceneDurations['4-beat'].frames}f each at this fps × 4) — typical for high-energy content`,
            `  • ${eightBarCount} 8-bar phrases — standard verse / chorus length, default for most content`,
            ``,
            `IN COMPONENTCODE — wrap with BeatSync, then call useBeat:`,
            `  const beatData = JSON.parse(staticFile('audio/${beatsFilename}'))`,
            `  <BeatSync data={beatData}>...</BeatSync>`,
            `  const { pulse, isOnBeat, isDownbeat } = useBeat({ tier: 'downbeat', tolerance: 1 });`,
            ``,
            `QUALITY: ${verdict.toUpperCase()} (avg confidence ${conf.toFixed(2)}, tempo ${tempoStable ? 'stable' : 'drifting'}, downbeat ${downbeatStrong ? 'strong' : 'weak'})`,
            verdict === 'low'
              ? `  ⚠ Low confidence — track may have rubato, jazz, or weak transients. Consider manual scene-duration overrides instead of relying on phrase boundaries.`
              : downbeatStrong
              ? `  ✓ Downbeats are reliable — safe to anchor major moments to them.`
              : `  ⚠ Downbeats are heuristic (every 4th beat from phase ${beatData.stats.downbeatPhase}). For acoustic / classical, verify by previewing a few seconds.`,
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
