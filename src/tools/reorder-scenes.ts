import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerReorderScenes(server: McpServer): void {
  server.registerTool(
    'reorder_scenes',
    {
      title: 'Reorder Scenes',
      description: 'Change the order of scenes. Provide the new order as an array of scene IDs. Recalculates all startFrame values and regenerates Root.tsx.',
      inputSchema: z.object({
        projectPath: z.string(),
        sceneOrder: z.array(z.string()).describe('Ordered array of scene IDs in desired sequence'),
      }),
    },
    async ({ projectPath, sceneOrder }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);

        // Validate that all IDs exist and no IDs are missing
        const existingIds = new Set(composition.scenes.map(s => s.id));
        const newIds = new Set(sceneOrder);

        for (const id of sceneOrder) {
          if (!existingIds.has(id)) {
            throw new Error(`Scene '${id}' not found in composition.`);
          }
        }
        for (const id of existingIds) {
          if (!newIds.has(id)) {
            throw new Error(`Scene '${id}' is missing from the new order. All scenes must be included.`);
          }
        }
        if (sceneOrder.length !== composition.scenes.length) {
          throw new Error(`Expected ${composition.scenes.length} scene IDs, got ${sceneOrder.length}.`);
        }

        // Reorder scenes by mapping IDs to their scene objects
        const sceneMap = new Map(composition.scenes.map(s => [s.id, s]));
        composition.scenes = sceneOrder.map(id => sceneMap.get(id)!);

        // Recalculate all startFrames
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(projectPath, composition);
        await regenerateRootTsx(projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              newOrder: sceneOrder,
              scenes: composition.scenes.map(s => ({ id: s.id, name: s.name, startFrame: s.startFrame })),
              next_steps: 'Scenes reordered. Check the preview to verify the new sequence.',
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
              suggestion: 'Use list_scenes to get current scene IDs, then provide ALL IDs in the desired order.',
            }),
          }],
        };
      }
    }
  );
}
