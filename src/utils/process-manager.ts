import { execa } from 'execa';
import type { ResultPromise } from 'execa';

// Running preview processes, keyed by project path
const runningProcesses = new Map<string, ResultPromise>();

export async function startProcess(
  projectPath: string,
  command: string,
  args: string[]
): Promise<{ pid: number }> {
  if (runningProcesses.has(projectPath)) {
    throw new Error(`A preview server is already running for ${projectPath}. Call stop_preview first.`);
  }

  // Child process — killed when server exits
  const proc = execa(command, args, {
    cwd: projectPath,
    stdio: 'pipe',
    detached: false,
  });

  // Clean up map entry if the process dies unexpectedly
  proc.on('exit', () => {
    runningProcesses.delete(projectPath);
  });

  // Store immediately — don't await (it runs indefinitely)
  runningProcesses.set(projectPath, proc);

  // Wait for stdout to confirm readiness, or fall back to a 3s timeout
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 3000);
    proc.stdout?.on('data', (data: Buffer) => {
      // Remotion Studio prints a URL when ready
      if (data.toString().includes('http://')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  if (!proc.pid) {
    runningProcesses.delete(projectPath);
    throw new Error('Process failed to start — no PID assigned.');
  }

  return { pid: proc.pid };
}

export async function stopProcess(projectPath: string): Promise<void> {
  const proc = runningProcesses.get(projectPath);
  if (!proc) {
    throw new Error(`No running process found for ${projectPath}.`);
  }
  proc.kill('SIGTERM');
  // Wait for exit (up to 5s) to avoid port conflicts on restart
  await Promise.race([proc.catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
  runningProcesses.delete(projectPath);
}

// Kill all running preview servers — called on MCP server shutdown
export async function stopAllProcesses(): Promise<void> {
  const entries = [...runningProcesses.entries()];
  for (const [projectPath, proc] of entries) {
    proc.kill('SIGTERM');
    await Promise.race([proc.catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
    runningProcesses.delete(projectPath);
  }
}

export function isRunning(projectPath: string): boolean {
  return runningProcesses.has(projectPath);
}
