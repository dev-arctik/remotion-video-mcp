import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateProjectPath } from '../utils/file-ops.js';
import { readComposition } from '../state/project-state.js';

// Returns current theme overrides on the composition.
// Use to discover what's customized vs. defaults — pair with list_tokens for full picture.
export function registerGetTheme(server: McpServer): void {
  server.registerTool(
    'get_theme',
    {
      title: 'Get Theme',
      description: `Returns the current theme overrides stored in composition.json. The MCP server
holds only the OVERRIDES — the resolved Theme is built at render time by buildTheme()
inside the scaffolded project. Pair with list_tokens to see what defaults look like.`,
      inputSchema: {
        projectPath: z.string().describe('Absolute path to the Remotion project directory'),
      },
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              themeOverrides: composition.theme ?? {},
              legacyStyle: composition.style,
              note: 'The defaults (when no override is set) come from defaultTheme in src/primitives/tokens/theme.ts. Use list_tokens for the full default catalog.',
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
