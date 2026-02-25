import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  ensureProjectDirs,
  copyTemplates,
  getServerRoot,
  regenerateRootTsx,
} from '../utils/file-ops.js';
import { writeComposition } from '../state/project-state.js';
import type { Composition } from '../state/project-state.js';

export function registerInitProject(server: McpServer): void {
  server.registerTool(
    'init_project',
    {
      title: 'Initialize Project',
      description: `Scaffold a new Remotion video project. ONLY call after start_session onboarding
is complete. Creates directory tree, copies template components, writes
composition.json, and runs npm install.`,
      inputSchema: z.object({
        projectName: z.string().describe("Folder name in kebab-case, e.g. 'product-launch-video'"),
        workingDirectory: z.string().describe('Parent directory where project folder will be created'),
        title: z.string().describe('Human-readable video title'),
        width: z.number().optional().default(1920),
        height: z.number().optional().default(1080),
        fps: z.number().optional().default(30),
        durationMode: z.enum(['audio', 'manual']),
        durationSeconds: z.number().optional(),
        audioType: z.enum(['narration', 'background', 'none']),
        style: z
          .object({
            theme: z.string().optional(),
            primaryColor: z.string().optional(),
            secondaryColor: z.string().optional(),
            accentColor: z.string().optional(),
            fontFamily: z.string().optional(),
          })
          .optional(),
      }),
    },
    async (args) => {
      const projectPath = path.join(args.workingDirectory, args.projectName);

      try {
        // Guard against re-initializing an existing project
        if (await fs.pathExists(path.join(projectPath, 'composition.json'))) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'error',
                message: `Project already exists at ${projectPath}. Found existing composition.json.`,
                suggestion: 'Use update_composition or create_scene to modify the existing project.',
              }),
            }],
          };
        }

        // 1. Create all directories
        await ensureProjectDirs(projectPath);

        // 2. Copy template components from the MCP server package
        const serverRoot = getServerRoot();
        await copyTemplates(projectPath, serverRoot);

        // 3. Write package.json from scaffold template
        const packageTemplate = await fs.readFile(
          path.join(serverRoot, 'templates', 'project-scaffold', 'package.json.template'),
          'utf-8'
        );
        await fs.writeFile(
          path.join(projectPath, 'package.json'),
          packageTemplate.replace(/\{\{projectName\}\}/g, args.projectName)
        );

        // 4. Write tsconfig.json and remotion.config.ts from scaffold templates
        await fs.copy(
          path.join(serverRoot, 'templates', 'project-scaffold', 'tsconfig.json.template'),
          path.join(projectPath, 'tsconfig.json')
        );
        await fs.copy(
          path.join(serverRoot, 'templates', 'project-scaffold', 'remotion.config.ts.template'),
          path.join(projectPath, 'remotion.config.ts')
        );

        // 5. Build initial composition.json
        const totalDurationFrames =
          args.durationMode === 'manual' && args.durationSeconds
            ? Math.ceil(args.durationSeconds * (args.fps ?? 30))
            : null;

        const composition: Composition = {
          version: '1.0',
          metadata: {
            title: args.title,
            description: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          settings: {
            width: args.width ?? 1920,
            height: args.height ?? 1080,
            fps: args.fps ?? 30,
            totalDurationFrames,
            backgroundColor: '#000000',
          },
          style: {
            theme: args.style?.theme ?? 'minimal',
            primaryColor: args.style?.primaryColor ?? '#2563EB',
            secondaryColor: args.style?.secondaryColor ?? '#1E293B',
            accentColor: args.style?.accentColor ?? '#F59E0B',
            fontFamily: args.style?.fontFamily ?? 'Inter',
            headingFontFamily: args.style?.fontFamily ?? 'Inter',
            defaultTextColor: '#FFFFFF',
            defaultFontSize: 48,
          },
          audio: {
            type: args.audioType,
          },
          scenes: [],
        };

        await writeComposition(projectPath, composition);

        // 6. Generate initial empty Root.tsx
        await regenerateRootTsx(projectPath, composition);

        // 6b. Write src/index.ts — Remotion entry point (auto-discovered by Remotion v4)
        await fs.writeFile(
          path.join(projectPath, 'src', 'index.ts'),
          `// Remotion entry point — re-exports the root composition\n// Remotion auto-discovers this file and registers all <Composition> elements\nexport { RemotionRoot } from './Root';\n`
        );

        // 7. Run npm install with a 2-minute timeout
        try {
          await execa('npm', ['install'], {
            cwd: projectPath,
            stdio: 'pipe',
            timeout: 120_000,
          });
        } catch (installErr) {
          const installError = installErr as Error;
          if (installError.message.includes('timed out')) {
            throw new Error(
              `npm install timed out after 2 minutes. Run 'cd ${projectPath} && npm install' manually.`
            );
          }
          throw installError;
        }

        const result = {
          status: 'success',
          projectPath,
          message: `Project '${args.projectName}' scaffolded and dependencies installed.`,
          next_steps: 'Place assets in assets/ then call scan_assets, or call create_scene directly.',
          structure_created: [
            'assets/images/', 'assets/audio/', 'assets/fonts/',
            'scenes/', 'src/', 'public/', 'output/',
            'composition.json', 'package.json', 'tsconfig.json', 'remotion.config.ts',
            'src/index.ts', 'src/Root.tsx',
          ],
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
              suggestion: 'Check that workingDirectory exists and you have write permissions.',
            }),
          }],
        };
      }
    }
  );
}
