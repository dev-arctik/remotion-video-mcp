# Remotion MCP Server — Complete Project Plan & Build Prompt

## PROJECT OVERVIEW

Build an MCP (Model Context Protocol) server called `remotion-video-mcp` that allows Claude (via Claude CLI or Claude Desktop) to create, preview, and render professional videos using Remotion. The MCP server acts as a bridge between Claude (the creative brain) and a Remotion project (the rendering canvas).

The user talks to Claude naturally — describes what video they want, provides assets, iterates on scenes — and Claude uses MCP tools to scaffold a Remotion project, write scene files, sync audio, preview frames, and render the final video. All of this happens in the folder where Claude CLI is activated.

---

## CORE ARCHITECTURE

```
┌─────────────────┐         MCP Protocol         ┌──────────────────────┐
│                  │ ◄──────────────────────────► │                      │
│   Claude CLI /   │    Tool calls & responses    │  remotion-video-mcp  │
│   Claude Desktop │                              │    (MCP Server)      │
│                  │                              │                      │
└─────────────────┘                               └──────────┬───────────┘
                                                             │
                                                             │ File I/O + Process Management
                                                             ▼
                                                  ┌──────────────────────┐
                                                  │   Remotion Project   │
                                                  │   (in user's CWD)   │
                                                  │                      │
                                                  │  /assets/            │
                                                  │  /scenes/            │
                                                  │  /src/               │
                                                  │  /output/            │
                                                  └──────────────────────┘
```

### Technology Stack

- **MCP Server**: Node.js + TypeScript using `@modelcontextprotocol/server`
- **Video Engine**: Remotion v4 (React-based programmatic video)
- **Runtime**: Node.js 18+
- **Package Manager**: npm
- **Language**: TypeScript throughout

---

## PROJECT STRUCTURE

The MCP server itself is a standalone npm package. When it scaffolds a Remotion project for the user, it creates a separate project in the user's working directory.

### MCP Server Package Structure

```
remotion-video-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                    ← MCP server entry point
│   ├── server.ts                   ← Server class with tool registration
│   ├── tools/
│   │   ├── start-session.ts        ← Onboarding questionnaire tool
│   │   ├── init-project.ts         ← Scaffold Remotion project
│   │   ├── scan-assets.ts          ← Scan & analyze assets folder
│   │   ├── create-scene.ts         ← Create a new scene file
│   │   ├── update-scene.ts         ← Modify existing scene
│   │   ├── delete-scene.ts         ← Remove a scene
│   │   ├── reorder-scenes.ts       ← Change scene order
│   │   ├── list-scenes.ts          ← List current scenes & state
│   │   ├── update-composition.ts   ← Update the master composition
│   │   ├── start-preview.ts        ← Launch Remotion Studio
│   │   ├── stop-preview.ts         ← Stop the dev server
│   │   ├── capture-frame.ts        ← Render a still frame for review
│   │   └── render-video.ts         ← Final MP4/WebM render
│   ├── state/
│   │   └── project-state.ts        ← Manages composition state in memory
│   ├── templates/                  ← Remotion component templates (copied into user projects)
│   │   ├── components/
│   │   │   ├── TitleCard.tsx
│   │   │   ├── TextScene.tsx
│   │   │   ├── ImageScene.tsx
│   │   │   ├── TextWithImage.tsx
│   │   │   ├── KineticTypography.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── TransitionWipe.tsx
│   │   │   └── AnimatedObject.tsx  ← Generic object-level animation renderer
│   │   ├── (Root.tsx is NOT here — always generated dynamically by file-ops.ts)
│   │   ├── SceneRenderer.tsx       ← Reads scene JSON and picks the right component
│   │   └── utils/
│   │       ├── animations.ts       ← Shared animation helpers (spring, interpolate wrappers)
│   │       ├── colors.ts           ← Color palette utilities
│   │       └── fonts.ts            ← Font loading utilities
│   └── utils/
│       ├── file-ops.ts             ← File system helpers
│       ├── process-manager.ts      ← Manages Remotion dev server & render processes
│       └── audio-utils.ts          ← Audio timestamp parsing & duration calculation
└── templates/
    └── project-scaffold/           ← Template files copied when init_project runs
        ├── package.json.template
        ├── tsconfig.json.template
        └── remotion.config.ts.template
```

### Scaffolded Remotion Project Structure (Created in User's CWD)

When the user says "start" and Claude calls `init_project`, this is what gets created:

```
{project-name}/
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── assets/
│   ├── images/                     ← User drops images here
│   │   └── .gitkeep
│   ├── audio/                      ← User drops audio + timestamp files here
│   │   └── .gitkeep
│   └── fonts/                      ← Custom fonts
│       └── .gitkeep
├── scenes/
│   ├── scene-001-intro.tsx         ← Individual scene files (created by Claude)
│   ├── scene-002-main.tsx
│   └── ...
├── src/
│   ├── Root.tsx                    ← Master composition stitching all scenes
│   ├── SceneRenderer.tsx           ← Renders scenes from JSON data
│   ├── templates/                  ← Reusable animation components
│   │   ├── TitleCard.tsx
│   │   ├── TextScene.tsx
│   │   ├── ImageScene.tsx
│   │   ├── TextWithImage.tsx
│   │   ├── KineticTypography.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── TransitionWipe.tsx
│   │   └── AnimatedObject.tsx
│   └── utils/
│       ├── animations.ts
│       ├── colors.ts
│       └── fonts.ts
├── composition.json                ← Master state file — source of truth for all scenes
└── output/                         ← Rendered videos go here
    └── .gitkeep
```

---

## COMPOSITION.JSON — THE MASTER STATE FILE

This is the single source of truth that describes the entire video. Claude reads and writes this file. The Remotion components consume it.

```json
{
  "version": "1.0",
  "metadata": {
    "title": "My Product Launch Video",
    "description": "A 45-second explainer for the SaaS product",
    "createdAt": "2025-02-25T10:00:00Z",
    "updatedAt": "2025-02-25T10:30:00Z"
  },
  "settings": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "totalDurationFrames": null,
    "backgroundColor": "#000000"
  },
  "style": {
    "theme": "minimal",
    "primaryColor": "#2563EB",
    "secondaryColor": "#1E293B",
    "accentColor": "#F59E0B",
    "fontFamily": "Inter",
    "headingFontFamily": "Inter",
    "defaultTextColor": "#FFFFFF",
    "defaultFontSize": 48
  },
  "audio": {
    "type": "narration",
    "narration": {
      "file": "assets/audio/voiceover.mp3",
      "timestampFile": "assets/audio/voiceover.json",
      "totalDuration": 44.8,
      "segments": [
        {
          "id": "seg-001",
          "text": "APIs are everywhere in modern software",
          "startTime": 0.0,
          "endTime": 2.8,
          "words": [
            { "word": "APIs", "start": 0.0, "end": 0.4 },
            { "word": "are", "start": 0.45, "end": 0.6 },
            { "word": "everywhere", "start": 0.65, "end": 1.2 },
            { "word": "in", "start": 1.25, "end": 1.35 },
            { "word": "modern", "start": 1.4, "end": 1.7 },
            { "word": "software", "start": 1.75, "end": 2.8 }
          ]
        }
      ]
    },
    "backgroundMusic": {
      "file": "assets/audio/bg-music.mp3",
      "volume": 0.15,
      "loop": true,
      "fadeInFrames": 30,
      "fadeOutFrames": 60
    }
  },
  "scenes": [
    {
      "id": "scene-001",
      "name": "intro",
      "type": "title-card",
      "file": "scenes/scene-001-intro.tsx",
      "durationFrames": 90,
      "startFrame": 0,
      "audioSegmentIds": ["seg-001"],
      "transition": {
        "in": { "type": "fade", "durationFrames": 15 },
        "out": { "type": "wipe-left", "durationFrames": 20 }
      },
      "props": {
        "title": "How APIs Work",
        "subtitle": "A visual guide",
        "backgroundColor": "#0f0f23",
        "titleColor": "#FFFFFF",
        "titleFontSize": 72,
        "subtitleFontSize": 32
      }
    },
    {
      "id": "scene-002",
      "name": "product-showcase",
      "type": "custom",
      "file": "scenes/scene-002-product.tsx",
      "durationFrames": 150,
      "startFrame": 90,
      "audioSegmentIds": ["seg-002", "seg-003"],
      "transition": {
        "in": { "type": "none" },
        "out": { "type": "fade", "durationFrames": 15 }
      },
      "props": {
        "backgroundColor": "#0f0f23"
      },
      "objects": [
        {
          "id": "product-img",
          "type": "image",
          "src": "assets/images/product-shot.png",
          "position": { "x": "center", "y": "center" },
          "size": { "width": "60%", "height": "auto" },
          "animations": [
            {
              "property": "opacity",
              "from": 0,
              "to": 1,
              "startFrame": 0,
              "endFrame": 20,
              "easing": "linear"
            },
            {
              "property": "scale",
              "from": 1.15,
              "to": 1.0,
              "startFrame": 0,
              "endFrame": 40,
              "easing": "spring",
              "springConfig": { "damping": 12, "mass": 0.5, "stiffness": 100 }
            }
          ]
        },
        {
          "id": "title-text",
          "type": "text",
          "content": "Meet the Product",
          "fontSize": 64,
          "fontWeight": "bold",
          "color": "#FFFFFF",
          "position": { "x": 100, "y": 80 },
          "animations": [
            {
              "property": "x",
              "from": -600,
              "to": 100,
              "startFrame": 10,
              "endFrame": 35,
              "easing": "spring"
            },
            {
              "property": "opacity",
              "from": 0,
              "to": 1,
              "startFrame": 10,
              "endFrame": 25,
              "easing": "linear"
            }
          ]
        },
        {
          "id": "subtitle-text",
          "type": "text",
          "content": "The future of productivity",
          "fontSize": 28,
          "color": "#94A3B8",
          "position": { "x": 100, "y": 160 },
          "animations": [
            {
              "property": "opacity",
              "from": 0,
              "to": 1,
              "startFrame": 40,
              "endFrame": 55,
              "easing": "linear"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## AUDIO TIMESTAMP FORMAT

Users place audio files in `assets/audio/`. For narration-driven videos, they also provide a timestamp JSON file.

### Timestamp JSON Schema

```json
{
  "type": "voiceover",
  "speaker": "narrator",
  "totalDuration": 44.8,
  "segments": [
    {
      "id": "seg-001",
      "text": "APIs are everywhere in modern software",
      "startTime": 0.0,
      "endTime": 2.8,
      "words": [
        { "word": "APIs", "start": 0.0, "end": 0.4 },
        { "word": "are", "start": 0.45, "end": 0.6 },
        { "word": "everywhere", "start": 0.65, "end": 1.2 },
        { "word": "in", "start": 1.25, "end": 1.35 },
        { "word": "modern", "start": 1.4, "end": 1.7 },
        { "word": "software", "start": 1.75, "end": 2.8 }
      ]
    },
    {
      "id": "seg-002",
      "text": "Think of them like a waiter in a restaurant",
      "startTime": 3.2,
      "endTime": 5.9,
      "words": [
        { "word": "Think", "start": 3.2, "end": 3.5 },
        { "word": "of", "start": 3.52, "end": 3.6 },
        { "word": "them", "start": 3.62, "end": 3.8 },
        { "word": "like", "start": 3.85, "end": 4.1 },
        { "word": "a", "start": 4.12, "end": 4.2 },
        { "word": "waiter", "start": 4.25, "end": 4.7 },
        { "word": "in", "start": 4.75, "end": 4.85 },
        { "word": "a", "start": 4.87, "end": 4.95 },
        { "word": "restaurant", "start": 5.0, "end": 5.9 }
      ]
    }
  ]
}
```

### Three Audio Modes

The system supports three audio modes. Claude determines which mode to use during the `start_session` onboarding:

**Mode 1: Narration-Driven**
- User provides: MP3 + timestamp JSON with word-level timing
- Behavior: Audio duration becomes the video duration. Scenes are created to match narration segments. Visual animations sync to word timestamps.
- `composition.json` → `audio.type = "narration"`
- `settings.totalDurationFrames` = `Math.ceil(audio.narration.totalDuration * settings.fps)`

**Mode 2: Background Music Only**
- User provides: MP3 file (no timestamps needed)
- Behavior: Music loops or plays once in background. User specifies video duration independently. Scenes are not audio-synced.
- `composition.json` → `audio.type = "background"`
- `settings.totalDurationFrames` = user-specified

**Mode 3: No Audio**
- User provides: Nothing in audio folder
- Behavior: Silent video. User specifies duration. Pure visual.
- `composition.json` → `audio.type = "none"`
- `settings.totalDurationFrames` = user-specified

---

## MCP TOOL DEFINITIONS — DETAILED SPECIFICATIONS

### Tool 1: `start_session`

**Purpose**: ALWAYS called first. Returns an onboarding questionnaire that guides Claude to ask the user the right questions before creating anything.

**Description for MCP** (this is what Claude reads):
```
ALWAYS call this tool FIRST before any other remotion tool when the user wants to create a video.
This tool returns a structured onboarding guide. You MUST walk the user through these questions
conversationally before calling init_project. Ask 2-3 questions at a time, not all at once.
Be natural and friendly. Adapt follow-up questions based on user answers.
Do NOT call init_project until you have all required information.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "workingDirectory": {
      "type": "string",
      "description": "The current working directory where the project will be created"
    }
  },
  "required": ["workingDirectory"]
}
```

**Returns**:
```json
{
  "status": "onboarding",
  "message": "Welcome to Remotion Video Creator! Gather the following info from the user before proceeding.",
  "required_questions": [
    {
      "id": "video_purpose",
      "question": "What is this video about? What's the goal?",
      "examples": ["product launch", "explainer", "social media ad", "tutorial", "promo", "lyric video", "slideshow"],
      "why": "Determines tone, pacing, and template selection"
    },
    {
      "id": "duration",
      "question": "How long should the video be?",
      "options": ["15 seconds (social media)", "30 seconds", "60 seconds", "90 seconds", "custom"],
      "note": "If user has narration audio with timestamps, duration is auto-calculated from audio length. Inform the user of this."
    },
    {
      "id": "audio_type",
      "question": "What about audio?",
      "options": [
        "I have a voiceover recording with a timestamp/lyrics JSON file (narration-driven video)",
        "I have a voiceover but NO timestamps yet",
        "Just background music (lofi, ambient, etc.) on loop",
        "No audio — silent video"
      ],
      "follow_ups": {
        "voiceover_with_timestamps": "Great! Place the MP3 and the timestamp JSON in assets/audio/. The video will sync to your narration automatically. I'll calculate the duration from your audio.",
        "voiceover_no_timestamps": "You'll need to generate word-level timestamps for sync to work. Tools like Whisper (OpenAI) or AssemblyAI can generate these. Want me to explain the format?",
        "background_music": "Place your music file in assets/audio/. It will loop in the background. You'll need to specify video duration separately.",
        "no_audio": "No problem — we'll make a visual-only video. You'll specify the duration."
      }
    },
    {
      "id": "assets_available",
      "question": "Do you have images, logos, screenshots, or other visual assets to include?",
      "follow_up": "If yes, tell the user to place them in assets/images/ after project setup, then you'll scan and analyze them."
    },
    {
      "id": "visual_style",
      "question": "What visual style/vibe?",
      "examples": ["clean/minimal", "bold/energetic", "dark/techy", "corporate/professional", "playful/colorful", "cinematic"],
      "note": "This determines color palette, animation speed, typography choices"
    },
    {
      "id": "dimensions",
      "question": "What format/aspect ratio?",
      "options": [
        "1920x1080 (landscape — YouTube, presentations)",
        "1080x1920 (vertical — TikTok, Reels, Shorts)",
        "1080x1080 (square — Instagram, social)"
      ],
      "default": "1920x1080"
    }
  ],
  "optional_questions": [
    {
      "id": "brand_colors",
      "question": "Any specific brand colors? (hex codes or color names)",
      "note": "If they have a logo in assets, you can offer to extract colors from it"
    },
    {
      "id": "font_preference",
      "question": "Any font preference?",
      "default": "Inter (clean modern sans-serif)"
    },
    {
      "id": "reference_style",
      "question": "Any reference videos or channels whose style you like?"
    },
    {
      "id": "text_content",
      "question": "Do you already have the text/script for the video, or should I help write it?"
    }
  ],
  "post_onboarding_instructions": "After gathering all answers: 1) Summarize the video plan back to the user. 2) Ask for confirmation. 3) Call init_project with the collected parameters. 4) If user has assets ready, call scan_assets. 5) Begin creating scenes."
}
```

---

### Tool 2: `init_project`

**Description for MCP**:
```
Scaffold a new Remotion video project in the user's working directory.
ONLY call this AFTER start_session onboarding is complete and you have gathered:
video purpose, duration, audio type, dimensions, and visual style.

This creates the full project structure with all template components,
installs dependencies, and creates an initial composition.json.

If audio_type is "narration" and user has timestamps, set durationMode to "audio"
so the total duration will be calculated from the audio file.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectName": {
      "type": "string",
      "description": "Folder name for the project (kebab-case, e.g. 'product-launch-video')"
    },
    "title": {
      "type": "string",
      "description": "Human-readable title for the video"
    },
    "width": { "type": "number", "default": 1920 },
    "height": { "type": "number", "default": 1080 },
    "fps": { "type": "number", "default": 30 },
    "durationMode": {
      "type": "string",
      "enum": ["audio", "manual"],
      "description": "If 'audio', duration is calculated from narration timestamps. If 'manual', uses durationSeconds."
    },
    "durationSeconds": {
      "type": "number",
      "description": "Video duration in seconds (required if durationMode is 'manual')"
    },
    "audioType": {
      "type": "string",
      "enum": ["narration", "background", "none"]
    },
    "style": {
      "type": "object",
      "properties": {
        "theme": { "type": "string" },
        "primaryColor": { "type": "string" },
        "secondaryColor": { "type": "string" },
        "accentColor": { "type": "string" },
        "fontFamily": { "type": "string", "default": "Inter" }
      }
    }
  },
  "required": ["projectName", "title", "durationMode", "audioType"]
}
```

**What it does**:
1. Creates the project directory structure (see scaffolded structure above)
2. Copies all template components from the MCP server's templates into the project
3. Generates `package.json` with Remotion v4 dependencies
4. Generates `tsconfig.json` configured for Remotion + React
5. Generates `remotion.config.ts`
6. Creates initial `composition.json` with metadata and settings
7. Runs `npm install`
8. Returns success message with the project path and next steps

**Returns**:
```json
{
  "status": "success",
  "projectPath": "/Users/john/projects/product-launch-video",
  "message": "Project scaffolded and dependencies installed.",
  "next_steps": "If you have assets, place them in the assets/ folder and tell me when ready. I'll scan them with scan_assets. Then we'll start creating scenes.",
  "structure_created": ["assets/images/", "assets/audio/", "assets/fonts/", "scenes/", "src/", "output/"]
}
```

---

### Tool 3: `scan_assets`

**Description for MCP**:
```
Scan the assets folder of the current Remotion project and analyze all files.
Call this whenever the user says they've added files to the assets folder.

For images: Return file names, dimensions, and file sizes. If Claude has vision,
it should describe what each image contains to plan scenes effectively.

For audio: Parse any timestamp JSON files. Return segment count, total duration,
and the full segment list. For MP3/WAV files without timestamps, return duration.

For fonts: List available custom font files.

After scanning, ALWAYS present a summary of found assets to the user and
propose how they could be used in the video. Ask for confirmation before proceeding.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectPath": {
      "type": "string",
      "description": "Path to the Remotion project root"
    }
  },
  "required": ["projectPath"]
}
```

**Returns**:
```json
{
  "status": "success",
  "assets": {
    "images": [
      {
        "filename": "product-shot.png",
        "path": "assets/images/product-shot.png",
        "width": 2400,
        "height": 1600,
        "sizeKB": 450,
        "format": "png"
      },
      {
        "filename": "logo.svg",
        "path": "assets/images/logo.svg",
        "sizeKB": 12,
        "format": "svg"
      }
    ],
    "audio": [
      {
        "filename": "voiceover.mp3",
        "path": "assets/audio/voiceover.mp3",
        "durationSeconds": 44.8,
        "format": "mp3"
      },
      {
        "filename": "voiceover.json",
        "path": "assets/audio/voiceover.json",
        "type": "timestamps",
        "segmentCount": 15,
        "totalDuration": 44.8,
        "segments": [ "...full segment array..." ]
      }
    ],
    "fonts": [
      {
        "filename": "CustomFont-Bold.woff2",
        "path": "assets/fonts/CustomFont-Bold.woff2"
      }
    ]
  },
  "instructions_for_claude": "Present a summary of all assets to the user. For images, describe them visually (use vision if available). For narration audio, explain how many segments there are and the total duration. Propose a scene plan based on the available assets and narration segments."
}
```

---

### Tool 4: `create_scene`

**Description for MCP**:
```
Create a new scene file in the scenes/ directory and register it in composition.json.

Each scene is a separate .tsx file for modularity. Scene files are self-contained
React components that receive their props from composition.json.

For narration-driven videos: each scene should correspond to one or more audio segments.
Set the scene's durationFrames based on the audio segment timing:
  durationFrames = Math.ceil((segmentEndTime - segmentStartTime) * fps)

For scenes with custom object-level animations, provide the "objects" array with
per-object animation timelines. The AnimatedObject component will handle rendering.

IMPORTANT: Always explain to the user what each scene will show before creating it.
After creating a scene, suggest the user check the preview if the dev server is running.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectPath": { "type": "string" },
    "sceneId": {
      "type": "string",
      "description": "Unique scene ID, e.g. 'scene-001'"
    },
    "sceneName": {
      "type": "string",
      "description": "Human-readable name, e.g. 'intro', 'product-showcase'"
    },
    "sceneType": {
      "type": "string",
      "enum": ["title-card", "text-scene", "image-scene", "text-with-image", "kinetic-typography", "code-block", "custom"],
      "description": "Which template component to use. Use 'custom' for scenes with object-level animation control."
    },
    "durationFrames": {
      "type": "number",
      "description": "Duration in frames. At 30fps: 30=1sec, 90=3sec, 150=5sec"
    },
    "audioSegmentIds": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Which audio segments this scene covers (for narration-driven videos)"
    },
    "transition": {
      "type": "object",
      "properties": {
        "in": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "wipe-left", "wipe-right", "zoom"] },
            "durationFrames": { "type": "number" }
          }
        },
        "out": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "wipe-left", "wipe-right", "zoom"] },
            "durationFrames": { "type": "number" }
          }
        }
      }
    },
    "props": {
      "type": "object",
      "description": "Props passed to the template component. Schema depends on sceneType."
    },
    "objects": {
      "type": "array",
      "description": "For 'custom' sceneType — array of animated objects with per-object timelines.",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string", "enum": ["text", "image", "shape", "svg"] },
          "src": { "type": "string", "description": "For image type — path to image file" },
          "content": { "type": "string", "description": "For text type — the text content" },
          "fontSize": { "type": "number" },
          "fontWeight": { "type": "string" },
          "color": { "type": "string" },
          "position": {
            "type": "object",
            "properties": {
              "x": { "type": ["number", "string"] },
              "y": { "type": ["number", "string"] }
            }
          },
          "size": {
            "type": "object",
            "properties": {
              "width": { "type": ["number", "string"] },
              "height": { "type": ["number", "string"] }
            }
          },
          "animations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "property": {
                  "type": "string",
                  "enum": ["opacity", "x", "y", "scale", "rotation", "width", "height"]
                },
                "from": { "type": "number" },
                "to": { "type": "number" },
                "startFrame": { "type": "number" },
                "endFrame": { "type": "number" },
                "easing": {
                  "type": "string",
                  "enum": ["linear", "ease-in", "ease-out", "ease-in-out", "spring"],
                  "default": "spring"
                },
                "springConfig": {
                  "type": "object",
                  "properties": {
                    "damping": { "type": "number", "default": 10 },
                    "mass": { "type": "number", "default": 1 },
                    "stiffness": { "type": "number", "default": 100 }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "required": ["projectPath", "sceneId", "sceneName", "sceneType", "durationFrames"]
}
```

**What it does**:
1. Generates the scene `.tsx` file in `scenes/` directory
2. For template-based scenes (title-card, text-scene, etc.): imports the template component and passes props
3. For custom scenes: uses the `AnimatedObject` renderer with the objects array
4. Adds the scene entry to `composition.json`
5. Recalculates `startFrame` for all scenes (sequential)
6. Updates `Root.tsx` to include the new scene in the `<Series>`

---

### Tool 5: `update_scene`

**Description for MCP**:
```
Modify an existing scene. Can update props, objects, animations, duration, or transitions.
This is the most-used tool during iteration. Only modifies the specified scene —
does not touch other scenes.

After updating, recalculate startFrame for all subsequent scenes if duration changed.
Update the scene's .tsx file AND its entry in composition.json.

IMPORTANT: After updating, remind the user to check the preview for the change.
```

**Input Schema**: Same as `create_scene` but with `sceneId` as the required identifier. All other fields are optional — only specified fields are updated.

---

### Tool 6: `delete_scene`

**Description for MCP**:
```
Delete a scene. Removes the .tsx file, removes the entry from composition.json,
recalculates startFrame for all subsequent scenes, and updates Root.tsx.
Ask user for confirmation before deleting.
```

---

### Tool 7: `reorder_scenes`

**Description for MCP**:
```
Change the order of scenes. Provide the new scene order as an array of sceneIds.
Recalculates all startFrame values and regenerates Root.tsx.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectPath": { "type": "string" },
    "sceneOrder": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Ordered array of scene IDs in desired sequence"
    }
  }
}
```

---

### Tool 8: `list_scenes`

**Description for MCP**:
```
List all current scenes with their properties. Returns the full scenes array
from composition.json plus computed info like total video duration.
Call this whenever you need to understand the current state of the video.
```

---

### Tool 9: `update_composition`

**Description for MCP**:
```
Update global composition settings — style, audio config, dimensions, fps, etc.
Does NOT modify individual scenes (use update_scene for that).
Use this for changing the overall theme, swapping audio, or changing resolution.
```

---

### Tool 10: `start_preview`

**Description for MCP**:
```
Start the Remotion Studio dev server for live preview in the browser.
Launches 'npx remotion studio' in the project directory.
The preview auto-reloads when scene files change.

Tell the user to open the URL in their browser to see the video preview.
The dev server stays running until stop_preview is called or the process is terminated.

IMPORTANT: Always call this after creating the initial set of scenes so
the user can see their video taking shape.
```

**Returns**:
```json
{
  "status": "running",
  "url": "http://localhost:3000",
  "message": "Remotion Studio is running. Open http://localhost:3000 in your browser to preview.",
  "pid": 12345
}
```

---

### Tool 11: `stop_preview`

**Description for MCP**:
```
Stop the Remotion Studio dev server. Call this before render_video
or when the user is done previewing.
```

---

### Tool 12: `capture_frame`

**Description for MCP**:
```
Render a single frame of the video as a PNG image. Useful for reviewing
specific moments without opening the full preview.

Use this to verify:
- Text positioning and sizing
- Image placement
- Color scheme
- Animation states at specific keyframes

Returns the image as base64 or a file path. If you have vision capability,
analyze the frame and suggest improvements proactively.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectPath": { "type": "string" },
    "frame": {
      "type": "number",
      "description": "Frame number to capture (0-based)"
    },
    "sceneId": {
      "type": "string",
      "description": "Optional — capture a frame relative to a specific scene (frame 0 = first frame of that scene)"
    }
  }
}
```

---

### Tool 13: `render_video`

**Description for MCP**:
```
Render the final video as MP4 (or WebM). This runs the full Remotion render pipeline.
Stop the preview server before rendering to free up resources.

The rendered file is saved to the project's output/ directory.

Inform the user that rendering may take a few minutes depending on video length
and complexity. Provide progress updates if available.
```

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "projectPath": { "type": "string" },
    "outputFormat": {
      "type": "string",
      "enum": ["mp4", "webm"],
      "default": "mp4"
    },
    "quality": {
      "type": "string",
      "enum": ["draft", "standard", "high"],
      "default": "standard",
      "description": "draft=fast/lower quality, standard=balanced, high=slow/best quality"
    },
    "outputFileName": {
      "type": "string",
      "description": "Output file name (without extension)",
      "default": "output"
    }
  }
}
```

---

## TEMPLATE COMPONENTS — DETAILED SPECS

### 1. TitleCard.tsx

A full-screen title card with animated text entrance.

**Props**:
- `title: string` — Main title text
- `subtitle?: string` — Optional subtitle
- `backgroundColor: string` — Background color
- `titleColor: string` — Title text color (default: white)
- `subtitleColor?: string` — Subtitle color (default: 70% opacity of titleColor)
- `titleFontSize: number` — Title font size in px (default: 72)
- `subtitleFontSize: number` — Subtitle font size (default: 32)
- `alignment: "center" | "left" | "right"` — Text alignment (default: center)
- `logoSrc?: string` — Optional logo image path

**Animations**:
- Title: Fade in + slide up from 20px below (spring, frames 0-25)
- Subtitle: Fade in + slide up, delayed by 15 frames (spring, frames 15-40)
- Logo (if present): Fade in at frame 0

---

### 2. TextScene.tsx

A scene displaying text content with optional bullet points or paragraphs.

**Props**:
- `heading?: string` — Optional heading
- `body: string | string[]` — Text content (string for paragraph, array for bullet points)
- `backgroundColor: string`
- `textColor: string`
- `fontSize: number`
- `textPosition: "center" | "left" | "right"` — Content alignment
- `animation: "fade" | "typewriter" | "slide-up" | "word-by-word"` — Text entrance style

**Animations**:
- fade: Simple opacity 0→1
- typewriter: Characters appear one by one
- slide-up: Text slides in from below
- word-by-word: Each word fades in sequentially (great for narration sync — uses audio word timestamps if available)

---

### 3. ImageScene.tsx

A scene displaying an image with optional overlay text.

**Props**:
- `imageSrc: string` — Path to image file
- `imageFit: "cover" | "contain" | "fill"` — How image fills the frame
- `overlayText?: string` — Text overlaid on the image
- `overlayPosition: "top" | "center" | "bottom"` — Where overlay appears
- `overlayBackdrop: boolean` — Semi-transparent backdrop behind text
- `kenBurns: boolean` — Slow zoom/pan effect (default: true)
- `kenBurnsDirection: "in" | "out" | "left" | "right"` — Zoom/pan direction

**Animations**:
- Image: Fade in over first 15 frames
- Ken Burns: Slow scale from 1.0 to 1.08 (or vice versa) over entire scene duration
- Overlay text: Fade in after 20 frames

---

### 4. TextWithImage.tsx

Split layout — text on one side, image on the other.

**Props**:
- `imageSrc: string`
- `imagePosition: "left" | "right"` — Which side the image is on
- `imageSplit: number` — Percentage width for image (default: 50)
- `heading?: string`
- `body: string`
- `backgroundColor: string`
- `textColor: string`

**Animations**:
- Image slides in from its side (left image slides from left, right from right)
- Text fades in + slides from opposite side
- Staggered: image first, then text 10 frames later

---

### 5. KineticTypography.tsx

Animated text where words/phrases have individual motion — great for lyric videos or emphasis.

**Props**:
- `words: Array<{ text: string, emphasis?: boolean, color?: string }>` — Word list with optional per-word styling
- `backgroundColor: string`
- `defaultColor: string`
- `animationStyle: "bounce" | "scale-pop" | "slide" | "rotate"` — How each word enters
- `audioWords?: Array<{ word: string, start: number, end: number }>` — Word-level timestamps for audio sync

**Animations**:
- Each word animates in sequentially
- If audioWords provided: sync entrance to word timestamps
- Emphasis words get bigger scale or different color
- Stagger delay between words: 3-5 frames (or audio-driven)

---

### 6. CodeBlock.tsx

Displays code with syntax highlighting — great for dev/tech content.

**Props**:
- `code: string` — The code to display
- `language: string` — Programming language for highlighting
- `theme: "dark" | "light"` — Color theme
- `highlightLines?: number[]` — Lines to highlight/emphasize
- `animation: "typewriter" | "line-by-line" | "fade"` — How code appears

---

### 7. TransitionWipe.tsx

A standalone transition scene inserted between content scenes.

**Props**:
- `type: "wipe-left" | "wipe-right" | "wipe-up" | "wipe-down" | "circle" | "dissolve"`
- `color: string` — Wipe color
- `durationFrames: number` — Transition speed

---

### 8. AnimatedObject.tsx — THE GENERIC RENDERER

This is the most important component. It takes a single object definition from the `objects` array and renders it with all specified animations.

**Input**: One object from the scene's `objects` array (see composition.json schema above)

**How it works**:
```tsx
// Pseudocode
const AnimatedObject = ({ config, frame }) => {
  // Apply each animation based on current frame
  let style = { position: "absolute" };
  
  for (const anim of config.animations) {
    if (frame >= anim.startFrame && frame <= anim.endFrame) {
      const progress = (frame - anim.startFrame) / (anim.endFrame - anim.startFrame);
      const value = interpolate(progress, anim.from, anim.to, anim.easing);
      style[anim.property] = value;
    } else if (frame > anim.endFrame) {
      style[anim.property] = anim.to; // Hold final value
    } else {
      style[anim.property] = anim.from; // Before animation starts
    }
  }
  
  // Render based on object type
  switch (config.type) {
    case "text": return <div style={style}>{config.content}</div>;
    case "image": return <Img src={config.src} style={style} />;
    case "shape": return <div style={{...style, ...shapeStyles}} />;
  }
};
```

---

## ROOT.TSX — THE COMPOSITION STITCHER

Root.tsx reads `composition.json` and stitches all scenes together using Remotion's `<Series>` component.

```tsx
// Pseudocode structure
import { Composition, Series, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import compositionData from "../composition.json";
import { SceneRenderer } from "./SceneRenderer";

export const RemotionRoot = () => {
  const { settings, scenes, audio } = compositionData;
  const totalFrames = scenes.reduce((sum, s) => sum + s.durationFrames, 0);

  return (
    <Composition
      id="main"
      component={() => (
        <>
          {/* Background music */}
          {audio.backgroundMusic && (
            <Audio
              src={staticFile(audio.backgroundMusic.file)}
              volume={audio.backgroundMusic.volume}
              loop={audio.backgroundMusic.loop}
            />
          )}

          {/* Narration audio */}
          {audio.type === "narration" && (
            <Audio src={staticFile(audio.narration.file)} />
          )}

          {/* Scenes in sequence */}
          <Series>
            {scenes.map((scene) => (
              <Series.Sequence key={scene.id} durationInFrames={scene.durationFrames}>
                <SceneRenderer scene={scene} compositionData={compositionData} />
              </Series.Sequence>
            ))}
          </Series>
        </>
      )}
      durationInFrames={totalFrames}
      fps={settings.fps}
      width={settings.width}
      height={settings.height}
    />
  );
};
```

---

## SCENE RENDERER — ROUTE SCENES TO COMPONENTS

```tsx
// SceneRenderer.tsx — maps scene type to the right template component
import { TitleCard } from "./templates/TitleCard";
import { TextScene } from "./templates/TextScene";
import { ImageScene } from "./templates/ImageScene";
import { TextWithImage } from "./templates/TextWithImage";
import { KineticTypography } from "./templates/KineticTypography";
import { CodeBlock } from "./templates/CodeBlock";
import { AnimatedObject } from "./templates/AnimatedObject";

const COMPONENT_MAP = {
  "title-card": TitleCard,
  "text-scene": TextScene,
  "image-scene": ImageScene,
  "text-with-image": TextWithImage,
  "kinetic-typography": KineticTypography,
  "code-block": CodeBlock,
};

export const SceneRenderer = ({ scene, compositionData }) => {
  // Template-based scene
  if (scene.type !== "custom" && COMPONENT_MAP[scene.type]) {
    const Component = COMPONENT_MAP[scene.type];
    return <Component {...scene.props} audioSegments={getAudioSegments(scene, compositionData)} />;
  }

  // Custom scene with object-level animations
  if (scene.type === "custom" && scene.objects) {
    const frame = useCurrentFrame();
    return (
      <AbsoluteFill style={{ backgroundColor: scene.props?.backgroundColor || "#000" }}>
        {scene.objects.map((obj) => (
          <AnimatedObject key={obj.id} config={obj} frame={frame} />
        ))}
      </AbsoluteFill>
    );
  }
};
```

---

## CONVERSATION FLOW EXAMPLES

### Example 1: Narration-Driven Product Video

```
User: "I want to create a product explainer video"

Claude: [calls start_session]
→ "Great! Let's plan this out. What product are we explaining, and who's the audience?"

User: "It's a project management SaaS tool, audience is startup founders"

Claude: "Perfect — startup-friendly vibe. A couple more things:
  Do you have a voiceover recorded, or will this be visual-only?
  And how long are you thinking?"

User: "I have a voiceover with timestamps, about 45 seconds. Also have screenshots"

Claude: "Awesome — since you have narration with timestamps, the video will
  sync automatically to your audio. We'll build scenes around each narration segment.
  What visual style? Clean and minimal? Bold and energetic?"

User: "Clean minimal, dark background"

Claude: "Here's the plan:
  - 45-second narration-driven video
  - 1920x1080 landscape
  - Dark minimal theme (#0f0f23 background, white text, blue accents)
  - Scenes synced to your 15 narration segments
  - Your screenshots integrated at relevant moments
  Ready to set up the project?"

User: "Yes!"

Claude: [calls init_project]
→ "Project created at ./product-explainer/
   Drop your files in:
   - assets/audio/ → voiceover.mp3 + voiceover.json
   - assets/images/ → your screenshots
   Tell me when they're in!"

User: "Done, files are in"

Claude: [calls scan_assets]
→ "Found:
   - voiceover.mp3 (44.8s, 15 segments)
   - 6 screenshots (dashboard, task-view, timeline, team-page, integrations, pricing)

   Here's my scene plan:
   1. Intro title card (seg 1-2): 'TaskFlow — Project Management Reimagined'
   2. Problem statement (seg 3-4): Text animation about startup chaos
   3. Dashboard showcase (seg 5-7): Your dashboard screenshot with callouts
   4. Features montage (seg 8-12): Cycle through task-view, timeline, team, integrations
   5. Pricing (seg 13-14): Your pricing screenshot
   6. Outro CTA (seg 15): 'Start free at taskflow.io'
   
   Should I build this?"

User: "Yes, go for it"

Claude: [calls create_scene × 6]
        [calls start_preview]
→ "All 6 scenes created! Preview is live at http://localhost:3000
   Check it out and let me know what to adjust."

User: "Scene 3 feels too fast, and the dashboard image is too small"

Claude: [calls update_scene for scene-003]
→ "Extended scene 3 by 2 seconds and scaled the dashboard to 80% width.
   Check the preview — it should update automatically."
```

### Example 2: Background Music Social Ad

```
User: "Make a 15-second Instagram reel for my coffee shop"

Claude: [calls start_session]
→ "Fun! Do you have photos of your coffee shop? And any specific music or vibe?"

User: "Yeah I have 4 photos. Just put some lofi music behind it"

Claude: "Got it — here's the plan:
  - 15-sec vertical video (1080x1920 for Reels)
  - Lofi background music on loop
  - 4 scenes cycling through your photos with text overlays
  - Warm, cozy color palette
  Sound good?"

User: "Perfect"

Claude: [calls init_project with 1080x1920, background audio, 15sec]
→ "Set up! Drop your photos in assets/images/ and your lofi track in assets/audio/"

...continues similarly...
```

---

## IMPLEMENTATION PRIORITIES & BUILD ORDER

Build the project in this order. Each phase should be fully working before moving to the next.

### Phase 1: MCP Server Foundation
1. Set up the Node.js MCP server with `@modelcontextprotocol/server`
2. Implement `start_session` tool (returns the onboarding questionnaire)
3. Implement `init_project` tool (scaffolds a real Remotion project that compiles)
4. Implement `list_scenes` tool
5. Test: Claude can have the onboarding conversation and create a project

### Phase 2: Scene Management
6. Build the Remotion template components (TitleCard, TextScene, ImageScene first)
7. Build the AnimatedObject generic renderer
8. Build SceneRenderer.tsx and Root.tsx
9. Implement `create_scene` tool
10. Implement `update_scene` tool
11. Implement `delete_scene` and `reorder_scenes` tools
12. Test: Claude can create and modify scenes, Remotion project compiles

### Phase 3: Assets & Audio
13. Implement `scan_assets` tool with image metadata reading
14. Implement audio timestamp parsing (the voiceover.json format)
15. Wire up audio-driven scene duration calculation
16. Wire up `<Audio>` component in Root.tsx for both narration and background music
17. Test: Narration-driven video syncs correctly to audio timestamps

### Phase 4: Preview & Render
18. Implement `start_preview` (launches `npx remotion studio`)
19. Implement `stop_preview` (kills the dev server process)
20. Implement `capture_frame` (uses `npx remotion still`)
21. Implement `render_video` (uses `npx remotion render`)
22. Test: Full end-to-end flow — onboard → create → preview → iterate → render

### Phase 5: Polish
23. Add transition support between scenes
24. Add KineticTypography and CodeBlock templates
25. Add word-level audio sync for typewriter/word-by-word animations
26. Error handling and validation across all tools
27. Test: Complex multi-scene video with narration sync, transitions, and multiple template types

---

## CONFIGURATION

### MCP Server Config (for Claude CLI / claude_desktop_config.json)

```json
{
  "mcpServers": {
    "remotion-video": {
      "command": "node",
      "args": ["/path/to/remotion-video-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

### Key Dependencies for MCP Server package.json

```json
{
  "dependencies": {
    "@modelcontextprotocol/server": "latest",
    "glob": "^10.0.0",
    "fs-extra": "^11.0.0",
    "execa": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/fs-extra": "^11.0.0"
  }
}
```

### Key Dependencies for Scaffolded Remotion Project package.json

```json
{
  "dependencies": {
    "@remotion/cli": "4.0.0",
    "@remotion/player": "4.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "remotion": "4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0"
  }
}
```

---

## IMPORTANT DESIGN DECISIONS

1. **composition.json is the single source of truth**. Scene files are generated FROM it, not the other way around. When Claude calls `update_scene`, the tool updates composition.json first, then regenerates the .tsx file.

2. **Full replacement, not diffs**. When updating a scene, Claude sends the complete scene definition. The tool replaces the entire scene entry in composition.json and regenerates the file. This is simpler and more reliable than diffing.

3. **Template components are pre-built, not AI-generated**. Claude doesn't write React code on each turn. It selects a template and passes props/data. The `custom` scene type with `objects` array is the escape hatch for maximum flexibility.

4. **Audio is the timeline master** for narration-driven videos. Scene durations and startFrames are calculated from audio timestamps, not the other way around.

5. **Hot reload is free**. Remotion Studio watches for file changes. When the MCP tool writes a new scene file, the browser preview updates automatically. No WebSocket or custom sync needed.

6. **Each scene is a separate file** for modularity. Claude reads/writes one small file per edit, not the entire project. This reduces errors and enables targeted iteration.

7. **The MCP server manages state in memory AND on disk**. composition.json on disk is the persistent state. The server reads it on each tool call (stateless between calls). No in-memory state that could desync.

---

## ERROR HANDLING

Every tool should handle these cases:
- Project doesn't exist at the specified path
- composition.json is missing or malformed
- Scene ID doesn't exist (for update/delete)
- Remotion project won't compile (syntax errors in generated files)
- Dev server fails to start (port in use, missing dependencies)
- Render fails (out of memory, missing assets)
- Asset files referenced but not found
- Audio timestamp file doesn't match expected schema

Return clear error messages that Claude can relay to the user with suggested fixes.

---

## NOTES FOR BUILDING

- Use the official MCP SDK documentation at https://modelcontextprotocol.io for server implementation patterns
- Use Remotion v4 docs at https://remotion.dev for component APIs, rendering, and Studio
- The `execa` library is recommended for managing child processes (dev server, render)
- Test each tool independently before wiring them together
- Start with the simplest scene type (TitleCard) and get the full flow working end-to-end before adding complexity
- The composition.json schema can evolve — start minimal and add fields as needed

---

This document is the complete specification. Build iteratively following the phase order. Each phase should be tested before proceeding to the next. When in doubt, keep it simple — complexity can be added later.
