import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa } from 'execa';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';

export function registerRenderVideo(server: McpServer): void {
  server.registerTool(
    'render_video',
    {
      title: 'Render Video',
      description: `Render the final video as MP4 or WebM. Stop the preview server before rendering.
Output is saved to the project's output/ directory.`,
      inputSchema: z.object({
        projectPath: z.string(),
        outputFormat: z.enum(['mp4', 'webm']).optional().default('mp4'),
        quality: z.enum(['draft', 'standard', 'high']).optional().default('standard'),
        outputFileName: z.string().optional().default('output'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        const ext = args.outputFormat ?? 'mp4';
        const outputPath = path.join('output', `${args.outputFileName ?? 'output'}.${ext}`);

        // Map quality to CRF (lower = better quality, larger file)
        const crfMap = { draft: 28, standard: 18, high: 10 };
        const crf = crfMap[args.quality ?? 'standard'];

        await execa('npx', [
          'remotion', 'render', 'main', outputPath,
          '--codec', ext === 'webm' ? 'vp9' : 'h264',
          '--crf', String(crf),
        ], {
          cwd: args.projectPath,
          stdio: 'pipe',
          timeout: 600_000, // 10-minute timeout for long renders
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              outputPath: path.resolve(args.projectPath, outputPath),
              format: ext,
              quality: args.quality,
              next_steps: 'Video rendered! Check the output/ directory.',
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
              suggestion: 'Ensure the preview server is stopped and the project compiles.',
            }),
          }],
        };
      }
    }
  );
}
