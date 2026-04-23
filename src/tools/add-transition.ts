import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';
import { readComposition, writeComposition } from '../state/project-state.js';

// Set the OUT-transition between a scene and the NEXT scene in sequence.
// Wraps scenes in <TransitionSeries> instead of <Series> when any scene has a transitionOut.
export function registerAddTransition(server: McpServer): void {
  server.registerTool(
    'add_transition',
    {
      title: 'Add Scene Transition',
      description: `Set the outgoing transition between a scene and the NEXT scene. Wraps consecutive
scenes in @remotion/transitions TransitionSeries. To clear a transition, pass presentation: 'none'.
Effective only when there is a next scene — last scene's transitionOut is ignored.`,
      inputSchema: {
        projectPath: z.string().describe('Absolute path to the Remotion project'),
        sceneId: z.string().describe('Scene ID to attach the outgoing transition to'),
        presentation: z
          .enum(['fade', 'slide', 'wipe', 'flip', 'iris', 'clock-wipe', 'none'])
          .describe('Transition presentation. See list_motion_presets for descriptions.'),
        timing: z.enum(['linear', 'spring']).optional().default('spring'),
        durationFrames: z.number().optional().default(15).describe('Total transition duration in frames'),
        direction: z
          .enum(['from-left', 'from-right', 'from-top', 'from-bottom'])
          .optional()
          .describe('Direction for slide / wipe / clock-wipe presentations'),
        springConfig: z
          .object({
            damping: z.number().optional(),
            stiffness: z.number().optional(),
            mass: z.number().optional(),
          })
          .optional()
          .describe('Spring config when timing=spring. Defaults to damping:200, stiffness:100, mass:0.5'),
      },
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        const idx = composition.scenes.findIndex((s) => s.id === args.sceneId);
        if (idx === -1) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Scene not found: ${args.sceneId}`,
                suggestion: 'Call list_scenes to see all scene IDs.',
              }),
            }],
          };
        }

        if (args.presentation === 'none') {
          delete composition.scenes[idx].transitionOut;
        } else {
          composition.scenes[idx].transitionOut = {
            presentation: args.presentation,
            timing: args.timing,
            durationFrames: args.durationFrames,
            direction: args.direction,
            springConfig: args.springConfig,
          };
        }

        await writeComposition(args.projectPath, composition);
        await regenerateRootTsx(args.projectPath, composition);

        const isLast = idx === composition.scenes.length - 1;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              sceneId: args.sceneId,
              transitionOut: composition.scenes[idx].transitionOut,
              warning: isLast ? 'This is the last scene — transitionOut will not render. Add another scene after it for the transition to take effect.' : undefined,
              note: 'Root.tsx regenerated. The composition now uses TransitionSeries instead of Series.',
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
