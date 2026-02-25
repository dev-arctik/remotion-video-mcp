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
- **Custom animations** — object-level animation system with spring physics and easing

## MCP Tools

| Tool | Description |
|------|-------------|
| `start_session` | Onboarding questionnaire — always called first |
| `init_project` | Scaffold a new Remotion project |
| `scan_assets` | Scan and analyze images, audio, and fonts in the assets folder |
| `create_scene` | Create a new scene file with template or custom animations |
| `update_scene` | Modify an existing scene's props, animations, or duration |
| `delete_scene` | Remove a scene from the project |
| `reorder_scenes` | Change the order of scenes in the composition |
| `list_scenes` | List all scenes with their current state |
| `update_composition` | Update global settings (style, audio, dimensions) |
| `start_preview` | Launch Remotion Studio dev server |
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
4. Claude scaffolds the project and you drop assets into the `assets/` folder
5. Claude creates scenes, you preview in the browser, iterate, and render

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
