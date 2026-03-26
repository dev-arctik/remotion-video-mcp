import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Phase 1 — Foundation
import { registerStartSession } from './tools/start-session.js';
import { registerInitProject } from './tools/init-project.js';
import { registerListScenes } from './tools/list-scenes.js';

// Phase 2 — Scene Management
import { registerCreateScene } from './tools/create-scene.js';
import { registerUpdateScene } from './tools/update-scene.js';
import { registerDeleteScene } from './tools/delete-scene.js';
import { registerReorderScenes } from './tools/reorder-scenes.js';
import { registerUpdateComposition } from './tools/update-composition.js';

// Phase 3 — Assets & Audio Analysis
import { registerScanAssets } from './tools/scan-assets.js';
import { registerImportAsset } from './tools/import-asset.js';
import { registerAnalyzeAudio } from './tools/analyze-audio.js';
import { registerAnalyzeBeats } from './tools/analyze-beats.js';

// Phase 4 — Preview & Render
import { registerStartPreview } from './tools/start-preview.js';
import { registerStopPreview } from './tools/stop-preview.js';
import { registerCaptureFrame } from './tools/capture-frame.js';
import { registerRenderVideo } from './tools/render-video.js';

// Phase 5 — Custom File Ops & Overlays
import { registerWriteFile } from './tools/write-file.js';
import { registerReadFile } from './tools/read-file.js';
import { registerAddOverlay } from './tools/add-overlay.js';
import { registerRemoveOverlay } from './tools/remove-overlay.js';

// Phase 6 — Recovery & Discovery
import { registerRegenerateRoot } from './tools/regenerate-root.js';

export function setupServer(server: McpServer): void {
  // Phase 1
  registerStartSession(server);
  registerInitProject(server);
  registerListScenes(server);

  // Phase 2
  registerCreateScene(server);
  registerUpdateScene(server);
  registerDeleteScene(server);
  registerReorderScenes(server);
  registerUpdateComposition(server);

  // Phase 3
  registerScanAssets(server);
  registerImportAsset(server);
  registerAnalyzeAudio(server);  // primary — frequency-based event detection
  registerAnalyzeBeats(server);  // backward compat — still works, same BPM output

  // Phase 4
  registerStartPreview(server);
  registerStopPreview(server);
  registerCaptureFrame(server);
  registerRenderVideo(server);

  // Phase 5
  registerWriteFile(server);
  registerReadFile(server);
  registerAddOverlay(server);
  registerRemoveOverlay(server);

  // Phase 6 — Recovery
  registerRegenerateRoot(server);
}
