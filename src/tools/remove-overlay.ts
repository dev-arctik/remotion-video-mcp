import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition } from '../state/project-state.js';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';

export function registerRemoveOverlay(server: McpServer): void {
  server.registerTool(
    'remove_overlay',
    {
      title: 'Remove Overlay',
      description: `Remove a registered overlay from the composition. Optionally delete the
component file from disk. After removal, Root.tsx is regenerated without
the overlay — it will disappear from the preview immediately.`,
      inputSchema: z.object({
        projectPath: z.string(),
        overlayId: z.string().describe('ID of the overlay to remove'),
        deleteFile: z.boolean().optional().default(false).describe(
          'If true, also deletes the component .tsx file from disk. Default false.'
        ),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        const composition = await readComposition(args.projectPath);
        composition.overlays ??= [];

        // Find the overlay
        const index = composition.overlays.findIndex((o) => o.id === args.overlayId);
        if (index === -1) {
          throw new Error(
            `Overlay '${args.overlayId}' not found. Available overlays: ` +
            (composition.overlays.length > 0
              ? composition.overlays.map((o) => o.id).join(', ')
              : '(none)')
          );
        }

        // Capture file path before removing
        const removed = composition.overlays[index];
        composition.overlays.splice(index, 1);

        // Persist and regenerate
        await writeComposition(args.projectPath, composition);
        await regenerateRootTsx(args.projectPath, composition);

        // Optionally delete the component file
        let fileDeleted = false;
        if (args.deleteFile) {
          const resolvedFile = path.resolve(args.projectPath, removed.file);
          if (await fs.pathExists(resolvedFile)) {
            await fs.remove(resolvedFile);
            fileDeleted = true;
          }
        }

        const result = {
          status: 'success',
          removedOverlayId: args.overlayId,
          fileDeleted,
          remainingOverlays: composition.overlays.length,
          next_steps: 'Overlay removed. Root.tsx has been regenerated.',
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
              suggestion: 'Verify the overlay ID exists in composition.json.',
            }),
          }],
        };
      }
    }
  );
}
