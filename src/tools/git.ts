/**
 * Git Tools
 * 
 * Git operations for version control.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { LocalToolResult } from './filesystem.js';

const execPromise = promisify(exec);

/**
 * Execute a git command
 */
async function gitExec(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return execPromise(`git ${command}`, {
    cwd: cwd || process.cwd(),
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Get git status
 */
export async function gitStatus(cwd?: string): Promise<LocalToolResult> {
  try {
    const { stdout } = await gitExec('status --porcelain', cwd);
    const { stdout: branch } = await gitExec('branch --show-current', cwd);

    const files = stdout.trim().split('\n').filter(Boolean).map(line => {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      return { status: status.trim(), file };
    });

    return {
      success: true,
      data: {
        branch: branch.trim(),
        files,
        clean: files.length === 0,
      },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Git status failed: ${execError.message}` };
  }
}

/**
 * Get git diff
 */
export async function gitDiff(options?: { staged?: boolean; file?: string }, cwd?: string): Promise<LocalToolResult> {
  try {
    const args = ['diff'];
    if (options?.staged) args.push('--staged');
    if (options?.file) args.push(options.file);

    const { stdout } = await gitExec(args.join(' '), cwd);

    return {
      success: true,
      data: {
        diff: stdout,
        hasChanges: stdout.trim().length > 0,
      },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Git diff failed: ${execError.message}` };
  }
}

/**
 * Git add files
 */
export async function gitAdd(files: string | string[], cwd?: string): Promise<LocalToolResult> {
  try {
    const fileList = Array.isArray(files) ? files.join(' ') : files;
    await gitExec(`add ${fileList}`, cwd);

    return {
      success: true,
      data: { added: Array.isArray(files) ? files : [files] },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Git add failed: ${execError.message}` };
  }
}

/**
 * Git commit
 */
export async function gitCommit(message: string, cwd?: string): Promise<LocalToolResult> {
  try {
    const { stdout } = await gitExec(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);

    // Parse commit hash from output
    const match = stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
    const hash = match ? match[1] : undefined;

    return {
      success: true,
      data: {
        message,
        hash,
        output: stdout.trim(),
      },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Git commit failed: ${execError.message}` };
  }
}

/**
 * Git log
 */
export async function gitLog(options?: { count?: number; oneline?: boolean }, cwd?: string): Promise<LocalToolResult> {
  try {
    const args = ['log'];
    if (options?.count) args.push(`-${options.count}`);
    if (options?.oneline) args.push('--oneline');

    const { stdout } = await gitExec(args.join(' '), cwd);

    const commits = stdout.trim().split('\n').filter(Boolean);

    return {
      success: true,
      data: { commits },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Git log failed: ${execError.message}` };
  }
}

/**
 * Git checkout
 */
export async function gitCheckout(target: string, options?: { create?: boolean }, cwd?: string): Promise<LocalToolResult> {
  try {
    const args = ['checkout'];
    if (options?.create) args.push('-b');
    args.push(target);

    const { stdout, stderr } = await gitExec(args.join(' '), cwd);

    return {
      success: true,
      data: {
        target,
        created: options?.create || false,
        output: (stdout || stderr).trim(),
      },
    };
  } catch (error: unknown) {
    const execError = error as { message?: string };
    return { success: false, error: `Git checkout failed: ${execError.message}` };
  }
}

/**
 * Tool definitions for Claude
 */
export const gitTools: Tool[] = [
  {
    name: 'git_status',
    description: 'Get the current git status including branch name, modified files, and staged changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cwd: {
          type: 'string',
          description: 'Optional: Working directory (defaults to current)',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_diff',
    description: 'Show git diff of changes. Can show staged or unstaged changes, and optionally for a specific file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        staged: {
          type: 'boolean',
          description: 'Show staged changes only (default: false, shows unstaged)',
        },
        file: {
          type: 'string',
          description: 'Optional: Show diff for a specific file only',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_add',
    description: 'Stage files for commit. Can stage specific files or use "." to stage all.',
    input_schema: {
      type: 'object' as const,
      properties: {
        files: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
          description: 'File(s) to stage. Use "." for all files.',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory',
        },
      },
      required: ['files'],
    },
  },
  {
    name: 'git_commit',
    description: 'Create a git commit with the staged changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'The commit message',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'git_log',
    description: 'Show recent git commits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        count: {
          type: 'number',
          description: 'Number of commits to show (default: 10)',
        },
        oneline: {
          type: 'boolean',
          description: 'Show compact one-line format (default: false)',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory',
        },
      },
      required: [],
    },
  },
  {
    name: 'git_checkout',
    description: 'Switch branches or restore files. Can create a new branch with the create option.',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Branch name or commit to checkout',
        },
        create: {
          type: 'boolean',
          description: 'Create a new branch (default: false)',
        },
        cwd: {
          type: 'string',
          description: 'Optional: Working directory',
        },
      },
      required: ['target'],
    },
  },
];

/**
 * Execute a git tool
 */
export async function executeGitTool(name: string, args: Record<string, unknown>): Promise<LocalToolResult> {
  const cwd = args.cwd as string | undefined;

  switch (name) {
    case 'git_status':
      return gitStatus(cwd);
    case 'git_diff':
      return gitDiff({
        staged: args.staged as boolean | undefined,
        file: args.file as string | undefined,
      }, cwd);
    case 'git_add':
      return gitAdd(args.files as string | string[], cwd);
    case 'git_commit':
      return gitCommit(args.message as string, cwd);
    case 'git_log':
      return gitLog({
        count: args.count as number | undefined,
        oneline: args.oneline as boolean | undefined,
      }, cwd);
    case 'git_checkout':
      return gitCheckout(args.target as string, {
        create: args.create as boolean | undefined,
      }, cwd);
    default:
      return { success: false, error: `Unknown git tool: ${name}` };
  }
}





