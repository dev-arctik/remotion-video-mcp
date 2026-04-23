import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Static catalog of motion presets — entrance, exit, scene transitions
const MOTION_CATALOG = {
  entrance: {
    description: 'Pass to primitive `animation.entrance` or AnimatedTextChars/Words `entrance` prop',
    types: [
      { name: 'fade-up', use: 'Default. Fade in while sliding up — works for almost any element.' },
      { name: 'fade-down', use: 'Fade in while sliding down — for top-anchored content.' },
      { name: 'fly-from-left', use: 'Spring in from left edge — emphasis, list items.' },
      { name: 'fly-from-right', use: 'Spring in from right edge.' },
      { name: 'fly-from-top', use: 'Drop in from above (no bounce).' },
      { name: 'fly-from-bottom', use: 'Push in from below.' },
      { name: 'zoom-in', use: 'Scale up from 30% — hero text, logos.' },
      { name: 'zoom-out', use: 'Scale down from 150% — reveal effect.' },
      { name: 'drop-in', use: 'Drop from above with bounce — playful.' },
      { name: 'spin-in', use: 'Rotate + scale — playful, brand reveals.' },
      { name: 'blur-in', use: 'De-blur from 20px → 0 — cinematic, dreamy.' },
      { name: 'none', use: 'No entrance — element appears instantly.' },
    ],
  },

  exit: {
    description: 'Pass to primitive `animation.exit`. Requires `totalFrames` so the engine knows when the element disappears.',
    types: [
      { name: 'fade-out', use: 'Simple opacity fade.' },
      { name: 'fade-down', use: 'Fade while sliding down.' },
      { name: 'fly-out-left', use: 'Slide out to the left.' },
      { name: 'fly-out-right', use: 'Slide out to the right.' },
      { name: 'fly-out-top', use: 'Slide out upward.' },
      { name: 'fly-out-bottom', use: 'Slide out downward.' },
      { name: 'zoom-out', use: 'Scale down while fading.' },
      { name: 'blur-out', use: 'Apply blur on exit — dreamy, cinematic.' },
      { name: 'none', use: 'No exit — element stays through the cut.' },
    ],
  },

  sceneTransitions: {
    description: 'Pass to add_transition tool. Wraps consecutive scenes in @remotion/transitions TransitionSeries.',
    presentations: [
      { name: 'fade', use: 'Cross-fade — universal, safe choice.' },
      { name: 'slide', use: 'Slide one scene over another. Combine with `direction: from-left|from-right|from-top|from-bottom`.' },
      { name: 'wipe', use: 'Wipe one scene across another. Same `direction` as slide.' },
      { name: 'flip', use: '3D flip — playful, brand-heavy.' },
      { name: 'iris', use: 'Circular iris reveal — cinematic.' },
      { name: 'clock-wipe', use: 'Clock-hand sweep — dramatic, timed reveal.' },
      { name: 'none', use: 'Hard cut (default behavior).' },
    ],
    timings: [
      { name: 'spring', use: 'Springy organic timing — modern, default for most.' },
      { name: 'linear', use: 'Constant velocity — clean, predictable.' },
    ],
  },

  staggerPatterns: {
    description: 'Pass to AnimatedTextChars `staggerPattern` prop — the order chars animate in.',
    patterns: [
      { name: 'linear', use: 'Left-to-right (default). Predictable.' },
      { name: 'center-out', use: 'From middle outward. Eye-catching, dramatic.' },
      { name: 'edges-in', use: 'From edges inward. Reveals to center.' },
      { name: 'random', use: 'Deterministic-random scrambled order.' },
    ],
  },

  springPresets: {
    description: 'Pass to primitives via `springPreset` prop. See list_tokens for raw config values.',
    presets: ['smooth', 'snappy', 'bouncy', 'punchy', 'gentle', 'playful', 'rigid'],
  },
};

export function registerListMotionPresets(server: McpServer): void {
  server.registerTool(
    'list_motion_presets',
    {
      title: 'List Motion Presets',
      description: `Returns all motion preset names — entrance/exit animations, scene transitions, stagger
patterns, spring presets. Use these names in primitive props or in add_transition / create_scene
componentCode. No projectPath required.`,
      inputSchema: {},
    },
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            motion: MOTION_CATALOG,
            usage: {
              elementAnimation: '<AnimatedText animation={{ entrance: "fade-up", exit: "blur-out", delay: 5 }} totalFrames={90}>Hi</AnimatedText>',
              sceneTransition: 'add_transition({ projectPath, sceneId: "scene-001", transitionOut: { presentation: "slide", direction: "from-right", timing: "spring", durationFrames: 20 } })',
              charStagger: '<AnimatedTextChars entrance="rotate-in" staggerPattern="center-out" staggerFrames={3} springPreset="bouncy">EXPLOSION</AnimatedTextChars>',
            },
          }, null, 2),
        }],
      };
    }
  );
}
