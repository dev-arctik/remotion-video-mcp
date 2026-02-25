import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerDeleteScene(server: McpServer): void {
  server.registerTool(
    'delete_scene',
    {
      title: 'Delete Scene',
      description: `Delete a scene. Removes the .tsx file, removes the entry from composition.json,
recalculates startFrame for all subsequent scenes, and updates Root.tsx.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe('ID of the scene to delete'),
      }),
    },
    async ({ projectPath, sceneId }) => {
      try {
        await validateProjectPath(projectPath);
        const composition = await readComposition(projectPath);

        const sceneIndex = composition.scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) {
          throw new Error(`Scene '${sceneId}' not found. Use list_scenes to see available scenes.`);
        }

        // Remove the .tsx file from disk
        const sceneFile = composition.scenes[sceneIndex].file;
        const filePath = path.join(projectPath, sceneFile);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }

        // Splice the scene from the array
        composition.scenes.splice(sceneIndex, 1);

        // Recalculate startFrames for remaining scenes
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(projectPath, composition);
        await regenerateRootTsx(projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              deletedSceneId: sceneId,
              deletedFile: sceneFile,
              remainingScenes: composition.scenes.length,
              next_steps: 'Scene removed. Check the preview to verify.',
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
              suggestion: 'Verify sceneId exists with list_scenes.',
            }),
          }],
        };
      }
    }
  );
}
