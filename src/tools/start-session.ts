import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerStartSession(server: McpServer): void {
  server.registerTool(
    'start_session',
    {
      title: 'Start Session',
      description: `ALWAYS call this tool FIRST before any other remotion tool when the user wants
to create a video. Returns a structured onboarding guide. Walk the user through
the questions conversationally (2-3 at a time). Do NOT call init_project until
you have all required information.`,
      inputSchema: z.object({
        workingDirectory: z.string().describe('The CWD where the project will be created'),
      }),
    },
    async ({ workingDirectory }) => {
      const result = {
        status: 'onboarding',
        workingDirectory,
        message: 'Welcome to Remotion Video Creator! Gather the following from the user.',

        // ─── PHILOSOPHY: open composition over fixed templates ──────────────────
        composition_philosophy: {
          principle: 'COMPOSE PRIMITIVES — DO NOT pick from fixed templates.',
          rationale:
            'Templates are example snippets, not constraints. Real videos are built by composing primitives (AnimatedText, AnimatedTextChars, KenBurns, MotionBlur, MorphPath, Captions, Gradient, FilmGrain, Glow, etc.) with design tokens (color roles, type scale, easings, springs) inside componentCode.',
          discovery_tools: [
            'list_primitives — all composable primitives + props + import patterns',
            'list_tokens — full design system (palettes, color roles, type scale, durations, easings, springs)',
            'list_motion_presets — entrance/exit animations, scene transitions, stagger patterns',
            'list_templates — kept only for inspiration; do NOT default to picking one',
          ],
          new_workflow:
            '1) start_session → 2) init_project → 3) set_theme (pick palette + brand fonts) → 4) for each scene: create_scene with componentCode that imports primitives + uses useTheme() → 5) optional add_transition between scenes → 6) start_preview',
        },

        required_questions: [
          {
            id: 'video_purpose',
            question: 'What is this video about? What is the goal?',
            examples: ['product launch', 'explainer', 'social ad', 'tutorial', 'lyric video', 'trailer', 'highlight reel'],
            why: 'Determines tone, pacing, motion intensity',
          },
          {
            id: 'duration',
            question: 'How long should the video be?',
            options: ['15 seconds (social media)', '30 seconds', '60 seconds', '90 seconds', 'custom'],
            note: 'If user has narration with timestamps, duration is auto-calculated from audio length.',
          },
          {
            id: 'audio_type',
            question: 'What about audio?',
            options: [
              'Voiceover with timestamp JSON (narration-driven, captions enabled)',
              'Voiceover without timestamps',
              'Background music only (beat-driven, supports analyze_beats)',
              'No audio',
            ],
            why: 'Determines audio sync strategy + whether to use Captions/BeatSync primitives',
          },
          {
            id: 'assets_available',
            question: 'Do you have images, logos, screenshots, Lottie animations, or other visual assets?',
            follow_up: 'Place them in assets/ after init. Use scan_assets to register, import_lottie for Lottie JSON, import_captions for SRT subtitles.',
          },
          {
            id: 'dimensions',
            question: 'What format/aspect ratio?',
            options: [
              '1920x1080 (landscape — YouTube, presentations)',
              '1080x1920 (vertical — TikTok, Reels, Shorts)',
              '1080x1080 (square — Instagram)',
            ],
            default: '1920x1080',
          },
          {
            id: 'visual_style',
            question: 'What visual style/vibe?',
            options: [
              'editorial-dark — cool blue M3 dark, cinematic (default)',
              'editorial-light — same but inverted',
              'cinematic-noir — pure B&W with optional gold accent',
              'electric-blue — saturated electric blue + crimson, bold',
              'forest-warm — muted teal + warm amber, organic',
              'custom — describe vibe + brand colors',
            ],
            why: 'Maps to set_theme palette. Custom = pick palette + override colorOverrides.',
          },
        ],
        optional_questions: [
          { id: 'brand_colors', question: 'Specific brand colors? (hex codes)', maps_to: 'set_theme colorOverrides' },
          { id: 'font_preference', question: 'Font preference? (Google Fonts name OR named stack: modern, display, editorial, mono, poster)', default: 'modern (Inter)' },
          { id: 'reference_style', question: 'Reference videos or channels? (helps set motion intensity)' },
          { id: 'text_content', question: 'Already have the text/script, or should I help write it?' },
        ],

        post_onboarding_workflow: [
          '1. Summarize the video plan back to the user. Ask for confirmation.',
          '2. Call init_project (scaffolds folder + installs Remotion deps).',
          '3. Call set_theme with chosen palette + brand colors + fonts.',
          '4. If user has assets: scan_assets, import_asset for files, import_lottie for animations, import_captions for SRT.',
          '5. Call list_primitives + list_tokens once to refresh on what is available.',
          '6. For each scene: create_scene with componentCode that imports from "../src/primitives", calls useTheme() for colors/type, composes primitives.',
          '7. Add scene transitions with add_transition (skip = hard cuts).',
          '8. start_preview to view + iterate.',
          '9. render_video when done.',
        ],

        anti_patterns_to_avoid: [
          'Hardcoding hex colors in componentCode — use theme.color.primary, theme.color.onSurface, etc.',
          'Hardcoding font sizes — use useTypeStyle("displayLarge") or theme.type.displayLarge.fontSize.',
          'Per-character opacity for typewriter — use string slicing: text.slice(0, charsRevealed).',
          'CSS transitions or @keyframes in componentCode — Remotion is frame-pure; use useCurrentFrame() + interpolate/spring.',
          'Reaching for the "custom" template type — go straight to create_scene with componentCode.',
          'Picking from list_templates by default — templates are inspiration, not the path.',
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
