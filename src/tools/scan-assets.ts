import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { validateProjectPath } from '../utils/file-ops.js';
import { parseTimestampFile } from '../utils/audio-utils.js';

export function registerScanAssets(server: McpServer): void {
  server.registerTool(
    'scan_assets',
    {
      title: 'Scan Assets',
      description: `Scan the assets folder and analyze all files.
Call this whenever the user says they've added files to assets/.
For images: returns file names, dimensions (if detectable), and sizes.
For audio: parses timestamp JSON files and returns segment info.
For fonts: lists available custom font files.
After scanning, present a summary and propose how assets could be used.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);

        const assetsDir = path.join(projectPath, 'assets');

        // Scan images
        const imageFiles = await glob('images/**/*.{png,jpg,jpeg,gif,svg,webp}', { cwd: assetsDir });
        const images = await Promise.all(
          imageFiles.map(async (file) => {
            const fullPath = path.join(assetsDir, file);
            const stat = await fs.stat(fullPath);
            return {
              filename: path.basename(file),
              path: `assets/${file}`,         // for user display
              publicPath: file,               // for staticFile() and composition.json
              sizeKB: Math.round(stat.size / 1024),
              format: path.extname(file).slice(1),
            };
          })
        );

        // Scan audio files
        const audioFiles = await glob('audio/**/*.{mp3,wav,ogg,m4a,json}', { cwd: assetsDir });
        const audio: Record<string, unknown>[] = [];
        for (const file of audioFiles) {
          const fullPath = path.join(assetsDir, file);
          const stat = await fs.stat(fullPath);
          const ext = path.extname(file).slice(1);

          if (ext === 'json') {
            // Try parsing as timestamp file
            try {
              const timestamps = await parseTimestampFile(fullPath);
              audio.push({
                filename: path.basename(file),
                path: `assets/${file}`,
                publicPath: file,
                type: 'timestamps',
                segmentCount: timestamps.segments.length,
                totalDuration: timestamps.totalDuration,
                segments: timestamps.segments,
              });
            } catch {
              // Not a valid timestamp file — just list it
              audio.push({
                filename: path.basename(file),
                path: `assets/${file}`,
                publicPath: file,
                type: 'unknown-json',
                sizeKB: Math.round(stat.size / 1024),
              });
            }
          } else {
            audio.push({
              filename: path.basename(file),
              path: `assets/${file}`,
              publicPath: file,
              format: ext,
              sizeKB: Math.round(stat.size / 1024),
            });
          }
        }

        // Scan fonts
        const fontFiles = await glob('fonts/**/*.{ttf,otf,woff,woff2}', { cwd: assetsDir });
        const fonts = fontFiles.map((file) => ({
          filename: path.basename(file),
          path: `assets/${file}`,
          publicPath: file,
        }));

        const result = {
          status: 'success',
          assets: { images, audio, fonts },
          summary: {
            imageCount: images.length,
            audioFileCount: audio.length,
            fontCount: fonts.length,
          },
          instructions_for_claude:
            'Present a summary of all assets. For narration audio, explain segment count and duration. Propose a scene plan based on available assets and narration segments.',
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
              suggestion: 'Ensure projectPath is valid and assets/ directory exists.',
            }),
          }],
        };
      }
    }
  );
}
