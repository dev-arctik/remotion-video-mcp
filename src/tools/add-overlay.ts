import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition } from '../state/project-state.js';
import type { Overlay } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx, sceneIdToComponentName } from '../utils/file-ops.js';

export function registerAddOverlay(server: McpServer): void {
  server.registerTool(
    'add_overlay',
    {
      title: 'Add Overlay',
      description: `Register a custom component as a global overlay that renders on top of scenes.
The component file must already exist on disk (use write_file first).
Overlays persist across all scene mutations — they survive create_scene,
update_scene, delete_scene, and reorder_scenes calls.
Omit startFrame/endFrame for full-video-duration overlays (logos, watermarks).
Set them for partial-duration overlays (animations that appear briefly).`,
      inputSchema: z.object({
        projectPath: z.string(),
        overlayId: z.string().describe("Unique kebab-case ID, e.g. 'overlay-bouncing-ball'"),
        name: z.string().describe("Human-readable label, e.g. 'Bouncing Ball'"),
        componentName: z.string().describe(
          'Named export in the .tsx file — must match exactly. Example: "BouncingBall"'
        ),
        file: z.string().describe(
          'Project-relative path to the component file. Example: "src/overlays/BouncingBall.tsx"'
        ),
        zIndex: z.number().optional().default(10).describe(
          'Render order. Higher = on top. Default 10.'
        ),
        startFrame: z.number().optional().describe(
          'First frame the overlay appears. Omit for full-video-duration.'
        ),
        endFrame: z.number().optional().describe(
          'Last frame the overlay appears. Omit for full-video-duration.'
        ),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        const composition = await readComposition(args.projectPath);

        // Initialize overlays array if missing (pre-existing projects)
        composition.overlays ??= [];

        // Check for duplicate overlay ID
        if (composition.overlays.find((o) => o.id === args.overlayId)) {
          throw new Error(
            `Overlay '${args.overlayId}' already exists. Use remove_overlay first, then re-add.`
          );
        }

        // Verify the component file exists on disk
        const resolvedFile = path.resolve(args.projectPath, args.file);
        if (!await fs.pathExists(resolvedFile)) {
          throw new Error(
            `Component file not found: '${args.file}'. Use write_file to create it first.`
          );
        }

        // Check componentName doesn't collide with scene component names
        const sceneComponentNames = composition.scenes.map((s) => sceneIdToComponentName(s.id));
        if (sceneComponentNames.includes(args.componentName)) {
          throw new Error(
            `componentName '${args.componentName}' collides with an existing scene component. ` +
            `Scene component names are derived from scene IDs. Choose a different name.`
          );
        }

        // Check componentName doesn't collide with existing overlay component names
        const overlayComponentNames = composition.overlays.map((o) => o.componentName);
        if (overlayComponentNames.includes(args.componentName)) {
          throw new Error(
            `componentName '${args.componentName}' is already used by another overlay. Choose a different name.`
          );
        }

        // Validate startFrame/endFrame logic
        if (args.startFrame != null && args.endFrame != null && args.endFrame <= args.startFrame) {
          throw new Error(`endFrame (${args.endFrame}) must be greater than startFrame (${args.startFrame}).`);
        }

        // Build overlay entry
        const overlay: Overlay = {
          id: args.overlayId,
          name: args.name,
          componentName: args.componentName,
          file: args.file,
          zIndex: args.zIndex ?? 10,
        };
        if (args.startFrame != null) overlay.startFrame = args.startFrame;
        if (args.endFrame != null) overlay.endFrame = args.endFrame;

        // Persist and regenerate
        composition.overlays.push(overlay);
        await writeComposition(args.projectPath, composition);
        await regenerateRootTsx(args.projectPath, composition);

        const result = {
          status: 'success',
          overlay,
          totalOverlays: composition.overlays.length,
          next_steps: 'Overlay registered. Check the preview — it should appear immediately via HMR.',
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Ensure the component file exists (use write_file first) and the overlay ID is unique.',
            }),
          }],
        };
      }
    }
  );
}
