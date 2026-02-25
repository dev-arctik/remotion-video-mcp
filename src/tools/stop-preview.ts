import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateProjectPath } from '../utils/file-ops.js';
import { stopProcess, isRunning } from '../utils/process-manager.js';

export function registerStopPreview(server: McpServer): void {
  server.registerTool(
    'stop_preview',
    {
      title: 'Stop Preview',
      description: 'Stop the Remotion Studio dev server. Call this before render_video or when done previewing.',
      inputSchema: z.object({
        projectPath: z.string().describe('Path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);

        if (!isRunning(projectPath)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'not_running',
                message: 'No preview server is running for this project.',
              }),
            }],
          };
        }

        await stopProcess(projectPath);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'stopped',
              message: 'Preview server stopped.',
              next_steps: 'You can now call render_video to produce the final output.',
            }, null, 2),
          }],
        };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ status: 'error', message: error.message }),
          }],
        };
      }
    }
  );
}
