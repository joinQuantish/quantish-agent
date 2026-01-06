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
import { resourceTools, executeResourceTool, isResourceTool } from './resources.js';

// All local tools (including resource tools which need special handling)
export const localTools: Tool[] = [
  ...filesystemTools,
  ...shellTools,
  ...gitTools,
  ...webTools,
  ...resourceTools,
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
 * Note: Resource tools need special handling - use executeResourceTool directly with mcpClientManager
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

  // Resource tools need mcpClientManager - return error if called through this path
  if (isResourceTool(name)) {
    return { success: false, error: `Resource tool ${name} requires MCP client. This is an internal error.` };
  }

  return { success: false, error: `Unknown local tool: ${name}` };
}

// Re-export types and individual tool modules
export type { LocalToolResult } from './filesystem.js';
export { filesystemTools, executeFilesystemTool } from './filesystem.js';
export { shellTools, executeShellTool } from './shell.js';
export { gitTools, executeGitTool } from './git.js';
export { webTools, executeWebTool } from './web.js';
export { resourceTools, executeResourceTool, isResourceTool } from './resources.js';
export { processManager, type ProcessInfo } from './process-manager.js';
