/**
 * Shell/Command Tools
 * 
 * Execute shell commands on the user's machine with safety guardrails.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { LocalToolResult } from './filesystem.js';
import { processManager } from './process-manager.js';

const execPromise = promisify(exec);

// Commands that are always blocked
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'mkfs',
  'dd if=/dev/zero',
  ':(){:|:&};:',  // Fork bomb
  'chmod -R 777 /',
  'chown -R',
];

// Patterns that require confirmation (would be blocked in non-interactive mode)
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+/,
  /sudo\s+/,
  />\s*\/dev\//,
  /chmod\s+.*\s+\//,
];

export interface ShellOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
  allowDangerous?: boolean;
}

// Package manager commands that need longer timeouts
const PACKAGE_MANAGER_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(install|i|add|ci|update|upgrade)/,
  /^(pip|pip3)\s+install/,
  /^cargo\s+(build|install)/,
  /^go\s+(build|get|mod)/,
];

// Commands that are typically long-running
const LONG_RUNNING_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(build|test|run)/,
  /webpack|vite|esbuild|rollup/,
  /docker\s+(build|pull|push)/,
];

/**
 * Determine appropriate timeout based on command type
 */
function getSmartTimeout(command: string, explicitTimeout?: number): number {
  // If user specified a timeout, use it
  if (explicitTimeout !== undefined) {
    return explicitTimeout;
  }

  // Package managers get 5 minutes
  for (const pattern of PACKAGE_MANAGER_PATTERNS) {
    if (pattern.test(command)) {
      return 300000; // 5 minutes
    }
  }

  // Long-running builds get 3 minutes
  for (const pattern of LONG_RUNNING_PATTERNS) {
    if (pattern.test(command)) {
      return 180000; // 3 minutes
    }
  }

  // Default: 30 seconds
  return 30000;
}

/**
 * Check if a command is blocked or dangerous
 */
function checkCommand(command: string): { allowed: boolean; reason?: string } {
  // Check blocked commands
  for (const blocked of BLOCKED_COMMANDS) {
    if (command.includes(blocked)) {
      return { allowed: false, reason: `Blocked command pattern: ${blocked}` };
    }
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Dangerous command pattern detected. Use allowDangerous option to override.` };
    }
  }

  return { allowed: true };
}

/**
 * Run a shell command
 */
export async function runCommand(
  command: string,
  options: ShellOptions = {}
): Promise<LocalToolResult> {
  const {
    cwd = process.cwd(),
    timeout: explicitTimeout,
    maxBuffer = 10 * 1024 * 1024, // 10MB
    allowDangerous = false,
  } = options;

  // Smart timeout based on command type
  const timeout = getSmartTimeout(command, explicitTimeout);

  // Safety check
  if (!allowDangerous) {
    const check = checkCommand(command);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }
  }

  try {
    // Use explicit bash shell for proper handling of compound commands (&&, ||, |)
    const { stdout, stderr } = await execPromise(command, {
      cwd,
      timeout,
      maxBuffer,
      shell: '/bin/bash',  // Explicit bash for compound command support
      env: { ...process.env },
    });

    return {
      success: true,
      data: {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command,
        cwd,
        timeoutUsed: timeout,
      },
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number; message?: string; killed?: boolean };
    
    // Check if it was a timeout
    if (execError.killed) {
      return {
        success: false,
        error: `Command timed out after ${timeout / 1000}s. For long-running commands, use start_background_process or increase timeout.`,
        data: {
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          timedOut: true,
        },
      };
    }

    return {
      success: false,
      error: execError.message || 'Command failed',
      data: {
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        exitCode: execError.code,
      },
    };
  }
}

/**
 * Search for text in files using grep/ripgrep
 */
export async function grep(
  pattern: string,
  path: string,
  options: { ignoreCase?: boolean; contextLines?: number } = {}
): Promise<LocalToolResult> {
  const { ignoreCase = false, contextLines = 0 } = options;

  // Try ripgrep first, fall back to grep
  const rgArgs = [
    pattern,
    path,
    '--no-heading',
    '--line-number',
    '--color=never',
  ];

  if (ignoreCase) rgArgs.push('-i');
  if (contextLines > 0) rgArgs.push(`-C${contextLines}`);

  try {
    const { stdout } = await execPromise(`rg ${rgArgs.join(' ')}`, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      success: true,
      data: {
        matches: stdout.trim().split('\n').filter(Boolean),
        pattern,
        path,
      },
    };
  } catch {
    // Try grep as fallback
    try {
      const grepArgs = [
        ignoreCase ? '-i' : '',
        contextLines > 0 ? `-C${contextLines}` : '',
        '-rn',
        pattern,
        path,
      ].filter(Boolean);

      const { stdout } = await execPromise(`grep ${grepArgs.join(' ')}`, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: true,
        data: {
          matches: stdout.trim().split('\n').filter(Boolean),
          pattern,
          path,
        },
      };
    } catch (error: unknown) {
      const execError = error as { code?: number; message?: string };
      // grep returns exit code 1 if no matches (not an error)
      if (execError.code === 1) {
        return { success: true, data: { matches: [], pattern, path } };
      }
      return { success: false, error: `Search failed: ${execError.message}` };
    }
  }
}

/**
 * Find files by name pattern using glob
 */
export async function findFiles(
  pattern: string,
  directory: string = '.'
): Promise<LocalToolResult> {
  try {
    // Use find command with name pattern
    const { stdout } = await execPromise(
      `find "${directory}" -name "${pattern}" -type f 2>/dev/null | head -100`,
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );

    return {
      success: true,
      data: {
        files: stdout.trim().split('\n').filter(Boolean),
        pattern,
        directory,
      },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Find failed: ${execError.message}` };
  }
}

/**
 * Tool definitions for Claude
 */
export const shellTools: Tool[] = [
  {
    name: 'run_command',
    description: 'Execute a shell command on the local machine. Returns stdout, stderr, and exit code. Some dangerous commands are blocked for safety. Supports compound commands (&&, ||). Smart timeout: 5 min for npm/yarn install, 3 min for builds, 30s default. For dev servers or long-running processes, use start_background_process instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute. Compound commands with && and || are supported.',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory for the command (defaults to current directory)',
        },
        timeout: {
          type: 'number',
          description: 'Optional: Timeout in milliseconds. Smart defaults: 300000 for npm install, 180000 for builds, 30000 for quick commands.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'grep',
    description: 'Search for a text pattern in files. Uses ripgrep if available, falls back to grep. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'The file or directory to search in',
        },
        ignore_case: {
          type: 'boolean',
          description: 'Optional: Case-insensitive search (default: false)',
        },
        context_lines: {
          type: 'number',
          description: 'Optional: Number of context lines before and after matches',
        },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'find_files',
    description: 'Find files by name pattern (glob). Returns up to 100 matching file paths.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match (e.g., "*.ts", "package.json")',
        },
        directory: {
          type: 'string',
          description: 'Optional: Directory to search in (default: current directory)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'start_background_process',
    description: 'Start a long-running process (like a dev server) in the background. The process runs independently and its output is captured. Returns a process ID that can be used to stop it later. Use this for: npm start, npm run dev, python servers, watch mode commands, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The command to run (e.g., "npm start", "python -m http.server 8000")',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory for the process',
        },
        name: {
          type: 'string',
          description: 'Optional: Friendly name for the process (e.g., "React Dev Server")',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'stop_process',
    description: 'Stop a background process by its process ID. Use list_processes to see running processes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        process_id: {
          type: 'number',
          description: 'The process ID returned by start_background_process',
        },
      },
      required: ['process_id'],
    },
  },
  {
    name: 'list_processes',
    description: 'List all background processes started by this session, including their status and recent output.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_process_output',
    description: 'Get recent output from a background process.',
    input_schema: {
      type: 'object' as const,
      properties: {
        process_id: {
          type: 'number',
          description: 'The process ID',
        },
        lines: {
          type: 'number',
          description: 'Number of output lines to retrieve (default: 20)',
        },
      },
      required: ['process_id'],
    },
  },
];

/**
 * Start a background process
 */
export function startBackgroundProcess(
  command: string,
  options: { cwd?: string; name?: string } = {}
): LocalToolResult {
  try {
    const processInfo = processManager.spawn(command, {
      cwd: options.cwd,
      name: options.name,
    });

    return {
      success: true,
      data: {
        processId: processInfo.id,
        pid: processInfo.pid,
        name: processInfo.name,
        command: processInfo.command,
        message: `Started background process "${processInfo.name}" (ID: ${processInfo.id}, PID: ${processInfo.pid}). Use stop_process with ID ${processInfo.id} to stop it.`,
      },
    };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: `Failed to start background process: ${err.message}` };
  }
}

/**
 * Stop a background process
 */
export function stopProcess(processId: number): LocalToolResult {
  const process = processManager.get(processId);
  if (!process) {
    return { success: false, error: `Process with ID ${processId} not found` };
  }

  const killed = processManager.kill(processId);
  if (killed) {
    return {
      success: true,
      data: {
        processId,
        name: process.name,
        message: `Stopped process "${process.name}" (ID: ${processId})`,
      },
    };
  } else {
    return { success: false, error: `Failed to stop process ${processId}` };
  }
}

/**
 * List all background processes
 */
export function listProcesses(): LocalToolResult {
  const processes = processManager.list();
  const running = processes.filter(p => p.status === 'running');
  const stopped = processes.filter(p => p.status !== 'running');

  return {
    success: true,
    data: {
      running: running.map(p => ({
        id: p.id,
        pid: p.pid,
        name: p.name,
        command: p.command,
        startedAt: p.startedAt.toISOString(),
        uptime: Math.round((Date.now() - p.startedAt.getTime()) / 1000) + 's',
      })),
      stopped: stopped.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
      })),
      summary: `${running.length} running, ${stopped.length} stopped`,
    },
  };
}

/**
 * Get output from a background process
 */
export function getProcessOutput(processId: number, lines: number = 20): LocalToolResult {
  const process = processManager.get(processId);
  if (!process) {
    return { success: false, error: `Process with ID ${processId} not found` };
  }

  const output = processManager.getOutput(processId, lines);
  return {
    success: true,
    data: {
      processId,
      name: process.name,
      status: process.status,
      output: output,
      lineCount: output.length,
    },
  };
}

/**
 * Execute a shell tool
 */
export async function executeShellTool(name: string, args: Record<string, unknown>): Promise<LocalToolResult> {
  switch (name) {
    case 'run_command':
      return runCommand(args.command as string, {
        cwd: args.cwd as string | undefined,
        timeout: args.timeout as number | undefined,
      });
    case 'grep':
      return grep(args.pattern as string, args.path as string, {
        ignoreCase: args.ignore_case as boolean | undefined,
        contextLines: args.context_lines as number | undefined,
      });
    case 'find_files':
      return findFiles(args.pattern as string, args.directory as string | undefined);
    case 'start_background_process':
      return startBackgroundProcess(args.command as string, {
        cwd: args.cwd as string | undefined,
        name: args.name as string | undefined,
      });
    case 'stop_process':
      return stopProcess(args.process_id as number);
    case 'list_processes':
      return listProcesses();
    case 'get_process_output':
      return getProcessOutput(args.process_id as number, args.lines as number | undefined);
    default:
      return { success: false, error: `Unknown shell tool: ${name}` };
  }
}

