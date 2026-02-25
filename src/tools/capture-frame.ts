import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execa } from 'execa';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';
import { readComposition } from '../state/project-state.js';

export function registerCaptureFrame(server: McpServer): void {
  server.registerTool(
    'capture_frame',
    {
      title: 'Capture Frame',
      description: `Render a single frame as a PNG image for review.
Useful for verifying text positioning, image placement, and animation states.
If a sceneId is provided, the frame number is relative to that scene's startFrame.`,
      inputSchema: z.object({
        projectPath: z.string(),
        frame: z.number().describe('Frame number to capture (0-based)'),
        sceneId: z.string().optional().describe('Optional — makes frame relative to this scene'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        let absoluteFrame = args.frame;

        // If sceneId provided, offset frame by scene's startFrame
        if (args.sceneId) {
          const composition = await readComposition(args.projectPath);
          const scene = composition.scenes.find(s => s.id === args.sceneId);
          if (!scene) throw new Error(`Scene '${args.sceneId}' not found.`);
          absoluteFrame = scene.startFrame + args.frame;
        }

        const outputPath = path.join('output', `frame-${absoluteFrame}.png`);

        await execa('npx', [
          'remotion', 'still', 'main', outputPath,
          '--frame', String(absoluteFrame),
        ], {
          cwd: args.projectPath,
          stdio: 'pipe',
          timeout: 60_000,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              outputPath: path.resolve(args.projectPath, outputPath),
              frame: absoluteFrame,
              next_steps: 'Review the captured frame. If you have vision, analyze it and suggest improvements.',
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
              suggestion: 'Ensure the project compiles and the frame number is within range.',
            }),
          }],
        };
      }
    }
  );
}
