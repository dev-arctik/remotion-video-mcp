import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupServer } from './server.js';
import { stopAllProcesses } from './utils/process-manager.js';

async function main() {
  const server = new McpServer({
    name: 'remotion-video-mcp',
    version: '1.0.0',
  });

  // Register all tools onto the server instance
  setupServer(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Kill all child processes (Remotion studio, renders) on server exit
  process.on('SIGINT', async () => {
    await stopAllProcesses();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopAllProcesses();
    process.exit(0);
  });
}

main().catch((err) => {
  // Write errors to stderr — stdout is reserved for MCP protocol JSON
  console.error('Server startup error:', err);
  process.exit(1);
});
