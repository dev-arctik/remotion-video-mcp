import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Composition, Scene } from '../state/project-state.js';

// ESM doesn't have __dirname — derive from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate that projectPath is a legitimate Remotion project directory.
// Call this at the top of every tool handler except start_session and init_project.
export async function validateProjectPath(projectPath: string): Promise<void> {
  const resolved = path.resolve(projectPath);

  if (projectPath.includes('..')) {
    throw new Error(`Project path must not contain '..': ${projectPath}`);
  }

  // Reject obviously dangerous system paths
  const dangerous = ['/', '/usr', '/etc', '/var', '/tmp', '/bin', '/sbin'];
  if (dangerous.includes(resolved) || resolved === process.env.HOME) {
    throw new Error(`Refusing to operate on system directory: ${resolved}`);
  }

  // Verify composition.json exists (confirms this is an initialized project)
  const compositionPath = path.join(resolved, 'composition.json');
  if (!await fs.pathExists(compositionPath)) {
    throw new Error(
      `No composition.json found at ${resolved}. Did you run init_project first?`
    );
  }
}

// Create all directories needed for a new project
export async function ensureProjectDirs(projectPath: string): Promise<void> {
  const dirs = [
    'assets/images',
    'assets/audio',
    'assets/fonts',
    'scenes',
    'src/primitives',
    'src/utils',
    'public',      // Remotion's staticFile() serves from public/
    'output',
  ];
  for (const dir of dirs) {
    await fs.ensureDir(path.join(projectPath, dir));
  }

  // .gitkeep files so empty dirs are committed
  const keepDirs = ['assets/images', 'assets/audio', 'assets/fonts', 'output'];
  for (const dir of keepDirs) {
    await fs.writeFile(path.join(projectPath, dir, '.gitkeep'), '');
  }

  // Symlink public/ subdirs to assets/ so staticFile() can find them
  const assetDirs = ['images', 'audio', 'fonts'];
  for (const dir of assetDirs) {
    const target = path.join(projectPath, 'assets', dir);
    const link = path.join(projectPath, 'public', dir);
    if (!await fs.pathExists(link)) {
      try {
        await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        // Fallback: copy instead of symlink
        await fs.copy(target, link);
      }
    }
  }
}

// Copy composable primitives from the MCP server's src/primitives/ into the user project.
// These are the building blocks Claude uses in componentCode (AnimatedText, Background, etc.)
export async function copyPrimitives(
  projectPath: string,
  serverRoot: string
): Promise<void> {
  const primitivesDir = path.join(serverRoot, 'src', 'primitives');
  await fs.copy(primitivesDir, path.join(projectPath, 'src', 'primitives'));

  // Copy Remotion skill reference docs — Claude can read these for detailed patterns
  const skillsDir = path.join(serverRoot, 'src', 'skills');
  if (await fs.pathExists(skillsDir)) {
    await fs.copy(skillsDir, path.join(projectPath, 'docs', 'remotion-skills'));
  }
}

// The server's own root directory — used to locate src/primitives/ at runtime.
// After compile: __dirname = dist/utils/, so go up two levels to project root.
export function getServerRoot(): string {
  return path.join(__dirname, '..', '..');
}

// Generate a placeholder scene — only used when componentCode is not provided.
// Claude should always provide componentCode using the primitives library.
export function generatePlaceholderScene(scene: Scene): string {
  const componentName = sceneIdToComponentName(scene.id);
  const bg = (scene.props as Record<string, unknown>)?.backgroundColor ?? '#000000';

  return `import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText, Background } from '../src/primitives';

// Placeholder — replace with componentCode via update_scene
export const ${componentName}: React.FC = () => {
  return (
    <Background color="${bg}">
      <AnimatedText fontSize={48} animation={{ entrance: 'fade-up' }}>
        ${scene.name}
      </AnimatedText>
    </Background>
  );
};
`;
}

// Write a scene's .tsx file — uses componentCode if available, otherwise placeholder
export async function writeSceneFile(
  projectPath: string,
  scene: Scene,
  componentCode?: string
): Promise<void> {
  const filePath = path.join(projectPath, scene.file);
  await fs.ensureDir(path.dirname(filePath));
  const content = componentCode ?? generatePlaceholderScene(scene);
  await fs.writeFile(filePath, content);
}

// Regenerate Root.tsx from the current scenes array.
// Called after any scene mutation so the composition always reflects reality.
//
// Audio paths stored in composition.json must be relative to public/, NOT assets/.
// e.g. "audio/voiceover.mp3" → staticFile('audio/voiceover.mp3') → public/audio/voiceover.mp3
export async function regenerateRootTsx(
  projectPath: string,
  composition: Composition
): Promise<void> {
  const { settings, scenes, audio } = composition;
  const overlays = (composition.overlays ?? []).sort((a, b) => a.zIndex - b.zIndex);

  // Guard against zero-duration — Remotion rejects durationInFrames: 0
  const totalFrames =
    settings.totalDurationFrames ??
    (scenes.reduce((sum, s) => sum + s.durationFrames, 0) || 1);

  const sceneImports = scenes
    .map((s) => {
      const name = sceneIdToComponentName(s.id);
      return `import { ${name} } from '../scenes/${path.basename(s.file, '.tsx')}';`;
    })
    .join('\n');

  const seriesEntries = scenes
    .map((s) => {
      const name = sceneIdToComponentName(s.id);
      return `      <Series.Sequence durationInFrames={${s.durationFrames}}>\n        <${name} />\n      </Series.Sequence>`;
    })
    .join('\n');

  // Audio JSX — Audio and staticFile are both exported from 'remotion'
  const hasNarration = audio.type === 'narration' && audio.narration?.src;
  const hasBgMusic = !!audio.backgroundMusic?.src;
  const hasAudio = hasNarration || hasBgMusic;

  let audioJsx = '';
  if (hasNarration) {
    const narrationSrc = audio.narration!.src;
    const volume = audio.narration!.volume;
    const volumeProp = volume != null ? `\n          volume={${volume}}` : '';
    audioJsx += `\n        {/* Narration audio — synced to scene timeline */}\n        <Audio\n          src={staticFile('${narrationSrc}')}${volumeProp}\n        />`;
  }
  if (hasBgMusic) {
    const bgSrc = audio.backgroundMusic!.src;
    const volume = audio.backgroundMusic!.volume ?? 0.15;
    const loop = audio.backgroundMusic!.loop ?? true;
    audioJsx += `\n        {/* Background music */}\n        <Audio\n          src={staticFile('${bgSrc}')}\n          volume={${volume}}\n          loop={${loop}}\n        />`;
  }

  // Overlay imports — each overlay is a named export from a project-relative file
  const overlayImports = overlays
    .map((o) => `import { ${o.componentName} } from '../${o.file.replace(/\.tsx$/, '')}';`)
    .join('\n');

  // Overlay render blocks — full-duration or partial-duration (wrapped in <Sequence>)
  const overlayRenderBlocks = overlays
    .map((o) => {
      const inner =
        `      <AbsoluteFill style={{ zIndex: ${o.zIndex}, pointerEvents: 'none' as const }}>\n` +
        `        <${o.componentName} />\n` +
        `      </AbsoluteFill>`;
      // Partial-duration overlays wrapped in <Sequence>
      if (o.startFrame != null || o.endFrame != null) {
        const from = o.startFrame ?? 0;
        const durationProp = o.endFrame != null ? ` durationInFrames={${o.endFrame - from}}` : '';
        return `      {/* Overlay: ${o.name} (frames ${from}–${o.endFrame ?? 'end'}) */}\n` +
          `      <Sequence from={${from}}${durationProp}>\n${inner}\n      </Sequence>`;
      }
      return `      {/* Overlay: ${o.name} — full duration */}\n${inner}`;
    })
    .join('\n');

  // Build imports — Audio comes from @remotion/media, everything else from remotion
  const hasPartialOverlays = overlays.some((o) => o.startFrame != null || o.endFrame != null);
  const remotionImportParts = ['Composition', 'Series'];
  if (hasAudio) remotionImportParts.push('staticFile');
  if (overlays.length > 0) remotionImportParts.push('AbsoluteFill');
  if (hasPartialOverlays) remotionImportParts.push('Sequence');
  const remotionImports = remotionImportParts.join(', ');

  // Audio import from @remotion/media (not remotion)
  const audioImport = hasAudio ? `\nimport { Audio } from '@remotion/media';` : '';

  const rootContent = `import React from 'react';
import { ${remotionImports} } from 'remotion';${audioImport}
${sceneImports}
${overlayImports}

// Auto-generated from composition.json — do not edit directly
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="main"
        component={MainComposition}
        durationInFrames={${totalFrames}}
        fps={${settings.fps}}
        width={${settings.width}}
        height={${settings.height}}
      />
    </>
  );
};

const MainComposition: React.FC = () => {
  return (
    <>
      <Series>
${seriesEntries}
      </Series>${audioJsx}
${overlayRenderBlocks}
    </>
  );
};
`;

  await fs.writeFile(path.join(projectPath, 'src', 'Root.tsx'), rootContent);
}

// Sanitize a scene name to a safe filename segment (kebab-case, no spaces/special chars)
export function toSafeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// "scene-001" → "Scene001", "001-intro" → "Scene001Intro"
export function sceneIdToComponentName(sceneId: string): string {
  let result = sceneId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  // JSX component names must start with uppercase letter, not digit
  if (/^\d/.test(result)) result = 'Scene' + result;
  return result;
}

