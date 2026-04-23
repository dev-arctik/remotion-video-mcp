import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Catalog of every composable primitive shipped in src/primitives/.
// This is the OPEN PATH — Claude composes these in componentCode.
// Templates are just examples; primitives are the building blocks.
const PRIMITIVES_CATALOG = [
  // ─── TEXT PRIMITIVES ────────────────────────────────────────────────
  {
    category: 'text',
    name: 'AnimatedText',
    description: 'Single text block with entrance + exit animations and full typography control.',
    keyProps: ['children', 'fontSize', 'fontWeight', 'color', 'animation { entrance, exit, delay }', 'totalFrames'],
    importFrom: '../src/primitives',
    example: `<AnimatedText fontSize={120} fontWeight={700} animation={{ entrance: 'fade-up', exit: 'fade-out' }} totalFrames={90}>Hello</AnimatedText>`,
  },
  {
    category: 'text',
    name: 'AnimatedTextChars',
    description: 'PER-CHARACTER reveal — each letter animates in with stagger. For kinetic typography.',
    keyProps: ['children (string)', 'entrance: fade|fade-up|scale|rotate-in|blur-in', 'staggerFrames', 'staggerPattern: linear|center-out|edges-in|random', 'springPreset'],
    importFrom: '../src/primitives',
    example: `<AnimatedTextChars fontSize={140} entrance="fade-up" staggerPattern="center-out" staggerFrames={3}>EXPLOSION</AnimatedTextChars>`,
  },
  {
    category: 'text',
    name: 'AnimatedTextWords',
    description: 'PER-WORD reveal — for narration sync (pass wordDelays from analyze_audio).',
    keyProps: ['children (string)', 'entrance', 'staggerFrames (default 6)', 'wordDelays?: number[]', 'springPreset'],
    importFrom: '../src/primitives',
    example: `<AnimatedTextWords entrance="slide-up" wordDelays={[0, 12, 28, 44]}>The future is now today</AnimatedTextWords>`,
  },
  {
    category: 'text',
    name: 'Captions',
    description: 'TikTok / Fireship style word-level highlighted captions. Pass parsed @remotion/captions data.',
    keyProps: ['captions: Caption[]', 'position: top|middle|bottom', 'highlightColor', 'highlightBackground (optional pill)', 'groupWindowMs'],
    importFrom: '../src/primitives',
    example: `<Captions captions={captionData} position="bottom" highlightColor={theme.color.primary} highlightBackground="#000" />`,
  },

  // ─── IMAGE / MEDIA ─────────────────────────────────────────────────
  {
    category: 'media',
    name: 'AnimatedImage',
    description: 'Image with entrance/exit animations, border radius, shadow, optional Ken Burns.',
    keyProps: ['src', 'fit: cover|contain|fill', 'animation', 'borderRadius', 'shadow'],
    importFrom: '../src/primitives',
    example: `<AnimatedImage src={staticFile('images/hero.jpg')} fit="cover" borderRadius={32} animation={{ entrance: 'zoom-in' }} />`,
  },
  {
    category: 'media',
    name: 'KenBurns',
    description: 'Slow pan + zoom on a still image. Cinematic motion from photos.',
    keyProps: ['src', 'durationInFrames', 'startScale', 'endScale', 'panDirection: left|right|up|down|none', 'panDistance', 'easing'],
    importFrom: '../src/primitives',
    example: `<KenBurns src="images/portrait.jpg" durationInFrames={150} startScale={1} endScale={1.2} panDirection="right" />`,
  },
  {
    category: 'media',
    name: 'LottiePlayer',
    description: 'Lottie animation player. Drop in JSON files from LottieFiles for icon animations.',
    keyProps: ['src (path or JSON object)', 'loop', 'playbackRate'],
    importFrom: '../src/primitives',
    example: `<LottiePlayer src="lottie/check.json" loop={false} />`,
  },

  // ─── BACKGROUND / DECORATIVE ───────────────────────────────────────
  {
    category: 'background',
    name: 'Background',
    description: 'Solid, gradient, or blurred image background. Wraps content as AbsoluteFill.',
    keyProps: ['color', 'gradient', 'image', 'blur'],
    importFrom: '../src/primitives',
    example: `<Background color={theme.color.background}>...</Background>`,
  },
  {
    category: 'background',
    name: 'Gradient',
    description: 'Animated gradient (linear/radial/conic) — pulls colors from theme by default.',
    keyProps: ['colors?: string[]', 'type: linear|radial|conic', 'angle', 'animate', 'animationCycleFrames'],
    importFrom: '../src/primitives',
    example: `<Gradient type="linear" angle={135} animate animationCycleFrames={300} />`,
  },
  {
    category: 'background',
    name: 'FilmGrain',
    description: 'Animated film grain overlay using @remotion/noise — fights AI-perfect sheen.',
    keyProps: ['intensity (0..1)', 'animated', 'monochrome', 'blendMode'],
    importFrom: '../src/primitives',
    example: `<FilmGrain intensity={0.08} animated monochrome />`,
  },
  {
    category: 'background',
    name: 'AnimatedShape',
    description: 'SVG rect/circle/line with fill, gradient, blur, glow.',
    keyProps: ['type: rect|circle|line', 'width', 'height', 'fill', 'gradient'],
    importFrom: '../src/primitives',
    example: `<AnimatedShape type="circle" width={200} height={200} fill={theme.color.primary} />`,
  },

  // ─── EFFECTS (wrap any child) ──────────────────────────────────────
  {
    category: 'effect',
    name: 'Glow',
    description: 'Wraps a child with soft outer glow (drop-shadow). Color from theme.primary by default.',
    keyProps: ['children', 'color', 'intensity (blur radius)', 'layers (stack count)', 'animate'],
    importFrom: '../src/primitives',
    example: `<Glow color={theme.color.primary} intensity={32} layers={3}><AnimatedText>Hi</AnimatedText></Glow>`,
  },
  {
    category: 'effect',
    name: 'MotionBlur',
    description: 'Wraps a moving child in @remotion/motion-blur Trail/CameraMotionBlur. AE-grade blur.',
    keyProps: ['children', 'layers (default 8)', 'lagInFrames', 'mode: trail|camera'],
    importFrom: '../src/primitives',
    example: `<MotionBlur layers={12} lagInFrames={1}><MovingElement /></MotionBlur>`,
  },
  {
    category: 'effect',
    name: 'MorphPath',
    description: 'SVG path morph between two `d` strings via @remotion/paths. Logo reveals, icon transitions.',
    keyProps: ['fromPath', 'toPath', 'startFrame', 'durationFrames', 'springPreset', 'fill'],
    importFrom: '../src/primitives',
    example: `<MorphPath fromPath="M10,10 L90,10" toPath="M10,10 Q50,90 90,10" startFrame={0} durationFrames={45} />`,
  },

  // ─── LAYOUT ────────────────────────────────────────────────────────
  {
    category: 'layout',
    name: 'LayoutStack',
    description: 'Vertical or horizontal flex stack with align/justify/gap.',
    keyProps: ['direction: vertical|horizontal', 'align', 'justify', 'gap'],
    importFrom: '../src/primitives',
    example: `<LayoutStack direction="vertical" align="center" gap={32}>...</LayoutStack>`,
  },
  {
    category: 'layout',
    name: 'LayoutSplit',
    description: 'Two-panel split with configurable ratio (e.g., 60/40 left/right).',
    keyProps: ['direction: horizontal|vertical', 'ratio (0..1)', 'gap'],
    importFrom: '../src/primitives',
    example: `<LayoutSplit direction="horizontal" ratio={0.4}>{leftPanel}{rightPanel}</LayoutSplit>`,
  },
  {
    category: 'layout',
    name: 'SafeArea',
    description: 'Content container that RESERVES chrome zones (top header band, bottom footer band, side margins). Prevents content from colliding with persistent SectionHeader / Footer / crosshairs — the #1 cause of layout-overflow bugs in 1080p video. Default safe zone: 1728×750 centered. Pass `debug` to render translucent guides while iterating in Studio.',
    keyProps: ['chrome?: { topReserved (180), bottomReserved (150), sideMargin (96) }', 'debug?: boolean (overlay guides)', 'overflow: hidden|visible (default hidden — clipped overflow makes violations obvious)', 'align: start|center|end|stretch', 'justify: start|center|end|space-between|space-around', 'direction: row|column'],
    importFrom: '../src/primitives',
    example: `<AbsoluteFill>\n  <SectionHeader />          {/* in top chrome band */}\n  <SafeArea align="center" justify="center" debug={false}>\n    <YourContent />          {/* clipped to safe zone */}\n  </SafeArea>\n  <Footer />                 {/* in bottom chrome band */}\n</AbsoluteFill>`,
  },

  // ─── ANIMATION + AUDIO ─────────────────────────────────────────────
  {
    category: 'animation',
    name: 'Stagger',
    description: 'Auto-delays child entrances by staggerFrames apart. Wraps any list of primitives.',
    keyProps: ['staggerFrames', 'delay', 'children'],
    importFrom: '../src/primitives',
    example: `<Stagger staggerFrames={6}><AnimatedText>One</AnimatedText><AnimatedText>Two</AnimatedText></Stagger>`,
  },
  {
    category: 'animation',
    name: 'AudioReactive',
    description: 'Provides real-time frequency data from playing audio to children via context.',
    keyProps: ['src', 'children'],
    importFrom: '../src/primitives',
    example: `<AudioReactive src="audio/song.mp3"><BassReactiveCircle /></AudioReactive>`,
  },
  {
    category: 'animation',
    name: 'BeatSync (deprecated)',
    description: 'Snap children animations to detected beats. Prefer AudioReactive.',
    keyProps: ['beatDataPath', 'children'],
    importFrom: '../src/primitives',
    example: `<BeatSync beatDataPath="audio/song-beats.json">...</BeatSync>`,
  },

  // ─── HOOKS (not components) ────────────────────────────────────────
  {
    category: 'hook',
    name: 'useTheme()',
    description: 'Returns the resolved Theme — color roles, type scale, springs, easings, etc. Use in any primitive.',
    importFrom: '../src/primitives/tokens',
    example: `const { color, type, springs } = useTheme(); const c = color.primary;`,
  },
  {
    category: 'hook',
    name: 'useTypeStyle(name)',
    description: 'Returns React.CSSProperties for a named M3 type style (displayLarge, headlineMedium, etc.).',
    importFrom: '../src/primitives/tokens',
    example: `const style = useTypeStyle('displayLarge'); <h1 style={style}>Big</h1>`,
  },
  {
    category: 'hook',
    name: 'useAnimation(config, totalFrames?)',
    description: 'Low-level animation engine — returns { opacity, transform, filter } for arbitrary entrance/exit configs.',
    importFrom: '../src/primitives',
    example: `const { opacity, transform } = useAnimation({ entrance: 'zoom-in', exit: 'fade-out' }, 90);`,
  },
  {
    category: 'hook',
    name: 'useAudioReactive()',
    description: 'Inside an AudioReactive provider, returns current frequency bands { bass, mid, treble, level }.',
    importFrom: '../src/primitives',
    example: `const { bass } = useAudioReactive(); <Circle scale={1 + bass} />`,
  },
];

export function registerListPrimitives(server: McpServer): void {
  server.registerTool(
    'list_primitives',
    {
      title: 'List Composable Primitives',
      description: `Returns the catalog of every composable primitive shipped with the MCP. These are the
building blocks you compose in componentCode (and add_overlay's componentCode). Templates
are just curated combinations of these — for anything custom, compose primitives directly.
Pair with list_tokens for the design system. No projectPath required.`,
      inputSchema: {},
    },
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            primitiveCount: PRIMITIVES_CATALOG.length,
            primitives: PRIMITIVES_CATALOG,
            philosophy: {
              openPath: 'Compose primitives in componentCode for unlimited flexibility. Templates are examples, not constraints.',
              tokenAware: 'Every primitive reads from useTheme() — set_theme once and the whole video updates.',
              importPattern: `import { AnimatedText, Background, Gradient, useTheme } from '../src/primitives';`,
            },
            next_steps: 'Use create_scene with componentCode that imports from "../src/primitives" and composes these.',
          }, null, 2),
        }],
      };
    }
  );
}
