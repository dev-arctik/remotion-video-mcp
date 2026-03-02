import fs from 'fs-extra';
import path from 'path';

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
  audio: {
    type: 'narration' | 'background' | 'none';
    narration?: Record<string, unknown>;
    backgroundMusic?: Record<string, unknown>;
  };
  scenes: Scene[];
  overlays?: Overlay[];
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

export interface Scene {
  id: string;
  name: string;
  type: string;
  file: string;
  durationFrames: number;
  startFrame: number;
  audioSegmentIds?: string[];
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
