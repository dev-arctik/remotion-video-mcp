import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readComposition, writeComposition } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerUpdateComposition(server: McpServer): void {
  server.registerTool(
    'update_composition',
    {
      title: 'Update Composition',
      description: `Update global composition settings — style, audio config, dimensions, fps, etc.
Does NOT modify individual scenes (use update_scene for that).
Use this for changing the overall theme, swapping audio, or changing resolution.`,
      inputSchema: z.object({
        projectPath: z.string(),
        settings: z.object({
          width: z.number().optional(),
          height: z.number().optional(),
          fps: z.number().optional(),
          totalDurationFrames: z.number().nullable().optional(),
          backgroundColor: z.string().optional(),
        }).optional(),
        style: z.object({
          theme: z.string().optional(),
          primaryColor: z.string().optional(),
          secondaryColor: z.string().optional(),
          accentColor: z.string().optional(),
          fontFamily: z.string().optional(),
          headingFontFamily: z.string().optional(),
          defaultTextColor: z.string().optional(),
          defaultFontSize: z.number().optional(),
        }).optional(),
        audio: z.object({
          type: z.enum(['narration', 'background', 'none']).optional(),
          narration: z.record(z.string(), z.unknown()).optional(),
          backgroundMusic: z.record(z.string(), z.unknown()).optional(),
        }).optional(),
        metadata: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
        }).optional(),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Shallow-merge each top-level section
        if (args.settings) {
          composition.settings = { ...composition.settings, ...args.settings };
        }
        if (args.style) {
          composition.style = { ...composition.style, ...args.style };
        }
        if (args.audio) {
          composition.audio = { ...composition.audio, ...args.audio };
        }
        if (args.metadata) {
          composition.metadata = { ...composition.metadata, ...args.metadata };
        }

        await writeComposition(args.projectPath, composition);
        // Regenerate Root.tsx in case dimensions, fps, or audio changed
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              message: 'Composition settings updated.',
              updatedSections: [
                args.settings && 'settings',
                args.style && 'style',
                args.audio && 'audio',
                args.metadata && 'metadata',
              ].filter(Boolean),
              next_steps: 'Check the preview to see global changes applied.',
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
              suggestion: 'Verify projectPath and check composition.json is valid.',
            }),
          }],
        };
      }
    }
  );
}
