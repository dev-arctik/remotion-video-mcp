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
      description: `Delete one or more scenes. Removes .tsx files, removes entries from composition.json,
recalculates startFrames, and updates Root.tsx. Supports batch deletion via sceneIds array
or deleteAll to remove every scene at once.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().optional().describe('Single scene ID to delete'),
        sceneIds: z.array(z.string()).optional().describe('Multiple scene IDs to delete in one call'),
        deleteAll: z.boolean().optional().describe('When true, deletes ALL scenes in the project'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Resolve which scene IDs to delete
        let idsToDelete: string[];
        if (args.deleteAll) {
          idsToDelete = composition.scenes.map(s => s.id);
        } else {
          // Merge sceneId and sceneIds into a deduplicated list
          const combined = [
            ...(args.sceneId ? [args.sceneId] : []),
            ...(args.sceneIds ?? []),
          ];
          idsToDelete = [...new Set(combined)];
        }

        if (idsToDelete.length === 0) {
          throw new Error('No scenes specified. Provide sceneId, sceneIds, or set deleteAll: true.');
        }

        // Validate all IDs exist before deleting any
        const notFound = idsToDelete.filter(id => !composition.scenes.find(s => s.id === id));
        if (notFound.length > 0) {
          throw new Error(`Scene(s) not found: ${notFound.join(', ')}. Use list_scenes to see available scenes.`);
        }

        // Delete files and remove from composition
        const deletedFiles: string[] = [];
        for (const id of idsToDelete) {
          const idx = composition.scenes.findIndex(s => s.id === id);
          if (idx === -1) continue;

          const sceneFile = composition.scenes[idx].file;
          const filePath = path.join(args.projectPath, sceneFile);
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
          }
          deletedFiles.push(sceneFile);
          composition.scenes.splice(idx, 1);
        }

        // Recalculate startFrames once for all remaining scenes
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(args.projectPath, composition);
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              deletedSceneIds: idsToDelete,
              deletedFiles,
              remainingScenes: composition.scenes.length,
              scenes: composition.scenes.map(s => ({
                id: s.id,
                name: s.name,
                startFrame: s.startFrame,
                durationFrames: s.durationFrames,
              })),
              next_steps: 'Scenes removed. Check the preview to verify.',
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
              suggestion: 'Verify sceneId(s) exist with list_scenes.',
            }),
          }],
        };
      }
    }
  );
}
