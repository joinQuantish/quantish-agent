/**
 * Tool Registry
 * 
 * Combines local coding tools with MCP trading tools.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import { filesystemTools, executeFilesystemTool, type LocalToolResult } from './filesystem.js';
import { shellTools, executeShellTool } from './shell.js';
import { gitTools, executeGitTool } from './git.js';
import { webTools, executeWebTool } from './web.js';

// All local tools
export const localTools: Tool[] = [
  ...filesystemTools,
  ...shellTools,
  ...gitTools,
  ...webTools,
];

// Set of local tool names for quick lookup
const localToolNames = new Set(localTools.map(t => t.name));

/**
 * Check if a tool is a local tool
 */
export function isLocalTool(name: string): boolean {
  return localToolNames.has(name);
}

/**
 * Execute a local tool
 */
export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<LocalToolResult> {
  // Filesystem tools
  if (filesystemTools.some(t => t.name === name)) {
    return executeFilesystemTool(name, args);
  }

  // Shell tools
  if (shellTools.some(t => t.name === name)) {
    return executeShellTool(name, args);
  }

  // Git tools
  if (gitTools.some(t => t.name === name)) {
    return executeGitTool(name, args);
  }

  // Web tools
  if (webTools.some(t => t.name === name)) {
    return executeWebTool(name, args);
  }

  return { success: false, error: `Unknown local tool: ${name}` };
}

// Re-export types and individual tool modules
export type { LocalToolResult } from './filesystem.js';
export { filesystemTools, executeFilesystemTool } from './filesystem.js';
export { shellTools, executeShellTool } from './shell.js';
export { gitTools, executeGitTool } from './git.js';
export { webTools, executeWebTool } from './web.js';
export { processManager, type ProcessInfo } from './process-manager.js';
