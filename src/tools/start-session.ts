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
        required_questions: [
          {
            id: 'video_purpose',
            question: 'What is this video about? What is the goal?',
            examples: ['product launch', 'explainer', 'social ad', 'tutorial', 'lyric video'],
            why: 'Determines tone, pacing, and template selection',
          },
          {
            id: 'duration',
            question: 'How long should the video be?',
            options: ['15 seconds (social media)', '30 seconds', '60 seconds', '90 seconds', 'custom'],
            note: 'If user has narration audio with timestamps, duration is auto-calculated from audio length.',
            why: 'Sets totalDurationFrames or defers to audio length',
          },
          {
            id: 'audio_type',
            question: 'What about audio?',
            options: [
              'Voiceover with timestamp JSON (narration-driven)',
              'Voiceover without timestamps',
              'Background music only',
              'No audio',
            ],
            why: 'Determines durationMode, audio sync strategy, and Root.tsx audio components',
            follow_ups: {
              voiceover_with_timestamps: 'Place MP3 + timestamp JSON in assets/audio/. Video syncs to narration automatically. Duration calculated from audio.',
              voiceover_no_timestamps: 'You need word-level timestamps for sync. Tools like Whisper or AssemblyAI can generate these.',
              background_music: 'Place music in assets/audio/. It loops in background. Specify duration separately.',
              no_audio: 'Visual-only video. You specify the duration.',
            },
          },
          {
            id: 'assets_available',
            question: 'Do you have images, logos, screenshots, or other visual assets to include?',
            follow_up: 'If yes, place them in assets/images/ after project setup, then scan with scan_assets.',
            why: 'Determines if scan_assets should be called after init_project',
          },
          {
            id: 'dimensions',
            question: 'What format/aspect ratio?',
            options: [
              '1920x1080 (landscape — YouTube, presentations)',
              '1080x1920 (vertical — TikTok, Reels, Shorts)',
              '1080x1080 (square — Instagram, social)',
            ],
            default: '1920x1080',
            why: 'Sets width/height in composition settings',
          },
          {
            id: 'visual_style',
            question: 'What visual style/vibe?',
            examples: ['clean/minimal', 'bold/energetic', 'dark/techy', 'corporate', 'playful', 'cinematic'],
            why: 'Determines color palette, animation speed, typography choices',
          },
        ],
        optional_questions: [
          { id: 'brand_colors', question: 'Any specific brand colors? (hex codes or color names)' },
          { id: 'font_preference', question: 'Any font preference?', default: 'Inter (clean modern sans-serif)' },
          { id: 'reference_style', question: 'Any reference videos or channels whose style you like?' },
          { id: 'text_content', question: 'Do you already have the text/script, or should I help write it?' },
        ],
        post_onboarding_instructions:
          'After gathering all answers: 1) Summarize video plan. 2) Ask for confirmation. 3) Call init_project. 4) If user has assets, call scan_assets. 5) Begin creating scenes.',
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
