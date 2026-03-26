import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import type { Scene } from '../state/project-state.js';
import { validateProjectPath, writeSceneFile, regenerateRootTsx, toSafeFilename } from '../utils/file-ops.js';

export function registerUpdateScene(server: McpServer): void {
  server.registerTool(
    'update_scene',
    {
      title: 'Update Scene',
      description: `Modify an existing scene. Can update componentCode, duration, transitions, or metadata.
Pass componentCode to rewrite the scene using composable primitives.
Only modifies the specified scene. After updating, remind the user to check the preview.

PRIMITIVES: import { AnimatedText, AnimatedImage, AnimatedShape, Background, LayoutStack, LayoutSplit, Stagger, BeatSync } from '../src/primitives';

REMOTION RULES:
  - Animations: useCurrentFrame() + interpolate()/spring() ONLY — CSS animations are FORBIDDEN
  - Audio: import { Audio } from '@remotion/media'
  - Spring: { damping: 200 } smooth | { damping: 20, stiffness: 200 } snappy | { damping: 8 } bouncy
  - Always clamp: { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }`,
      inputSchema: z.object({
        projectPath: z.string(),
        sceneId: z.string().describe('ID of the scene to update'),
        sceneName: z.string().optional(),
        durationFrames: z.number().optional(),
        audioSegmentIds: z.array(z.string()).optional(),
        transition: z.object({
          in: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
          out: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
        }).optional(),
        props: z.record(z.string(), z.unknown()).optional().describe('Metadata stored in composition.json'),
        componentCode: z.string().optional().describe(
          'TSX component code using composable primitives (AnimatedText, Background, etc.). ' +
          'Import from "../src/primitives".'
        ),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        const sceneIndex = composition.scenes.findIndex(s => s.id === args.sceneId);
        if (sceneIndex === -1) {
          throw new Error(`Scene '${args.sceneId}' not found. Use list_scenes to see available scenes.`);
        }

        const existing = composition.scenes[sceneIndex];
        const updated: Scene = {
          ...existing,
          ...(args.sceneName !== undefined && { name: args.sceneName }),
          ...(args.durationFrames !== undefined && { durationFrames: args.durationFrames }),
          ...(args.audioSegmentIds !== undefined && { audioSegmentIds: args.audioSegmentIds }),
          ...(args.transition !== undefined && { transition: args.transition as Scene['transition'] }),
          ...(args.props !== undefined && { props: args.props }),
        };

        // Update file path if name changed — sanitize the new name
        if (args.sceneName !== undefined && args.sceneName !== existing.name) {
          const safeName = toSafeFilename(args.sceneName);
          updated.file = `scenes/${args.sceneId}-${safeName}.tsx`;
          // Delete the old file
          const oldPath = path.join(args.projectPath, existing.file);
          if (await fs.pathExists(oldPath)) await fs.remove(oldPath);
        }

        composition.scenes[sceneIndex] = updated;
        composition.scenes = recalculateStartFrames(composition.scenes);

        await writeComposition(args.projectPath, composition);

        // Write scene file — componentCode if provided, otherwise keep existing file
        if (args.componentCode) {
          await writeSceneFile(args.projectPath, updated, args.componentCode);
        }

        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              sceneId: args.sceneId,
              file: updated.file,
              durationFrames: updated.durationFrames,
              scenes: composition.scenes.map(s => ({
                id: s.id,
                name: s.name,
                startFrame: s.startFrame,
                durationFrames: s.durationFrames,
              })),
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
