import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateProjectPath } from '../utils/file-ops.js';
import { startProcess, isRunning } from '../utils/process-manager.js';

export function registerStartPreview(server: McpServer): void {
  server.registerTool(
    'start_preview',
    {
      title: 'Start Preview',
      description: `Start the Remotion Studio dev server for live preview.
Launches 'npx remotion studio' in the project directory.
The preview auto-reloads when scene files change.
Safe to call multiple times — if the server is already running, returns status: "already_running"
with the URL (no duplicate server is started). Use this as a status check too.
Tell the user to open the URL in their browser.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);

        if (isRunning(projectPath)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'already_running',
                message: 'Preview server is already running.',
                suggestion: 'Open http://localhost:3000 in your browser.',
              }),
            }],
          };
        }

        const { pid } = await startProcess(projectPath, 'npx', ['remotion', 'studio']);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'running',
              url: 'http://localhost:3000',
              pid,
              message: 'Remotion Studio is running. Open http://localhost:3000 to preview.',
              next_steps: 'Tell the user to open the URL. The preview auto-reloads on file changes.',
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
              suggestion: 'Check that dependencies are installed (npm install) and no other process uses port 3000.',
            }),
          }],
        };
      }
    }
  );
}
