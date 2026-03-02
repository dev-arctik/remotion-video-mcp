import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { validateProjectPath } from '../utils/file-ops.js';

// Extension → asset category mapping (matches scan_assets patterns)
const EXTENSION_CATEGORY: Record<string, string> = {
  '.png': 'images', '.jpg': 'images', '.jpeg': 'images',
  '.gif': 'images', '.svg': 'images', '.webp': 'images',
  '.mp3': 'audio', '.wav': 'audio', '.aac': 'audio',
  '.ogg': 'audio', '.m4a': 'audio', '.json': 'audio',
  '.ttf': 'fonts', '.otf': 'fonts', '.woff': 'fonts', '.woff2': 'fonts',
};

const VALID_EXTENSIONS = Object.keys(EXTENSION_CATEGORY);

// Build tree of all files in assets/ — gives the AI a quick view of what's available
async function buildAssetTree(projectPath: string): Promise<Record<string, string[]>> {
  const assetsDir = path.join(projectPath, 'assets');
  const tree: Record<string, string[]> = { images: [], audio: [], fonts: [] };

  for (const category of ['images', 'audio', 'fonts']) {
    const catDir = path.join(assetsDir, category);
    if (await fs.pathExists(catDir)) {
      const files = await glob('**/*', { cwd: catDir, nodir: true });
      // Filter out .gitkeep
      tree[category] = files.filter((f) => f !== '.gitkeep').sort();
    }
  }
  return tree;
}

// Find a non-conflicting filename by appending -1, -2, etc.
function findAvailableFilename(destDir: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  for (let i = 1; i <= 99; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!fs.pathExistsSync(path.join(destDir, candidate))) {
      return candidate;
    }
  }
  throw new Error(`Could not find available filename for '${filename}' after 99 attempts.`);
}

export function registerImportAsset(server: McpServer): void {
  server.registerTool(
    'import_asset',
    {
      title: 'Import Asset',
      description: `Copy files from any location (typically temp uploads) into the project's
assets/ directory. Automatically detects the category (images, audio, fonts)
from the file extension. Returns publicPath values ready for staticFile() calls.
Also returns an assetTree showing all files in each asset folder.
For binary assets only — use write_file for code files (.tsx, .ts, .css).`,
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
        files: z.array(
          z.object({
            sourcePath: z.string().describe('Absolute path to the source file (e.g. /tmp/upload_abc.jpg)'),
            destFilename: z.string().optional().describe(
              'Custom filename for the destination (e.g. "hero-image.jpg"). Defaults to the source filename.'
            ),
            category: z.enum(['images', 'audio', 'fonts']).optional().describe(
              'Override the auto-detected category. Omit to detect from file extension.'
            ),
          })
        ).min(1).describe('One or more files to import'),
        onDuplicate: z.enum(['overwrite', 'rename']).optional().default('overwrite').describe(
          '"overwrite" (default) replaces existing files. "rename" appends -1, -2, etc. to avoid collision.'
        ),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        const imported: Record<string, unknown>[] = [];
        const errors: Record<string, unknown>[] = [];

        for (const file of args.files) {
          try {
            // Reject URLs — only local file paths
            if (file.sourcePath.startsWith('http://') || file.sourcePath.startsWith('https://')) {
              throw new Error(
                `URL import is not supported. Provide a local file path instead of '${file.sourcePath}'.`
              );
            }

            // Source path traversal guard
            if (file.sourcePath.includes('..')) {
              throw new Error(`Source path must not contain '..': '${file.sourcePath}'`);
            }

            // Verify source exists
            if (!await fs.pathExists(file.sourcePath)) {
              throw new Error(`Source file not found: '${file.sourcePath}'`);
            }

            // Determine filename — use custom or fall back to source filename
            let filename = file.destFilename ?? path.basename(file.sourcePath);

            // If destFilename has no extension, inherit from source
            if (file.destFilename && !path.extname(file.destFilename)) {
              filename = file.destFilename + path.extname(file.sourcePath);
            }

            // Determine category
            const ext = path.extname(filename).toLowerCase();
            const category = file.category ?? EXTENSION_CATEGORY[ext];
            if (!category) {
              throw new Error(
                `Unknown extension '${ext}' for file '${filename}'. ` +
                `Valid extensions: ${VALID_EXTENSIONS.join(', ')}`
              );
            }

            // Build destination path
            const destDir = path.join(args.projectPath, 'assets', category);
            await fs.ensureDir(destDir);

            // Handle duplicate filenames
            const destExists = await fs.pathExists(path.join(destDir, filename));
            if (destExists && args.onDuplicate === 'rename') {
              filename = findAvailableFilename(destDir, filename);
            }

            const destPath = path.join(destDir, filename);

            // Copy the file (overwrite if exists and mode is 'overwrite')
            await fs.copy(file.sourcePath, destPath, { overwrite: true });

            const stat = await fs.stat(destPath);
            imported.push({
              sourcePath: file.sourcePath,
              filename,
              category,
              destPath,
              publicPath: `${category}/${filename}`,
              sizeKB: Math.round(stat.size / 1024),
            });
          } catch (fileErr) {
            const fileError = fileErr as Error;
            errors.push({
              sourcePath: file.sourcePath,
              error: fileError.message,
            });
          }
        }

        // Build asset tree so the AI knows what's in each folder
        const assetTree = await buildAssetTree(args.projectPath);

        // Determine overall status
        const total = args.files.length;
        const succeeded = imported.length;
        const failed = errors.length;
        let status: string;
        if (failed === 0) status = 'success';
        else if (succeeded === 0) status = 'error';
        else status = 'partial';

        const result = {
          status,
          imported,
          errors,
          summary: { total, succeeded, failed },
          assetTree,
          next_steps: succeeded > 0
            ? 'Files are ready. Use publicPath values directly in staticFile() calls or scene props.'
            : 'All imports failed. Check the errors array and verify source paths.',
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
              suggestion: 'Verify projectPath is valid and source file paths are absolute.',
            }),
          }],
        };
      }
    }
  );
}
