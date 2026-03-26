import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Static catalog of all built-in scene templates
const TEMPLATE_CATALOG = [
  {
    sceneType: 'title-card',
    description: 'Full-screen title with optional subtitle and logo. Ideal for intros, section headers, and end cards.',
    layout: `
┌────────────────────────┐
│                        │
│       [logo]           │
│    TITLE TEXT           │
│    subtitle text        │
│                        │
└────────────────────────┘`,
    defaultAnimation: 'fade-up with spring physics',
    entrancePresets: ['fade-up', 'fly-from-left', 'fly-from-right', 'fly-from-bottom', 'zoom-in', 'drop-in'],
    props: [
      { name: 'title', type: 'string', required: true, description: 'Main title text' },
      { name: 'subtitle', type: 'string', required: false, description: 'Smaller text below title' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000', description: 'Background color (hex)' },
      { name: 'titleColor', type: 'string', required: false, default: '#FFFFFF', description: 'Title text color' },
      { name: 'subtitleColor', type: 'string', required: false, description: 'Subtitle color (defaults to 70% title color)' },
      { name: 'titleFontSize', type: 'number', required: false, default: '72', description: 'Title font size in px' },
      { name: 'subtitleFontSize', type: 'number', required: false, default: '32', description: 'Subtitle font size in px' },
      { name: 'alignment', type: "'center' | 'left' | 'right'", required: false, default: 'center', description: 'Text alignment' },
      { name: 'logoSrc', type: 'string', required: false, description: 'Logo image path relative to public/' },
      { name: 'entrancePreset', type: 'EntrancePreset', required: false, description: 'Animation style: fade-up, fly-from-left, fly-from-right, fly-from-bottom, zoom-in, drop-in' },
    ],
    bestFor: ['intro slides', 'section headers', 'end cards', 'brand reveals'],
  },
  {
    sceneType: 'text-scene',
    description: 'Heading with body text and/or bullet points. Versatile content scene for explanations and lists.',
    layout: `
┌────────────────────────┐
│  HEADING               │
│                        │
│  Body paragraph text   │
│  here...               │
│                        │
│  • Bullet point 1      │
│  • Bullet point 2      │
│  • Bullet point 3      │
└────────────────────────┘`,
    defaultAnimation: 'Heading springs up, body/bullets stagger in',
    entrancePresets: ['fade-up', 'fly-from-left', 'fly-from-right', 'fly-from-bottom', 'zoom-in', 'drop-in'],
    props: [
      { name: 'heading', type: 'string', required: false, description: 'Section heading' },
      { name: 'body', type: 'string', required: false, description: 'Paragraph text' },
      { name: 'bullets', type: 'string[]', required: false, description: 'Bullet point items' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000' },
      { name: 'textColor', type: 'string', required: false, default: '#FFFFFF' },
      { name: 'headingColor', type: 'string', required: false, description: 'Heading color (defaults to textColor)' },
      { name: 'headingFontSize', type: 'number', required: false, default: '56' },
      { name: 'bodyFontSize', type: 'number', required: false, default: '32' },
      { name: 'alignment', type: "'center' | 'left' | 'right'", required: false, default: 'left' },
      { name: 'animation', type: "'fade' | 'typewriter' | 'word-by-word'", required: false, default: 'fade', description: 'Body text reveal style' },
      { name: 'entrancePreset', type: 'EntrancePreset', required: false, description: 'Heading entrance animation' },
    ],
    bestFor: ['explanations', 'feature lists', 'key points', 'step-by-step content'],
  },
  {
    sceneType: 'image-scene',
    description: 'Full-screen image with optional text overlay. Ken Burns zoom and pan direction support.',
    layout: `
┌────────────────────────┐
│  ┌──────────────────┐  │
│  │                  │  │
│  │   [IMAGE]        │  │
│  │                  │  │
│  │   overlay text   │  │
│  └──────────────────┘  │
└────────────────────────┘`,
    defaultAnimation: 'Fade in with Ken Burns zoom',
    entrancePresets: ['fade-up', 'fly-from-left', 'fly-from-right', 'fly-from-bottom', 'zoom-in', 'drop-in'],
    props: [
      { name: 'src', type: 'string', required: true, description: 'Image path relative to public/' },
      { name: 'alt', type: 'string', required: false },
      { name: 'fit', type: "'cover' | 'contain' | 'fill'", required: false, default: 'cover' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000' },
      { name: 'overlayText', type: 'string', required: false, description: 'Text displayed over the image' },
      { name: 'overlayPosition', type: "'top' | 'center' | 'bottom'", required: false, default: 'bottom' },
      { name: 'overlayColor', type: 'string', required: false, default: '#FFFFFF' },
      { name: 'overlayFontSize', type: 'number', required: false, default: '36' },
      { name: 'kenBurns', type: 'boolean', required: false, default: 'true', description: 'Slow zoom effect' },
      { name: 'panDirection', type: "'left' | 'right' | 'zoom-in' | 'zoom-out'", required: false, description: 'Pan/zoom direction (overrides kenBurns)' },
      { name: 'entrancePreset', type: 'EntrancePreset', required: false },
    ],
    bestFor: ['photo showcases', 'product shots', 'background visuals', 'scene-setting'],
  },
  {
    sceneType: 'text-with-image',
    description: 'Split layout with text on one side and image on the other. Ideal for feature highlights.',
    layout: `
┌──────────┬─────────────┐
│          │             │
│  HEADING │   [IMAGE]   │
│  body    │             │
│  text    │             │
│          │             │
└──────────┴─────────────┘`,
    defaultAnimation: 'Text springs from left, image from right (or reversed)',
    entrancePresets: ['fade-up', 'fly-from-left', 'fly-from-right', 'fly-from-bottom', 'zoom-in', 'drop-in'],
    props: [
      { name: 'heading', type: 'string', required: false },
      { name: 'body', type: 'string', required: false },
      { name: 'imageSrc', type: 'string', required: true, description: 'Image path relative to public/' },
      { name: 'imagePosition', type: "'left' | 'right'", required: false, default: 'right' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000' },
      { name: 'textColor', type: 'string', required: false, default: '#FFFFFF' },
      { name: 'headingColor', type: 'string', required: false },
      { name: 'headingFontSize', type: 'number', required: false, default: '48' },
      { name: 'bodyFontSize', type: 'number', required: false, default: '28' },
      { name: 'entrancePreset', type: 'EntrancePreset', required: false },
    ],
    bestFor: ['feature highlights', 'product descriptions', 'before/after', 'comparison slides'],
  },
  {
    sceneType: 'kinetic-typography',
    description: 'Words animate in one at a time. Supports audio-synced word timing for narration videos.',
    layout: `
┌────────────────────────┐
│                        │
│  Word Word Word        │
│  Word Word             │
│                        │
└────────────────────────┘`,
    defaultAnimation: 'Words spring in one at a time (audio-synced or evenly spaced)',
    props: [
      { name: 'text', type: 'string', required: true, description: 'Full text to animate word-by-word' },
      { name: 'audioWords', type: 'AudioWord[]', required: false, description: 'Word-level timestamps {word, start, end} for audio sync' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000' },
      { name: 'textColor', type: 'string', required: false, default: '#FFFFFF' },
      { name: 'fontSize', type: 'number', required: false, default: '64' },
      { name: 'fontWeight', type: 'string', required: false, default: 'bold' },
      { name: 'alignment', type: "'center' | 'left' | 'right'", required: false, default: 'center' },
      { name: 'animation', type: "'spring' | 'fade' | 'scale'", required: false, default: 'spring', description: 'Per-word animation style' },
      { name: 'wordsPerLine', type: 'number', required: false, default: '5' },
    ],
    bestFor: ['narration sync', 'lyric videos', 'quote reveals', 'emphasis text'],
  },
  {
    sceneType: 'code-block',
    description: 'Syntax-highlighted code editor with typewriter, line-by-line, or fade animations.',
    layout: `
┌────────────────────────┐
│  ● ● ●  title  lang   │
│ ┌────────────────────┐ │
│ │ const x = 1;       │ │
│ │ console.log(x);    │ │
│ │ // ...             │ │
│ └────────────────────┘ │
└────────────────────────┘`,
    defaultAnimation: 'Typewriter with blinking cursor',
    props: [
      { name: 'code', type: 'string', required: true, description: 'Source code to display' },
      { name: 'language', type: 'string', required: false, default: 'typescript', description: 'Shown in title bar' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#1E1E1E', description: 'Code panel background' },
      { name: 'textColor', type: 'string', required: false, default: '#D4D4D4' },
      { name: 'highlightColor', type: 'string', required: false, default: '#569CD6' },
      { name: 'fontSize', type: 'number', required: false, default: '24' },
      { name: 'animation', type: "'typewriter' | 'line-by-line' | 'fade'", required: false, default: 'typewriter' },
      { name: 'title', type: 'string', required: false, description: 'Filename shown in title bar' },
    ],
    bestFor: ['code demos', 'tutorials', 'API examples', 'technical content'],
  },
  {
    sceneType: 'transition-wipe',
    description: 'Animated transition between scenes. Place between content scenes for visual breaks.',
    layout: `
┌────────────────────────┐
│████████░░░░░░░░░░░░░░░│  ← wipe progresses
│████████░░░░░░░░░░░░░░░│    across the frame
│████████░░░░░░░░░░░░░░░│
└────────────────────────┘`,
    defaultAnimation: 'Wipe from left to right',
    props: [
      { name: 'type', type: "'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'dissolve' | 'zoom'", required: false, default: 'wipe-left' },
      { name: 'color', type: 'string', required: false, default: '#000000', description: 'Wipe fill color' },
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000' },
    ],
    bestFor: ['scene transitions', 'section breaks', 'visual separators'],
  },
  {
    sceneType: 'custom',
    description: 'Fully custom scene with positioned objects (text, images, shapes) and per-property animations. Maximum flexibility — use when no template fits.',
    layout: `
┌────────────────────────┐
│  [obj1]      [obj3]    │
│        [obj2]          │
│                        │
│     [obj4]             │
└────────────────────────┘`,
    defaultAnimation: 'Per-object animations defined in the objects array',
    props: [
      { name: 'backgroundColor', type: 'string', required: false, default: '#000000', description: 'Set via props.backgroundColor' },
      { name: 'objects', type: 'ObjectConfig[]', required: true, description: 'Array of positioned objects with per-property animations. Or pass componentCode to create_scene for raw TSX.' },
    ],
    bestFor: ['complex layouts', 'custom animations', 'anything templates cannot express'],
  },
];

export function registerListTemplates(server: McpServer): void {
  server.registerTool(
    'list_templates',
    {
      title: 'List Templates',
      description: `Returns a catalog of all built-in scene templates with their props, layout, default
animation, and best-use-cases. Call this to discover what templates are available before
creating scenes. No projectPath required — this is static metadata.`,
      inputSchema: {},
    },
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'success',
            templateCount: TEMPLATE_CATALOG.length,
            templates: TEMPLATE_CATALOG,
            entrancePresets: [
              { name: 'fade-up', description: 'Fade in while sliding up (default for most templates)' },
              { name: 'fly-from-left', description: 'Spring in from the left edge' },
              { name: 'fly-from-right', description: 'Spring in from the right edge' },
              { name: 'fly-from-bottom', description: 'Spring in from below' },
              { name: 'zoom-in', description: 'Scale up from 50% to 100%' },
              { name: 'drop-in', description: 'Drop from above with bounce' },
            ],
            next_steps: 'Use a sceneType value in create_scene to build a scene. Pass props as documented.',
          }, null, 2),
        }],
      };
    }
  );
}
