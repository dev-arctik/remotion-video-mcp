import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';
import { toSafeFilename } from '../utils/file-ops.js';

// Copy a Lottie JSON file into assets/lottie/ + mirror to public/.
// Use the LottiePlayer primitive in componentCode to render.
export function registerImportLottie(server: McpServer): void {
  server.registerTool(
    'import_lottie',
    {
      title: 'Import Lottie Animation',
      description: `Copy a Lottie JSON animation into the project under assets/lottie/. Mirrored to public/
so staticFile() can serve it. Use LottiePlayer primitive to render. Source Lottie files from
LottieFiles.com (free) or IconScout (paid). Validates the JSON looks like a Lottie file.`,
      inputSchema: {
        projectPath: z.string().describe('Absolute path to the Remotion project'),
        sourcePath: z.string().describe('Absolute path to the Lottie .json file to import'),
        destFilename: z.string().optional().describe('Optional override for destination filename. Defaults to a sanitized version of the source name.'),
      },
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        if (!await fs.pathExists(args.sourcePath)) {
          throw new Error(`Lottie file not found: ${args.sourcePath}`);
        }

        // Validate it looks like a Lottie file (has 'v' version + 'layers' array)
        const content = await fs.readJson(args.sourcePath).catch(() => null);
        if (!content || typeof content !== 'object' || !('v' in content) || !('layers' in content)) {
          throw new Error('File does not look like a Lottie JSON (missing "v" version or "layers" array)');
        }

        // Resolve destination filename
        const sourceBase = path.basename(args.sourcePath, '.json');
        const destBase = args.destFilename
          ? args.destFilename.replace(/\.json$/, '')
          : toSafeFilename(sourceBase);
        const destFilename = `${destBase}.json`;

        // Copy to assets/lottie/
        const lottieDir = path.join(args.projectPath, 'assets', 'lottie');
        await fs.ensureDir(lottieDir);
        const destPath = path.join(lottieDir, destFilename);
        await fs.writeJson(destPath, content);

        // Mirror to public/lottie/
        const publicDir = path.join(args.projectPath, 'public', 'lottie');
        await fs.ensureDir(publicDir);
        await fs.copy(destPath, path.join(publicDir, destFilename));

        const layers = Array.isArray(content.layers) ? content.layers.length : 0;
        const fr = typeof content.fr === 'number' ? content.fr : null;
        const op = typeof content.op === 'number' ? content.op : null;
        const ip = typeof content.ip === 'number' ? content.ip : null;
        const durationFrames = ip != null && op != null ? op - ip : null;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              destPath: `assets/lottie/${destFilename}`,
              publicPath: `lottie/${destFilename}`,
              metadata: { lottieVersion: content.v, layers, sourceFps: fr, durationFrames },
              next_steps: `Use in componentCode: <LottiePlayer src="lottie/${destFilename}" loop={false} />`,
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
