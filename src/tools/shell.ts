/**
 * Shell/Command Tools
 *
 * Execute shell commands on the user's machine with safety guardrails.
 * Search tools (grep, findFiles) use native Node.js for performance.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import fg from 'fast-glob';
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

// Scaffolding commands that create new projects - need extra long timeouts (10 min)
// These download templates, install deps, and can take several minutes
const SCAFFOLDING_PATTERNS = [
  /^npx\s+(--yes\s+)?create-/,           // npx create-react-app, npx create-next-app
  /^npx\s+(--yes\s+)?@\w+\/create-/,     // npx @vue/create-app, etc.
  /^bunx\s+create-/,                      // bunx create-react-app
  /^pnpm\s+(dlx\s+)?create-/,            // pnpm create vite
  /^npm\s+create\s+/,                     // npm create vite@latest
  /^yarn\s+create\s+/,                    // yarn create react-app
  /^npx\s+degit/,                         // npx degit for templates
  /^npx\s+(--yes\s+)?(vite|astro|nuxt|remix|svelte)/,  // Direct scaffolding
];

// Commands that are typically long-running (3 min timeout)
const LONG_RUNNING_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(build|test|run)/,
  /webpack|vite|esbuild|rollup/,
  /docker\s+(build|pull|push)/,
  /^npx\s+/,  // Most npx commands need more time than 30s default
];

/**
 * Determine appropriate timeout based on command type
 */
function getSmartTimeout(command: string, explicitTimeout?: number): number {
  // If user specified a timeout, use it
  if (explicitTimeout !== undefined) {
    return explicitTimeout;
  }

  // Scaffolding commands get 10 minutes (they download templates AND install deps)
  for (const pattern of SCAFFOLDING_PATTERNS) {
    if (pattern.test(command)) {
      return 600000; // 10 minutes
    }
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
 * Output mode for grep results (Claude Code pattern)
 */
export type GrepOutputMode = 'files_only' | 'content' | 'count';

// Directories to ignore when searching (Claude Code pattern)
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'coverage', '.cache'];

// Binary extensions to skip
const BINARY_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.mov', '.avi'];

/**
 * Search for text in files using NATIVE Node.js (Claude Code pattern)
 * No shell commands - pure JavaScript for speed and reliability
 */
export async function grep(
  pattern: string,
  searchPath: string,
  options: {
    ignoreCase?: boolean;
    contextLines?: number;
    outputMode?: GrepOutputMode;
    limit?: number;
    glob?: string;
  } = {}
): Promise<LocalToolResult> {
  const {
    ignoreCase = false,
    outputMode = 'files_only',
    limit = 100,
  } = options;

  try {
    // Create regex from pattern
    const flags = ignoreCase ? 'gi' : 'g';
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return { success: false, error: `Invalid regex pattern: ${pattern}` };
    }

    const resolvedPath = path.resolve(searchPath);
    const stats = await fs.stat(resolvedPath).catch(() => null);
    if (!stats) {
      return { success: false, error: `Path not found: ${searchPath}` };
    }

    // Single file search
    if (stats.isFile()) {
      const hasMatch = await fileHasMatch(resolvedPath, regex);
      if (hasMatch) {
        if (outputMode === 'files_only') {
          return { success: true, data: { matches: [searchPath], pattern, path: searchPath, outputMode, totalMatches: 1 } };
        }
        const content = await fs.readFile(resolvedPath, 'utf-8');
        const lines = content.split('\n');
        const matches: string[] = [];
        lines.forEach((line, i) => {
          regex.lastIndex = 0;
          if (regex.test(line)) {
            matches.push(`${i + 1}:${line}`);
          }
        });
        return { success: true, data: { matches: matches.slice(0, limit), pattern, path: searchPath, outputMode, totalMatches: matches.length } };
      }
      return { success: true, data: { matches: [], pattern, path: searchPath, outputMode, totalMatches: 0 } };
    }

    // Directory search using fast-glob
    const globPattern = options.glob
      ? path.join(resolvedPath, '**', options.glob)
      : path.join(resolvedPath, '**', '*');

    const files = await fg(globPattern, {
      ignore: IGNORED_DIRS.map(d => `**/${d}/**`),
      onlyFiles: true,
      followSymbolicLinks: false,
      suppressErrors: true,
      absolute: true,
    });

    const matches: string[] = [];
    const counts: Map<string, number> = new Map();
    let totalMatches = 0;

    for (const file of files) {
      if (matches.length >= limit && outputMode !== 'count') break;

      const ext = path.extname(file).toLowerCase();
      if (BINARY_EXTS.includes(ext)) continue;

      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        const relativePath = path.relative(process.cwd(), file);
        let fileMatchCount = 0;

        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            fileMatchCount++;
            if (outputMode === 'content' && matches.length < limit) {
              matches.push(`${relativePath}:${i + 1}:${lines[i]}`);
            }
          }
        }

        if (fileMatchCount > 0) {
          if (outputMode === 'files_only' && matches.length < limit) {
            matches.push(relativePath);
          }
          if (outputMode === 'count') {
            counts.set(relativePath, fileMatchCount);
          }
          totalMatches += outputMode === 'files_only' ? 1 : fileMatchCount;
        }
      } catch {
        // Skip files that can't be read
      }
    }

    const finalMatches = outputMode === 'count'
      ? Array.from(counts.entries()).map(([f, c]) => `${f}:${c}`)
      : matches;

    return {
      success: true,
      data: {
        matches: finalMatches.slice(0, limit),
        pattern,
        path: searchPath,
        outputMode,
        totalMatches,
        truncated: finalMatches.length > limit,
      },
    };
  } catch (error) {
    return { success: false, error: `Search failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Quick check if a file contains a pattern match
 */
async function fileHasMatch(filePath: string, regex: RegExp): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    regex.lastIndex = 0;
    return regex.test(content);
  } catch {
    return false;
  }
}

/**
 * Find files by name pattern using NATIVE Node.js glob (Claude Code pattern)
 */
export async function findFiles(
  pattern: string,
  directory: string = '.'
): Promise<LocalToolResult> {
  try {
    const resolvedDir = path.resolve(directory);

    // Convert simple wildcard pattern to glob pattern
    // e.g., "*agent*" -> "**/*agent*"
    const globPattern = pattern.includes('/') || pattern.includes('**')
      ? pattern
      : `**/${pattern}`;

    const fullPattern = path.join(resolvedDir, globPattern);

    const files = await fg(fullPattern, {
      ignore: IGNORED_DIRS.map(d => `**/${d}/**`),
      onlyFiles: true,
      followSymbolicLinks: false,
      suppressErrors: true,
      dot: false,
    });

    // Return relative paths, limited to 100
    const relativePaths = files
      .map(f => path.relative(process.cwd(), f))
      .slice(0, 100);

    return {
      success: true,
      data: {
        files: relativePaths,
        pattern,
        directory,
        totalFound: files.length,
        truncated: files.length > 100,
      },
    };
  } catch (error) {
    return { success: false, error: `Find failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Tool definitions for Claude
 */
export const shellTools: Tool[] = [
  {
    name: 'run_command',
    description: `Execute a shell command on the local machine. Returns stdout, stderr, and exit code. 

SMART TIMEOUTS (auto-detected):
- 10 min: npx create-react-app, npm create vite, etc (scaffolding)
- 5 min: npm install, yarn add, pip install (package installs)
- 3 min: npm build, webpack, docker build (build commands)
- 30 sec: all other commands

BEST PRACTICES:
- For dev servers (npm start, npm run dev), use start_background_process instead
- After creating a project, use list_dir to verify the files were created
- Add --yes to npx commands to skip prompts (e.g., "npx --yes create-react-app myapp")
- Compound commands (&&, ||, |) are supported`,
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
          description: 'Optional: Override timeout in milliseconds. Usually not needed - smart defaults handle most cases.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'glob',
    description: `Fast file pattern matching - find files by NAME/PATH pattern.

USE THIS WHEN:
- Looking for files by name: "*.ts", "package.json", "**/*.test.js"
- Finding files in specific directories: "src/**/*.tsx"
- Locating config files, specific file types, etc.

DO NOT USE FOR:
- Searching file CONTENTS (use grep instead)

Examples:
- glob("*.ts") → finds all TypeScript files
- glob("**/package.json") → finds all package.json files
- glob("src/**/*.test.ts") → finds all test files in src

Returns file paths only (not content). Use read_file to see contents.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern: *.ts, **/*.json, src/**/*.tsx, etc.',
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
    name: 'grep',
    description: `Search file CONTENTS for text/regex patterns.

USE THIS WHEN:
- Searching for code: function names, imports, variable usage
- Finding text in files: error messages, TODOs, specific strings
- Locating where something is defined or used

DO NOT USE FOR:
- Finding files by name (use glob instead)

OUTPUT MODES:
- files_only (default): Just file paths - use this FIRST
- content: Matching lines with line numbers
- count: Match count per file

BEST PRACTICE:
1. grep with files_only → see which files match
2. read_file on specific file → see the context
3. Only use content mode if you need inline matches

Automatically ignores: node_modules, .git, dist, build`,
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for in file contents',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in (default: current directory)',
        },
        output_mode: {
          type: 'string',
          enum: ['files_only', 'content', 'count'],
          description: 'files_only (default), content (lines), or count',
        },
        ignore_case: {
          type: 'boolean',
          description: 'Case-insensitive search (default: false)',
        },
        glob: {
          type: 'string',
          description: 'Filter to specific file types: "*.ts", "*.py", etc.',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 100)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'start_background_process',
    description: `Start a long-running process in the background. Returns immediately with a process ID.

USE THIS FOR (runs indefinitely):
- Dev servers: npm start, npm run dev, yarn dev
- Watch modes: npm run watch, tsc --watch
- Local servers: python -m http.server, serve -s build
- Database servers: mongod, redis-server

DO NOT USE FOR (use run_command instead):
- One-time installs: npm install, pip install
- Project scaffolding: npx create-react-app
- Build commands: npm run build

Returns a process ID to use with stop_process and get_process_output.`,
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
      return grep(args.pattern as string, args.path as string || '.', {
        ignoreCase: args.ignore_case as boolean | undefined,
        contextLines: args.context_lines as number | undefined,
        outputMode: args.output_mode as GrepOutputMode | undefined,
        limit: args.limit as number | undefined,
        glob: args.glob as string | undefined,
      });
    case 'glob':
    case 'find_files':  // Backwards compatibility
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

