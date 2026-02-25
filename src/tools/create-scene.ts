import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import type { Scene } from '../state/project-state.js';
import { validateProjectPath, writeSceneFile, regenerateRootTsx, sceneIdToComponentName } from '../utils/file-ops.js';

export function registerCreateScene(server: McpServer): void {
  server.registerTool(
    'create_scene',
    {
      title: 'Create Scene',
      description: `Create a new scene file in scenes/ and register it in composition.json.
For narration-driven videos, set durationFrames from audio segment timing:
  durationFrames = Math.ceil((segmentEndTime - segmentStartTime) * fps)
After creating, remind the user to check the preview.`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe("Unique scene ID, e.g. 'scene-001'"),
        sceneName: z.string().describe("Human-readable name, e.g. 'intro'"),
        sceneType: z.enum([
          'title-card', 'text-scene', 'image-scene', 'text-with-image',
          'kinetic-typography', 'code-block', 'transition-wipe', 'custom',
        ]),
        durationFrames: z.number().describe('Duration in frames. At 30fps: 30=1sec, 90=3sec'),
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

        // 1. Read fresh state from disk
        const composition = await readComposition(args.projectPath);

        // 2. Check for duplicate scene ID
        if (composition.scenes.find(s => s.id === args.sceneId)) {
          throw new Error(`Scene '${args.sceneId}' already exists. Use update_scene to modify it.`);
        }

        // 3. Check for component name collision
        const newComponentName = sceneIdToComponentName(args.sceneId);
        const existingNames = composition.scenes.map(s => sceneIdToComponentName(s.id));
        if (existingNames.includes(newComponentName)) {
          throw new Error(`Scene ID '${args.sceneId}' produces component name '${newComponentName}' which collides with an existing scene.`);
        }

        // 4. Build the new scene entry
        const newScene: Scene = {
          id: args.sceneId,
          name: args.sceneName,
          type: args.sceneType,
          file: `scenes/${args.sceneId}-${args.sceneName}.tsx`,
          durationFrames: args.durationFrames,
          startFrame: 0, // recalculated below
          audioSegmentIds: args.audioSegmentIds,
          transition: args.transition as Scene['transition'],
          props: args.props,
          objects: args.objects,
        };

        // 5. Append to scenes array
        composition.scenes.push(newScene);

        // 6. Recalculate ALL startFrame values
        composition.scenes = recalculateStartFrames(composition.scenes);

        // 7. Write back to disk
        await writeComposition(args.projectPath, composition);

        // 8. Generate the .tsx file
        const updatedScene = composition.scenes.find(s => s.id === args.sceneId)!;
        await writeSceneFile(args.projectPath, updatedScene, composition);

        // 9. Regenerate Root.tsx to include the new scene
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              sceneId: args.sceneId,
              file: newScene.file,
              durationFrames: args.durationFrames,
              totalScenes: composition.scenes.length,
              next_steps: 'Check the preview if running, or call start_preview to see the scene.',
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
              suggestion: 'Ensure projectPath is valid and sceneId is unique.',
            }),
          }],
        };
      }
    }
  );
}
