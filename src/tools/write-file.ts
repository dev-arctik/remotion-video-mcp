import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';

// Files that must never be overwritten — they're generated or managed by other tools
const PROTECTED_FILES = [
  'composition.json',
  'src/Root.tsx',
  'src/SceneRenderer.tsx',
  'package.json',
  'tsconfig.json',
  'remotion.config.ts',
  'src/index.ts',
];

const ALLOWED_EXTENSIONS = ['.tsx', '.ts', '.css', '.json'];

export function registerWriteFile(server: McpServer): void {
  server.registerTool(
    'write_file',
    {
      title: 'Write File',
      description: `Write a code file (.tsx, .ts, .css, .json) to the Remotion project.
Use this to create custom components, theme files, shared utils, or any code the
pre-built templates don't cover. Protected system files (Root.tsx, composition.json,
package.json, etc.) cannot be overwritten. If the file already exists it will be
replaced — a warning is included in the response.
Call read_file first if you need to inspect existing content before editing.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
        filePath: z.string().describe(
          'Path relative to project root where the file will be written. ' +
          'Allowed extensions: .tsx, .ts, .css, .json. ' +
          'Example: "src/overlays/BouncingBall.tsx"'
        ),
        content: z.string().describe('Full UTF-8 file content to write'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);

        const normalizedFilePath = path.normalize(args.filePath);

        // Path traversal guard — reject '..' segments
        if (normalizedFilePath.includes('..')) {
          throw new Error(
            `File path must not contain '..': '${args.filePath}'. Use paths relative to the project root.`
          );
        }

        // Resolve and verify the path stays inside the project
        const resolvedPath = path.resolve(args.projectPath, normalizedFilePath);
        const resolvedProject = path.resolve(args.projectPath);
        if (!resolvedPath.startsWith(resolvedProject + path.sep) && resolvedPath !== resolvedProject) {
          throw new Error(`File path escapes the project root: '${args.filePath}'`);
        }

        // Protected file check
        const isProtected = PROTECTED_FILES.some(
          (p) => path.normalize(p) === normalizedFilePath
        );
        if (isProtected) {
          throw new Error(
            `Cannot write to protected file: '${args.filePath}'. ` +
            `Protected files: ${PROTECTED_FILES.join(', ')}`
          );
        }

        // Extension check
        const ext = path.extname(normalizedFilePath).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          throw new Error(
            `Extension '${ext}' is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}. ` +
            `For binary assets (images, audio, fonts), use import_asset instead.`
          );
        }

        // Check if file already exists (for overwrite warning)
        const fileExisted = await fs.pathExists(resolvedPath);

        // Create intermediate directories and write
        await fs.ensureDir(path.dirname(resolvedPath));
        await fs.writeFile(resolvedPath, args.content, 'utf-8');

        const stat = await fs.stat(resolvedPath);
        const result: Record<string, unknown> = {
          status: 'success',
          writtenPath: normalizedFilePath,
          sizeBytes: stat.size,
          next_steps: 'File is ready. Use add_overlay to register it as a global overlay, or import it from scene files.',
        };

        // Warn if we overwrote an existing file
        if (fileExisted) {
          result.warning = `File '${normalizedFilePath}' already existed and was replaced. Use read_file first to inspect before overwriting.`;
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const error = err as Error;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'error',
              message: error.message,
              suggestion: 'Verify the file path is relative to the project root and uses an allowed extension.',
            }),
          }],
        };
      }
    }
  );
}
