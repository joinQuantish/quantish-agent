/**
 * Tool schema conversion utilities
 * 
 * Converts MCP tool schemas to Anthropic Claude tool format.
 */

import type { MCPTool } from './client.js';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Convert MCP tools to Anthropic Claude tool format
 */
export function convertToClaudeTools(mcpTools: MCPTool[]): Tool[] {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Tool['input_schema'],
  }));
}

/**
 * Get a subset of tools by name
 */
export function filterTools(tools: MCPTool[], names: string[]): MCPTool[] {
  const nameSet = new Set(names);
  return tools.filter((tool) => nameSet.has(tool.name));
}

/**
 * Group tools by category based on name prefixes
 */
export function groupToolsByCategory(tools: MCPTool[]): Record<string, MCPTool[]> {
  const categories: Record<string, MCPTool[]> = {
    wallet: [],
    order: [],
    position: [],
    market: [],
    transfer: [],
    swap: [],
    api_key: [],
    other: [],
  };

  for (const tool of tools) {
    const name = tool.name.toLowerCase();
    
    if (name.includes('wallet') || name.includes('balance') || name.includes('setup') || 
        name.includes('approval') || name.includes('deposit') || name.includes('credential')) {
      categories.wallet.push(tool);
    } else if (name.includes('order') || name.includes('atomic')) {
      categories.order.push(tool);
    } else if (name.includes('position') || name.includes('claim') || name.includes('share')) {
      categories.position.push(tool);
    } else if (name.includes('orderbook') || name.includes('price') || name.includes('market')) {
      categories.market.push(tool);
    } else if (name.includes('transfer') || name.includes('send')) {
      categories.transfer.push(tool);
    } else if (name.includes('swap') || name.includes('quote')) {
      categories.swap.push(tool);
    } else if (name.includes('api_key') || name.includes('key')) {
      categories.api_key.push(tool);
    } else {
      categories.other.push(tool);
    }
  }

  // Remove empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([, tools]) => tools.length > 0)
  );
}

