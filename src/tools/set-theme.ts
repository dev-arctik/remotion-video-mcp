import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateProjectPath, regenerateRootTsx } from '../utils/file-ops.js';
import { readComposition, writeComposition } from '../state/project-state.js';

// Set or update the design tokens theme on composition.json.
// All primitives read from this theme via useTheme() — one update propagates everywhere.
export function registerSetTheme(server: McpServer): void {
  server.registerTool(
    'set_theme',
    {
      title: 'Set Theme',
      description: `Set or update the design token theme for the composition. The theme drives colors,
typography, motion, and spacing for all primitives via useTheme(). Choose a base palette
('editorial-dark', 'editorial-light', 'cinematic-noir', 'electric-blue', 'forest-warm')
and optionally override individual color roles, type styles, or fonts. After this call,
Root.tsx is regenerated so the new theme takes effect immediately.`,
      inputSchema: {
        projectPath: z.string().describe('Absolute path to the Remotion project directory'),
        palette: z
          .enum(['editorial-dark', 'editorial-light', 'cinematic-noir', 'electric-blue', 'forest-warm'])
          .optional()
          .describe('Base palette — Material 3 color roles applied as the foundation'),
        colorOverrides: z
          .record(z.string(), z.string())
          .optional()
          .describe('Override individual color roles, e.g. { primary: "#FF0000", onPrimary: "#FFFFFF" }. Available roles: primary, onPrimary, primaryContainer, onPrimaryContainer, secondary, onSecondary, tertiary, onTertiary, error, onError, background, onBackground, surface, onSurface, surfaceVariant, onSurfaceVariant, surfaceContainerLowest..Highest, outline, outlineVariant, inverseSurface, inverseOnSurface, inversePrimary'),
        typeOverrides: z
          .record(
            z.string(),
            z.object({
              fontSize: z.number().optional(),
              lineHeight: z.number().optional(),
              letterSpacing: z.number().optional(),
              fontWeight: z.number().optional(),
              fontFamily: z.string().optional(),
            })
          )
          .optional()
          .describe('Override type scale entries. Keys: displayLarge, displayMedium, displaySmall, headlineLarge..Small, titleLarge..Small, bodyLarge..Small, labelLarge..Small'),
        fontFamily: z
          .string()
          .optional()
          .describe('Body font — CSS stack OR named stack (modern, display, editorial, mono, poster)'),
        headingFontFamily: z
          .string()
          .optional()
          .describe('Heading font — CSS stack OR named stack. Defaults to fontFamily.'),
      },
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Merge with any existing theme block (set_theme is incremental — partial updates allowed)
        const existing = composition.theme ?? {};
        composition.theme = {
          ...existing,
          ...(args.palette != null ? { palette: args.palette } : {}),
          ...(args.fontFamily != null ? { fontFamily: args.fontFamily } : {}),
          ...(args.headingFontFamily != null ? { headingFontFamily: args.headingFontFamily } : {}),
          colorOverrides: {
            ...(existing.colorOverrides ?? {}),
            ...(args.colorOverrides ?? {}),
          },
          typeOverrides: {
            ...(existing.typeOverrides ?? {}),
            ...(args.typeOverrides ?? {}),
          },
        };
        // Strip empty override blocks for a cleaner JSON file
        if (Object.keys(composition.theme.colorOverrides ?? {}).length === 0) {
          delete composition.theme.colorOverrides;
        }
        if (Object.keys(composition.theme.typeOverrides ?? {}).length === 0) {
          delete composition.theme.typeOverrides;
        }

        await writeComposition(args.projectPath, composition);
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              theme: composition.theme,
              message: 'Theme updated and Root.tsx regenerated. All primitives now read from new tokens via useTheme().',
              next_steps: 'Run start_preview to see changes, or call set_theme again to layer further overrides.',
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
              suggestion: 'Verify projectPath points to an initialized project. Use list_tokens to see available color roles and type styles.',
            }),
          }],
        };
      }
    }
  );
}
