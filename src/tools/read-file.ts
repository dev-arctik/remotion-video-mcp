import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { validateProjectPath } from '../utils/file-ops.js';

export function registerReadFile(server: McpServer): void {
  server.registerTool(
    'read_file',
    {
      title: 'Read File',
      description: `Read any file from the Remotion project. Use this to inspect existing code
before making targeted edits with write_file. No extension restriction —
you can read .tsx, .ts, .css, .json, package.json, etc.
Only files inside the project root are accessible.`,
      inputSchema: z.object({
        projectPath: z.string().describe('Absolute path to the Remotion project root'),
        filePath: z.string().describe(
          'Path relative to project root of the file to read. ' +
          'Example: "src/overlays/BouncingBall.tsx"'
        ),
      }),
    },
    async ({ projectPath, filePath }) => {
      try {
        await validateProjectPath(projectPath);

        const normalizedFilePath = path.normalize(filePath);

        // Path traversal guard
        if (normalizedFilePath.includes('..')) {
          throw new Error(
            `File path must not contain '..': '${filePath}'. Use paths relative to the project root.`
          );
        }

        // Resolve and verify path stays inside project
        const resolvedPath = path.resolve(projectPath, normalizedFilePath);
        const resolvedProject = path.resolve(projectPath);
        if (!resolvedPath.startsWith(resolvedProject + path.sep) && resolvedPath !== resolvedProject) {
          throw new Error(`File path escapes the project root: '${filePath}'`);
        }

        // Check file exists
        if (!await fs.pathExists(resolvedPath)) {
          throw new Error(`File not found: '${filePath}'. Verify the path relative to the project root.`);
        }

        const content = await fs.readFile(resolvedPath, 'utf-8');
        const stat = await fs.stat(resolvedPath);

        const result = {
          status: 'success',
          filePath: normalizedFilePath,
          sizeBytes: stat.size,
          content,
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
              suggestion: 'Verify the file path is relative to the project root and the file exists.',
            }),
          }],
        };
      }
    }
  );
}
