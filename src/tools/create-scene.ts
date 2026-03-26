import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import { readComposition, writeComposition, recalculateStartFrames } from '../state/project-state.js';
import type { Scene } from '../state/project-state.js';
import { validateProjectPath, writeSceneFile, regenerateRootTsx, sceneIdToComponentName, toSafeFilename } from '../utils/file-ops.js';

// Schema for a single scene entry — reused for both single and batch
const sceneEntrySchema = z.object({
  sceneId: z.string().describe("Unique scene ID, e.g. 'scene-001'"),
  sceneName: z.string().describe("Human-readable name, e.g. 'intro'"),
  durationFrames: z.number().describe('Duration in frames. At 30fps: 30=1sec, 90=3sec'),
  audioSegmentIds: z.array(z.string()).optional(),
  transition: z.object({
    in: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
    out: z.object({ type: z.string(), durationFrames: z.number().optional() }).optional(),
  }).optional(),
  props: z.record(z.string(), z.unknown()).optional().describe('Metadata stored in composition.json (backgroundColor, etc.)'),
  componentCode: z.string().optional().describe(
    'TSX component code using composable primitives (AnimatedText, Background, LayoutStack, etc.). ' +
    'Import from "../src/primitives". If omitted, a placeholder scene is generated.'
  ),
});

export function registerCreateScene(server: McpServer): void {
  server.registerTool(
    'create_scene',
    {
      title: 'Create Scene',
      description: `Create one or more scenes. Each scene gets a .tsx file and an entry in composition.json.
Supports batch creation via the scenes array — all scenes are added in a single call.
If componentCode is omitted, a placeholder scene is generated.

COMPOSABLE PRIMITIVES (import from '../src/primitives'):
  AnimatedText — text with entrance/exit animations, typography props
  AnimatedImage — image with animations, borderRadius, shadow, overlay
  AnimatedShape — rect/circle/line with fill, gradient, blur, glow
  Background — solid color, gradient (array or CSS string), blurred image bg
  LayoutStack — vertical/horizontal flex (align, justify, gap)
  LayoutSplit — two-panel split with ratio ("60/40")
  Stagger — auto-delays children's entrance animations
  BeatSync + useBeat — beat-reactive animations from analyze_beats data
  useAnimation — hook for custom animation control

REMOTION RULES (critical for correct rendering):
  - ALL animations MUST use useCurrentFrame() + interpolate()/spring() from 'remotion'
  - CSS transitions, CSS animations, and Tailwind animation classes are FORBIDDEN — they break renders
  - Audio: import { Audio } from '@remotion/media' (NOT from 'remotion')
  - Images: use <Img> from 'remotion' or <AnimatedImage> primitive (not <img>)
  - Spring configs: { damping: 200 } smooth | { damping: 20, stiffness: 200 } snappy | { damping: 8 } bouncy
  - Transitions: import { fade, slide, wipe } from '@remotion/transitions/<name>'
  - Always clamp interpolations: { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }

COMPONENT STRUCTURE:
  import React from 'react';
  import { useCurrentFrame, useVideoConfig, staticFile } from 'remotion';
  import { AnimatedText, Background, LayoutStack } from '../src/primitives';
  export const SceneName: React.FC = () => { ... };

For narration-driven videos, set durationFrames from audio segment timing:
  durationFrames = Math.ceil((segmentEndTime - segmentStartTime) * fps)`,
      inputSchema: z.object({
        projectPath: z.string(),
        scenes: z.array(sceneEntrySchema).min(1).describe('One or more scenes to create'),
      }),
    },
    async (args) => {
      try {
        await validateProjectPath(args.projectPath);
        const composition = await readComposition(args.projectPath);

        // Validate all IDs upfront — check for duplicates and collisions
        const existingIds = new Set(composition.scenes.map(s => s.id));
        const existingNames = new Set(composition.scenes.map(s => sceneIdToComponentName(s.id)));
        const newIds = new Set<string>();

        for (const scene of args.scenes) {
          if (existingIds.has(scene.sceneId) || newIds.has(scene.sceneId)) {
            throw new Error(`Scene '${scene.sceneId}' already exists or is duplicated in this batch.`);
          }
          const componentName = sceneIdToComponentName(scene.sceneId);
          if (existingNames.has(componentName)) {
            throw new Error(`Scene ID '${scene.sceneId}' produces component name '${componentName}' which collides with an existing scene.`);
          }
          newIds.add(scene.sceneId);
          existingNames.add(componentName);
        }

        const createdFiles: string[] = [];

        for (const sceneInput of args.scenes) {
          // Sanitize filename — keep display name as-is in composition.json
          const safeFilename = toSafeFilename(sceneInput.sceneName);

          const newScene: Scene = {
            id: sceneInput.sceneId,
            name: sceneInput.sceneName,
            type: 'custom',
            file: `scenes/${sceneInput.sceneId}-${safeFilename}.tsx`,
            durationFrames: sceneInput.durationFrames,
            startFrame: 0,
            audioSegmentIds: sceneInput.audioSegmentIds,
            transition: sceneInput.transition as Scene['transition'],
            props: sceneInput.props,
          };

          composition.scenes.push(newScene);
          createdFiles.push(newScene.file);
        }

        // Recalculate ALL startFrames once
        composition.scenes = recalculateStartFrames(composition.scenes);

        // Write composition to disk
        await writeComposition(args.projectPath, composition);

        // Generate .tsx files for each new scene
        for (let i = 0; i < args.scenes.length; i++) {
          const sceneInput = args.scenes[i];
          const scene = composition.scenes.find(s => s.id === sceneInput.sceneId)!;

          await writeSceneFile(args.projectPath, scene, sceneInput.componentCode);
        }

        // Regenerate Root.tsx once
        await regenerateRootTsx(args.projectPath, composition);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'success',
              created: args.scenes.map(s => s.sceneId),
              files: createdFiles,
              totalScenes: composition.scenes.length,
              scenes: composition.scenes.map(s => ({
                id: s.id,
                name: s.name,
                startFrame: s.startFrame,
                durationFrames: s.durationFrames,
              })),
              next_steps: 'Check the preview if running, or call start_preview to see the scenes.',
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
              suggestion: 'Ensure projectPath is valid and all sceneIds are unique.',
            }),
          }],
        };
      }
    }
  );
}
