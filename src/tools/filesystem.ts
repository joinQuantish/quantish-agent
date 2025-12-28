/**
 * File System Tools
 * 
 * Local tools for reading, writing, and listing files.
 * These run on the user's machine, not via MCP.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

export interface LocalToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Read a file from the filesystem
 */
export async function readFile(filePath: string, options?: { offset?: number; limit?: number }): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);
    
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = await fs.readFile(resolvedPath, 'utf-8');
    
    if (options?.offset !== undefined || options?.limit !== undefined) {
      const lines = content.split('\n');
      const start = options.offset ?? 0;
      const end = options.limit ? start + options.limit : lines.length;
      const selectedLines = lines.slice(start, end);
      
      // Add line numbers
      const numbered = selectedLines.map((line, i) => `${(start + i + 1).toString().padStart(6)}|${line}`).join('\n');
      return { success: true, data: numbered };
    }

    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Write content to a file
 */
export async function writeFile(filePath: string, content: string): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    
    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(resolvedPath, content, 'utf-8');
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
 * Edit a file using search/replace
 * This is safer than full overwrite as it only modifies specific parts
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
    description: 'Read the contents of a file from the local filesystem. Returns the file content as text. Supports optional line offset and limit for large files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read (absolute or relative to current directory)',
        },
        offset: {
          type: 'number',
          description: 'Optional: Start reading from this line number (0-indexed)',
        },
        limit: {
          type: 'number',
          description: 'Optional: Maximum number of lines to read',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file on the local filesystem. Creates the file if it doesn\'t exist, or overwrites if it does. Creates parent directories as needed.',
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
    description: 'Edit a file by replacing a specific string with new content. Safer than write_file as it only modifies the targeted section. The old_string must match exactly (including whitespace).',
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
    name: 'setup_env',
    description: 'Setup or update environment variables in a .env file for an application. Creates .env if it doesn\'t exist. Optionally creates a .env.example template. Use this when building any application that needs API keys or configuration.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to the .env file (default: ".env" in current directory)',
        },
        variables: {
          type: 'object',
          description: 'Object with environment variable names as keys and values. Example: { "QUANTISH_API_KEY": "abc123", "TOKEN_ID": "xyz" }',
          additionalProperties: { type: 'string' },
        },
        overwrite: {
          type: 'boolean',
          description: 'If true, overwrite existing variables. Default false (skip existing).',
        },
        create_example: {
          type: 'boolean',
          description: 'If true, also create a .env.example template file with placeholder values.',
        },
      },
      required: ['variables'],
    },
  },
];

/**
 * Setup or update environment variables in a .env file
 * Creates .env if it doesn't exist, appends/updates variables if it does
 */
export async function setupEnv(
  envPath: string = '.env',
  variables: Record<string, string>,
  options?: { overwrite?: boolean; createExample?: boolean }
): Promise<LocalToolResult> {
  try {
    const resolvedPath = path.resolve(envPath);
    let content = '';
    const existingVars: Record<string, string> = {};
    
    // Read existing .env if it exists
    if (existsSync(resolvedPath)) {
      content = await fs.readFile(resolvedPath, 'utf-8');
      
      // Parse existing variables
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex);
            const value = trimmed.slice(eqIndex + 1);
            existingVars[key] = value;
          }
        }
      }
    }
    
    const updatedVars: string[] = [];
    const addedVars: string[] = [];
    const skippedVars: string[] = [];
    
    // Process each variable
    for (const [key, value] of Object.entries(variables)) {
      if (existingVars[key] !== undefined) {
        if (options?.overwrite) {
          // Replace in content
          const regex = new RegExp(`^${key}=.*$`, 'm');
          content = content.replace(regex, `${key}=${value}`);
          updatedVars.push(key);
        } else {
          skippedVars.push(key);
        }
      } else {
        // Add new variable
        if (content && !content.endsWith('\n')) {
          content += '\n';
        }
        content += `${key}=${value}\n`;
        addedVars.push(key);
      }
    }
    
    // Write the updated .env file
    await fs.writeFile(resolvedPath, content, 'utf-8');
    
    // Optionally create .env.example
    if (options?.createExample) {
      const examplePath = resolvedPath.replace(/\.env$/, '.env.example');
      let exampleContent = '# Environment variables for this application\n';
      exampleContent += '# Copy this file to .env and fill in your values\n\n';
      
      for (const key of Object.keys({ ...existingVars, ...variables })) {
        if (key === 'QUANTISH_API_KEY') {
          exampleContent += `# Get your API key at https://quantish.live\n`;
          exampleContent += `${key}=your_api_key_here\n\n`;
        } else {
          exampleContent += `${key}=\n`;
        }
      }
      
      await fs.writeFile(examplePath, exampleContent, 'utf-8');
    }
    
    return {
      success: true,
      data: {
        path: resolvedPath,
        added: addedVars,
        updated: updatedVars,
        skipped: skippedVars,
        exampleCreated: options?.createExample || false,
      },
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to setup env: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

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
    case 'setup_env':
      return setupEnv(
        (args.path as string) || '.env',
        args.variables as Record<string, string>,
        { 
          overwrite: args.overwrite as boolean | undefined,
          createExample: args.create_example as boolean | undefined,
        }
      );
    default:
      return { success: false, error: `Unknown filesystem tool: ${name}` };
  }
}

