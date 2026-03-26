import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readComposition } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerRegenerateRoot(server: McpServer): void {
  server.registerTool(
    'regenerate_root',
    {
      title: 'Regenerate Root.tsx',
      description: `Rebuild src/Root.tsx from composition.json. Use this when Root.tsx is broken
or out of sync — for example, after fixing audio paths or overlay data via update_composition.
This re-reads composition.json and regenerates Root.tsx from scratch.
Prefer fixing the source data in composition.json first, then calling this tool.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
      }),
    },
    async ({ projectPath }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);
        await regenerateRootTsx(projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              message: 'Root.tsx regenerated from composition.json.',
              scenesIncluded: composition.scenes.length,
              overlaysIncluded: (composition.overlays ?? []).length,
              audioType: composition.audio.type,
              next_steps: 'Check the preview — Root.tsx should now reflect the latest composition state.',
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
              suggestion: 'Verify projectPath is valid and composition.json exists.',
            }),
          }],
        };
      }
    }
  );
}
