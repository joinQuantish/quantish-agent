/**
 * Resource Tools
 *
 * Tools for accessing MCP resources (documentation).
 * These tools provide on-demand access to API documentation
 * without loading everything into context upfront.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { MCPClientManager, MCPResource, MCPResourceContent } from '../mcp/client.js';
import type { LocalToolResult } from './filesystem.js';

/**
 * Resource tool definitions
 */
export const resourceTools: Tool[] = [
  {
    name: 'list_resources',
    description: `List available API documentation resources. Returns URIs and descriptions for all available documentation.

Use this when you need to:
- Find documentation for an API (Polymarket, Kalshi, DFlow, Jupiter)
- Understand what's available before reading specific docs
- Get the URI needed for read_resource

Example response:
- quantish://docs/polymarket/clob - Trading API for orders
- quantish://docs/polymarket/gamma - Market data API
- quantish://docs/kalshi/dflow - Solana trading API`,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_resource',
    description: `Read a specific API documentation resource by URI.

Use this when you need to:
- Understand how to use an API (endpoints, parameters, authentication)
- Get code examples for integrating with an API
- Learn about data models and response formats

IMPORTANT: Call list_resources first to get available URIs.

Example URIs:
- quantish://docs/polymarket/clob - CLOB trading API
- quantish://docs/polymarket/gamma - Gamma market data API
- quantish://docs/kalshi/dflow - DFlow prediction market API
- quantish://docs/kalshi/jupiter - Jupiter swap API`,
    input_schema: {
      type: 'object' as const,
      properties: {
        uri: {
          type: 'string',
          description: 'The resource URI (from list_resources)',
        },
      },
      required: ['uri'],
    },
  },
];

/**
 * Execute a resource tool
 *
 * @param name - Tool name (list_resources or read_resource)
 * @param args - Tool arguments
 * @param mcpClientManager - The MCP client manager for fetching resources
 */
export async function executeResourceTool(
  name: string,
  args: Record<string, unknown>,
  mcpClientManager: MCPClientManager | undefined
): Promise<LocalToolResult> {
  if (!mcpClientManager) {
    return {
      success: false,
      error: 'MCP client not configured. Resources require an MCP connection.',
    };
  }

  if (name === 'list_resources') {
    try {
      const resources = await mcpClientManager.listAllResources();

      if (resources.length === 0) {
        return {
          success: true,
          data: {
            resources: [],
            message: 'No resources available. The MCP server may not have resources configured.',
          },
        };
      }

      return {
        success: true,
        data: {
          resources: resources.map(r => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (name === 'read_resource') {
    const uri = args.uri as string;

    if (!uri) {
      return {
        success: false,
        error: 'Missing required parameter: uri. Call list_resources to get available URIs.',
      };
    }

    try {
      const content = await mcpClientManager.readResource(uri);

      if (!content) {
        return {
          success: false,
          error: `Resource not found: ${uri}. Call list_resources to see available resources.`,
        };
      }

      return {
        success: true,
        data: {
          uri: content.uri,
          mimeType: content.mimeType || 'text/markdown',
          content: content.text,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    success: false,
    error: `Unknown resource tool: ${name}`,
  };
}

/**
 * Check if a tool is a resource tool
 */
export function isResourceTool(name: string): boolean {
  return name === 'list_resources' || name === 'read_resource';
}
