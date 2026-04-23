import fs from 'fs-extra';
import path from 'path';

// Theme overrides — partial customization layered on top of defaultTheme.
// Stored sparsely in composition.json; resolved to full Theme at render time
// by buildTheme() in src/primitives/tokens/theme.ts.
export interface ThemeOverridesJson {
  // Pick one of: 'editorial-dark', 'editorial-light', 'cinematic-noir',
  // 'electric-blue', 'forest-warm', or omit to use 'editorial-dark'.
  palette?: string;
  // Override individual color roles (e.g. { primary: '#FF0000' })
  colorOverrides?: Record<string, string>;
  // Override individual type styles (e.g. { displayLarge: { fontSize: 200 } })
  typeOverrides?: Record<string, Partial<{ fontSize: number; lineHeight: number; letterSpacing: number; fontWeight: number; fontFamily: string }>>;
  // Font family — string CSS stack OR named stack ('modern', 'display', 'editorial', 'mono', 'poster')
  fontFamily?: string;
  headingFontFamily?: string;
}

// Composition shape — mirrors composition.json exactly
export interface Composition {
  version: string;
  metadata: {
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
  };
  settings: {
    width: number;
    height: number;
    fps: number;
    totalDurationFrames: number | null;
    backgroundColor: string;
  };
  // Legacy style block — kept for back-compat with existing projects.
  // Prefer the `theme` field below for new work.
  style: {
    theme: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    headingFontFamily: string;
    defaultTextColor: string;
    defaultFontSize: number;
  };
  // NEW: full design token theme — managed via set_theme MCP tool.
  // When present, this is the source of truth (overrides `style`).
  theme?: ThemeOverridesJson;
  audio: {
    type: 'narration' | 'background' | 'none';
    narration?: { src: string; volume?: number };
    backgroundMusic?: { src: string; volume?: number; loop?: boolean };
  };
  scenes: Scene[];
  overlays?: Overlay[];
  // NEW: word-level captions imported via import_captions tool.
  // Each captions track is a separate file in assets/captions/.
  captions?: Caption[];
}

// Caption track — references a JSON file in assets/captions/ holding parsed
// @remotion/captions Caption[]. Use TikTok-style overlay by referencing the id.
export interface Caption {
  id: string;
  name: string;
  file: string;          // project-relative path, e.g. "assets/captions/voiceover.json"
  language?: string;     // BCP 47 tag, e.g. "en-US"
  // Display config — applied if Captions primitive references this id without props
  defaultStyle?: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    position?: 'top' | 'middle' | 'bottom';
  };
}

// Overlay — a component that renders on top of scenes (e.g., logo, watermark, animation)
export interface Overlay {
  id: string;
  name: string;
  componentName: string; // must match the named export in the .tsx file
  file: string;          // project-relative path, e.g. "src/overlays/BouncingBall.tsx"
  zIndex: number;        // render order — higher renders on top; default 10
  startFrame?: number;   // first frame the overlay appears — omit for full-video-duration
  endFrame?: number;     // last frame the overlay appears — omit for full-video-duration
}

// Scene transition — declarative spec used to wrap scenes in <TransitionSeries>.
// `presentation` maps to a @remotion/transitions presentation (fade/slide/wipe/iris/clockWipe/flip/none).
// `timing` chooses spring vs linear timing.
// `direction` is consumed by slide/wipe/clockWipe.
export interface SceneTransition {
  presentation: 'fade' | 'slide' | 'wipe' | 'flip' | 'iris' | 'clock-wipe' | 'none';
  timing?: 'linear' | 'spring';
  durationFrames?: number;       // total transition duration
  direction?: 'from-left' | 'from-right' | 'from-top' | 'from-bottom';
  springConfig?: { damping?: number; stiffness?: number; mass?: number };
}

export interface Scene {
  id: string;
  name: string;
  type: string;
  file: string;
  durationFrames: number;
  startFrame: number;
  audioSegmentIds?: string[];
  // OUT-transition between this scene and the NEXT one.
  // The first scene has no incoming transition; the last scene's transitionOut is ignored.
  transitionOut?: SceneTransition;
  // Legacy nested transition shape — preserved for back-compat
  transition?: {
    in: { type: string; durationFrames?: number };
    out: { type: string; durationFrames?: number };
  };
  props?: Record<string, unknown>;
  objects?: unknown[];
}

const COMPOSITION_FILE = 'composition.json';

export async function readComposition(projectPath: string): Promise<Composition> {
  const filePath = path.join(projectPath, COMPOSITION_FILE);
  const data = await fs.readJson(filePath);
  return data as Composition;
}

export async function writeComposition(
  projectPath: string,
  data: Composition
): Promise<void> {
  const filePath = path.join(projectPath, COMPOSITION_FILE);
  // Update the timestamp on every write
  data.metadata.updatedAt = new Date().toISOString();
  await fs.writeJson(filePath, data, { spaces: 2 });
}

// Recalculate startFrame for every scene as cumulative sum of preceding durations.
// Called after any mutation to the scenes array (create, delete, reorder).
export function recalculateStartFrames(scenes: Scene[]): Scene[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const updated = { ...scene, startFrame: cursor };
    cursor += scene.durationFrames;
    return updated;
  });
}
