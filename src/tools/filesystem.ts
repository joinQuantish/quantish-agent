/**
 * File System Tools
 *
 * Local tools for reading, writing, and listing files.
 * These run on the user's machine, not via MCP.
 *
 * Implements Claude Code-style patterns:
 * - Default line limits on file reads
 * - Line truncation for long lines
 * - Read-before-write enforcement
 * - Streaming for large files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, createReadStream } from 'fs';
import * as readline from 'readline';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

// Constants for file reading (Claude Code patterns)
const DEFAULT_LINE_LIMIT = 2000;      // Default max lines to read
const MAX_LINE_LENGTH = 2000;         // Truncate lines longer than this
const LARGE_FILE_THRESHOLD = 100000;  // Use streaming for files > 100KB

export interface LocalToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Track files read in this session for read-before-write enforcement
const filesReadInSession = new Set<string>();

/**
 * Mark a file as read in this session
 */
export function markFileAsRead(filePath: string): void {
  filesReadInSession.add(path.resolve(filePath));
}

/**
 * Check if a file has been read in this session
 */
export function hasBeenRead(filePath: string): boolean {
  return filesReadInSession.has(path.resolve(filePath));
}

/**
 * Clear read tracking (for new sessions)
 */
export function clearReadTracking(): void {
  filesReadInSession.clear();
}

/**
 * Read a file from the filesystem with Claude Code-style efficiency:
 * - Default line limit (2000 lines)
 * - Line truncation for long lines
 * - Streaming for large files
 * - Returns metadata about file
 */
export async function readFile(filePath: string, options?: { offset?: number; limit?: number }): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);

    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    // Get file stats
    const stats = await fs.stat(resolvedPath);
    const fileSizeBytes = stats.size;
    const fileSizeKB = Math.round(fileSizeBytes / 1024);

    // Mark file as read for read-before-write tracking
    markFileAsRead(resolvedPath);

    const startLine = options?.offset ?? 0;
    const maxLines = options?.limit ?? DEFAULT_LINE_LIMIT;

    // For large files, use streaming
    if (fileSizeBytes > LARGE_FILE_THRESHOLD) {
      return await readFileStreaming(resolvedPath, startLine, maxLines, fileSizeKB);
    }

    // For smaller files, read all at once then slice
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    // Slice to requested range
    const selectedLines = allLines.slice(startLine, startLine + maxLines);

    // Format with line numbers and truncate long lines
    const numbered = selectedLines.map((line, i) => {
      const lineNum = (startLine + i + 1).toString().padStart(6);
      const truncatedLine = line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH) + '...[truncated]'
        : line;
      return `${lineNum}\t${truncatedLine}`;
    }).join('\n');

    const hasMore = totalLines > startLine + maxLines;

    return {
      success: true,
      data: {
        content: numbered,
        metadata: {
          path: resolvedPath,
          totalLines,
          linesReturned: selectedLines.length,
          startLine,
          hasMore,
          fileSizeKB,
          nextOffset: hasMore ? startLine + maxLines : null,
        },
      },
    };
  } catch (error) {
    return { success: false, error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Stream-based file reading for large files
 */
async function readFileStreaming(
  filePath: string,
  startLine: number,
  maxLines: number,
  fileSizeKB: number
): Promise<LocalToolResult> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    let lineNum = 0;
    let totalLines = 0;

    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      totalLines++;

      if (lineNum >= startLine && lines.length < maxLines) {
        const lineNumStr = (lineNum + 1).toString().padStart(6);
        const truncatedLine = line.length > MAX_LINE_LENGTH
          ? line.slice(0, MAX_LINE_LENGTH) + '...[truncated]'
          : line;
        lines.push(`${lineNumStr}\t${truncatedLine}`);
      }

      lineNum++;

      // Stop reading if we have enough lines and are past what we need
      if (lines.length >= maxLines && lineNum > startLine + maxLines + 1000) {
        rl.close();
      }
    });

    rl.on('close', () => {
      const hasMore = totalLines > startLine + maxLines;

      resolve({
        success: true,
        data: {
          content: lines.join('\n'),
          metadata: {
            path: filePath,
            totalLines: totalLines,
            linesReturned: lines.length,
            startLine,
            hasMore,
            fileSizeKB,
            nextOffset: hasMore ? startLine + maxLines : null,
            streamed: true,
          },
        },
      });
    });

    rl.on('error', (error) => {
      resolve({ success: false, error: `Failed to read file: ${error.message}` });
    });
  });
}

/**
 * Write content to a file
 * Enforces read-before-write for existing files
 */
export async function writeFile(filePath: string, content: string): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);

    // Enforce read-before-write for existing files
    if (existsSync(resolvedPath) && !hasBeenRead(resolvedPath)) {
      return {
        success: false,
        error: `SAFETY CHECK: "${filePath}" already exists. You must use read_file("${filePath}") FIRST, then call write_file again with your content. Do NOT run any bash commands - just call read_file.`
      };
    }

    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(resolvedPath, content, 'utf-8');

    // Mark as read after writing (so subsequent writes don't require re-read)
    markFileAsRead(resolvedPath);

    return { success: true, data: { path: resolvedPath, bytesWritten: Buffer.byteLength(content) } };
  } catch (error) {
    return { success: false, error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * List files in a directory
 */
export async function listDir(dirPath: string, options?: { recursive?: boolean }): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(dirPath);
    
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${dirPath}` };
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    
    const items = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(resolvedPath, entry.name),
    }));

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });

    return { success: true, data: items };
  } catch (error) {
    return { success: false, error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    await fs.unlink(resolvedPath);
    return { success: true, data: { deleted: resolvedPath } };
  } catch (error) {
    return { success: false, error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Check if a file or directory exists
 */
export async function fileExists(filePath: string): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);
    const exists = existsSync(resolvedPath);
    
    if (exists) {
      const stats = await fs.stat(resolvedPath);
      return {
        success: true,
        data: {
          exists: true,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
        },
      };
    }
    
    return { success: true, data: { exists: false } };
  } catch (error) {
    return { success: false, error: `Failed to check file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Get a workspace summary - tree structure of directory with file info
 * Useful after scaffolding to understand what was created
 */
export async function workspaceSummary(
  dirPath: string,
  options?: { maxDepth?: number; maxFiles?: number }
): Promise<LocalToolResult> {
  const maxDepth = options?.maxDepth ?? 3;
  const maxFiles = options?.maxFiles ?? 100;

  try {
    const resolvedPath = path.resolve(dirPath);
    
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${dirPath}` };
    }

    const tree: string[] = [];
    let fileCount = 0;
    let dirCount = 0;
    
    // Directories to skip (common large/generated directories)
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target']);

    async function walkDir(currentPath: string, prefix: string, depth: number): Promise<void> {
      if (depth > maxDepth || fileCount >= maxFiles) return;
      
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
        return a.isDirectory() ? -1 : 1;
      });
      
      for (let i = 0; i < entries.length && fileCount < maxFiles; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = isLast ? prefix + '    ' : prefix + '│   ';
        
        if (entry.isDirectory()) {
          if (skipDirs.has(entry.name)) {
            tree.push(`${prefix}${connector}${entry.name}/ (skipped)`);
          } else {
            dirCount++;
            tree.push(`${prefix}${connector}${entry.name}/`);
            await walkDir(path.join(currentPath, entry.name), newPrefix, depth + 1);
          }
        } else {
          fileCount++;
          const filePath = path.join(currentPath, entry.name);
          const stats = await fs.stat(filePath);
          const size = stats.size < 1024 
            ? `${stats.size}B` 
            : stats.size < 1024 * 1024 
              ? `${Math.round(stats.size / 1024)}KB`
              : `${Math.round(stats.size / (1024 * 1024))}MB`;
          tree.push(`${prefix}${connector}${entry.name} (${size})`);
        }
      }
    }

    tree.push(path.basename(resolvedPath) + '/');
    await walkDir(resolvedPath, '', 1);

    return {
      success: true,
      data: {
        path: resolvedPath,
        tree: tree.join('\n'),
        stats: {
          totalFiles: fileCount,
          totalDirectories: dirCount,
          truncated: fileCount >= maxFiles,
        },
      },
    };
  } catch (error) {
    return { success: false, error: `Failed to summarize workspace: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Edit a file using search/replace
 * This is safer than full overwrite as it only modifies specific parts
 * Enforces read-before-write
 */
export async function editFile(
  filePath: string,
  oldString: string,
  newString: string,
  options?: { replaceAll?: boolean }
): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);

    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    // Enforce read-before-write
    if (!hasBeenRead(resolvedPath)) {
      return {
        success: false,
        error: `SAFETY CHECK: You must use read_file("${filePath}") FIRST before editing. Do NOT run bash commands - just call read_file to see the current content.`
      };
    }

    const content = await fs.readFile(resolvedPath, 'utf-8');
    
    // Check if the old string exists in the file
    if (!content.includes(oldString)) {
      return { 
        success: false, 
        error: `The string to replace was not found in the file. Make sure to include exact whitespace and formatting.` 
      };
    }
    
    // Count occurrences
    const occurrences = content.split(oldString).length - 1;
    
    // If not replaceAll and multiple occurrences, warn
    if (!options?.replaceAll && occurrences > 1) {
      return {
        success: false,
        error: `Found ${occurrences} occurrences of the string. Use replaceAll: true to replace all, or provide a more unique string.`,
      };
    }
    
    // Perform the replacement
    const newContent = options?.replaceAll 
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);
    
    await fs.writeFile(resolvedPath, newContent, 'utf-8');
    
    return { 
      success: true, 
      data: { 
        path: resolvedPath, 
        replacements: options?.replaceAll ? occurrences : 1,
        bytesWritten: Buffer.byteLength(newContent),
      } 
    };
  } catch (error) {
    return { success: false, error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Get tool definitions for Claude
 */
export const filesystemTools: Tool[] = [
  {
    name: 'read_file',
    description: `Read a file's contents. ALWAYS use this before editing or writing to a file.

USE THIS WHEN:
- You need to see what's in a file
- Before using edit_file (required)
- Before using write_file on existing files (required)
- Understanding code structure

FEATURES:
- Returns content with line numbers
- Default: 2000 lines max (use offset/limit for more)
- Long lines (>2000 chars) are truncated
- Large files use streaming

For large files, paginate:
- First: read_file(path) → lines 1-2000
- Next: read_file(path, offset=2000) → lines 2001-4000`,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read (absolute or relative to current directory)',
        },
        offset: {
          type: 'number',
          description: 'Optional: Start reading from this line number (0-indexed). Default: 0',
        },
        limit: {
          type: 'number',
          description: 'Optional: Maximum number of lines to read. Default: 2000',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: `Write content to a file on the local filesystem.

IMPORTANT: You must read existing files with read_file BEFORE writing to them.
This prevents accidentally overwriting content you haven't seen.

Creates parent directories as needed. Overwrites existing content.

Prefer edit_file for making targeted changes to existing files.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to write (absolute or relative)',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'List files and directories in a given path. Returns entries with name, type (file/directory), and full path.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the local filesystem.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to delete',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_exists',
    description: 'Check if a file or directory exists, and get basic info (type, size, modified date).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to check',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'edit_file',
    description: `Edit a file by replacing a specific string with new content.

IMPORTANT: You must read the file with read_file BEFORE editing.
This ensures you have the exact string to match.

The old_string must:
- Match EXACTLY (including whitespace and indentation)
- Be unique in the file (unless using replace_all)
- Include enough context to be unambiguous

Tips for successful edits:
- Copy the exact text from read_file output
- Include surrounding lines if the target isn't unique
- Use replace_all: true for renaming variables`,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace. Must be unique in the file unless using replaceAll.',
        },
        new_string: {
          type: 'string',
          description: 'The new string to replace the old one with',
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace all occurrences. Default false (only replace first, and fail if multiple found).',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'workspace_summary',
    description: `Get a tree-view summary of a directory. Perfect for understanding project structure after scaffolding or cloning.

Automatically skips: node_modules, .git, dist, build, .next, __pycache__, venv

Shows file sizes and provides a quick overview. Use this after:
- Running npx create-react-app, npm create vite, etc.
- Cloning a repo
- Any command that creates multiple files`,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to summarize',
        },
        max_depth: {
          type: 'number',
          description: 'Optional: Maximum depth to traverse (default: 3)',
        },
        max_files: {
          type: 'number',
          description: 'Optional: Maximum files to show (default: 100)',
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Execute a filesystem tool
 */
export async function executeFilesystemTool(name: string, args: Record<string, unknown>): Promise<LocalToolResult> {
  switch (name) {
    case 'read_file':
      return readFile(args.path as string, {
        offset: args.offset as number | undefined,
        limit: args.limit as number | undefined,
      });
    case 'write_file':
      return writeFile(args.path as string, args.content as string);
    case 'list_dir':
      return listDir(args.path as string);
    case 'delete_file':
      return deleteFile(args.path as string);
    case 'file_exists':
      return fileExists(args.path as string);
    case 'edit_file':
      return editFile(
        args.path as string,
        args.old_string as string,
        args.new_string as string,
        { replaceAll: args.replace_all as boolean | undefined }
      );
    case 'workspace_summary':
      return workspaceSummary(args.path as string, {
        maxDepth: args.max_depth as number | undefined,
        maxFiles: args.max_files as number | undefined,
      });
    default:
      return { success: false, error: `Unknown filesystem tool: ${name}` };
  }
}

