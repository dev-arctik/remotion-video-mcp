# remotion-video-mcp

An MCP (Model Context Protocol) server that lets Claude create, preview, and render professional videos using [Remotion](https://remotion.dev). Talk to Claude naturally — describe the video you want, provide assets, iterate on scenes — and Claude handles the rest.

## How It Works

```
┌─────────────────┐       MCP Protocol        ┌──────────────────────┐
│  Claude CLI /    │ ◄────────────────────────► │  remotion-video-mcp  │
│  Claude Desktop  │   Tool calls & responses   │    (MCP Server)      │
└─────────────────┘                             └──────────┬───────────┘
                                                           │
                                                           │ File I/O + Process Mgmt
                                                           ▼
                                                ┌──────────────────────┐
                                                │   Remotion Project   │
                                                │   (in user's CWD)   │
                                                └──────────────────────┘
```

Claude acts as the creative brain. The MCP server acts as the bridge to a Remotion project (the rendering canvas). Users describe what they want, Claude uses MCP tools to scaffold, write scenes, sync audio, preview frames, and render the final video.

## Features

- **Conversational onboarding** — guided questionnaire to understand video goals, style, and assets
- **Project scaffolding** — creates a full Remotion project with pre-built template components
- **Scene management** — create, update, delete, and reorder scenes via natural language
- **Audio sync** — narration-driven videos with word-level timestamp synchronization
- **Live preview** — launches Remotion Studio for real-time preview in the browser
- **Frame capture** — render individual frames for quick review without full renders
- **Final render** — produce MP4/WebM output at draft, standard, or high quality
- **Template library** — TitleCard, TextScene, ImageScene, KineticTypography, CodeBlock, and more
- **Template discovery** — `list_templates` returns all templates with props, layouts, and best-use-cases
- **Animation presets** — `entrancePreset` prop for templates: fade-up, fly-from-left, zoom-in, drop-in, etc.
- **Custom animations** — object-level animation system with spring physics and easing
- **Inline component code** — pass raw TSX directly to `create_scene`/`update_scene` for custom scenes
- **Batch scene ops** — create or delete multiple scenes in a single tool call
- **Asset import** — copy uploaded images, audio, and fonts from temp paths; returns audio duration automatically
- **Custom components** — write arbitrary code files (themes, utils, components) beyond the template library
- **Overlay system** — persistent global overlays (logos, watermarks, animations) that survive scene edits
- **Root.tsx recovery** — `regenerate_root` rebuilds Root.tsx from composition.json when things go wrong

## MCP Tools

| Tool | Description |
|------|-------------|
| `start_session` | Onboarding questionnaire — always called first |
| `init_project` | Scaffold a new Remotion project |
| `list_templates` | Discover all 8 templates with props, layouts, presets, and best-use-cases |
| `scan_assets` | Scan and analyze images, audio, and fonts in the assets folder |
| `import_asset` | Copy uploaded files from temp paths into assets; returns audio duration |
| `create_scene` | Create one or more scenes (batch support, componentCode for custom TSX) |
| `update_scene` | Modify a scene's props, animations, duration, or replace code via componentCode |
| `delete_scene` | Remove one or more scenes (batch support via sceneIds or deleteAll) |
| `reorder_scenes` | Change the order of scenes in the composition |
| `list_scenes` | List all scenes and overlays with their current state |
| `update_composition` | Update global settings (style, audio, dimensions) |
| `write_file` | Write custom code files (.tsx, .ts, .css, .json) to the project |
| `read_file` | Read any file from the project for inspection |
| `add_overlay` | Register a component as a persistent global overlay |
| `remove_overlay` | Remove an overlay from the composition |
| `regenerate_root` | Rebuild Root.tsx from composition.json (recovery tool) |
| `start_preview` | Launch Remotion Studio dev server (safe to call as status check) |
| `stop_preview` | Stop the dev server |
| `capture_frame` | Render a single frame as PNG for review |
| `render_video` | Render the final video (MP4/WebM) |

## Audio Modes

| Mode | Input Required | Behavior |
|------|---------------|----------|
| **Narration-driven** | MP3 + timestamp JSON | Video duration auto-calculated from audio. Scenes sync to narration segments. |
| **Background music** | MP3 file | Music loops in background. User specifies video duration independently. |
| **No audio** | Nothing | Silent video. User specifies duration. |

## Tech Stack

- **MCP Server**: Node.js + TypeScript with `@modelcontextprotocol/server` (MCP SDK v2)
- **Video Engine**: Remotion v4 (React-based programmatic video)
- **Runtime**: Node.js 18+
- **Package Manager**: npm

## Prerequisites

- Node.js 18+
- npm
- Claude CLI or Claude Desktop (for MCP integration)

## Installation

```bash
# Clone the repository
git clone https://github.com/dev-arctik/remotion-video-mcp.git
cd remotion-video-mcp

# Install dependencies
npm install

# Build the server
npm run build
```

## Configuration

Add the MCP server to your Claude CLI or Claude Desktop config:

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

## Usage

1. Start a conversation with Claude
2. Say something like *"I want to create a product explainer video"*
3. Claude walks you through the onboarding questions (purpose, duration, audio, style)
4. Claude scaffolds the project — upload images/audio directly in the chat and Claude imports them automatically
5. Claude creates scenes, adds overlays, you preview in the browser, iterate, and render

## Project Structure

```
remotion-video-mcp/
├── src/
│   ├── index.ts                  # MCP server entry point
│   ├── server.ts                 # Server class with tool registration
│   ├── tools/                    # Individual MCP tool implementations
│   ├── state/                    # Project state management
│   ├── templates/                # Remotion component templates
│   └── utils/                    # File ops, process management, audio utils
├── templates/
│   └── project-scaffold/         # Template files for scaffolded projects
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck
```

## License

MIT
