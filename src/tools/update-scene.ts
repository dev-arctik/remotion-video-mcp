import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import type { Scene } from '../state/project-state.js';
import { validateProjectPath, writeSceneFile, regenerateRootTsx } from '../utils/file-ops.js';

export function registerUpdateScene(server: McpServer): void {
  server.registerTool(
    'update_scene',
    {
      title: 'Update Scene',
      description: `Modify an existing scene. Can update props, objects, animations, duration, or transitions.
Only modifies the specified scene. After updating, remind the user to check the preview.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe('ID of the scene to update'),
        // All fields below are optional — only specified fields are updated
        sceneName: z.string().optional(),
        sceneType: z.enum([
          'title-card', 'text-scene', 'image-scene', 'text-with-image',
          'kinetic-typography', 'code-block', 'transition-wipe', 'custom',
        ]).optional(),
        durationFrames: z.number().optional(),
        audioSegmentIds: z.array(z.string()).optional(),
        transition: z.object({
          in: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
          out: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
        }).optional(),
        props: z.record(z.string(), z.unknown()).optional(),
        objects: z.array(z.record(z.string(), z.unknown())).optional(),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Find the existing scene
        const sceneIndex = composition.scenes.findIndex(s => s.id === args.sceneId);
        if (sceneIndex === -1) {
          throw new Error(`Scene '${args.sceneId}' not found. Use list_scenes to see available scenes.`);
        }

        // Merge updates into the existing scene entry
        const existing = composition.scenes[sceneIndex];
        const updated: Scene = {
          ...existing,
          ...(args.sceneName !== undefined && { name: args.sceneName }),
          ...(args.sceneType !== undefined && { type: args.sceneType }),
          ...(args.durationFrames !== undefined && { durationFrames: args.durationFrames }),
          ...(args.audioSegmentIds !== undefined && { audioSegmentIds: args.audioSegmentIds }),
          ...(args.transition !== undefined && { transition: args.transition as Scene['transition'] }),
          ...(args.props !== undefined && { props: args.props }),
          ...(args.objects !== undefined && { objects: args.objects }),
        };

        // Update the file path if name changed
        if (args.sceneName !== undefined && args.sceneName !== existing.name) {
          updated.file = `scenes/${args.sceneId}-${args.sceneName}.tsx`;
          // Delete the old file
          const oldPath = path.join(args.projectPath, existing.file);
          if (await fs.pathExists(oldPath)) await fs.remove(oldPath);
        }

        composition.scenes[sceneIndex] = updated;

        // Recalculate if duration changed
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(args.projectPath, composition);
        await writeSceneFile(args.projectPath, updated, composition);
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              sceneId: args.sceneId,
              file: updated.file,
              durationFrames: updated.durationFrames,
              next_steps: 'Check the preview — it should update automatically.',
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
