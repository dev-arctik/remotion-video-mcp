import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readComposition } from '../state/project-state.js';
import { validateProjectPath } from '../utils/file-ops.js';

export function registerListScenes(server: McpServer): void {
  server.registerTool(
    'list_scenes',
    {
      title: 'List Scenes',
      description: 'Returns the current scenes array from composition.json with computed total duration. Call this whenever you need a snapshot of the current video state.',
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);
        const { scenes, settings } = composition;
        const totalFrames = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

        const result = {
          status: 'success',
          scenes,
          totalFrames,
          totalSeconds: totalFrames / settings.fps,
          fps: settings.fps,
          sceneCount: scenes.length,
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
              suggestion: 'Verify projectPath points to a valid project with composition.json.',
            }),
          }],
        };
      }
    }
  );
}
