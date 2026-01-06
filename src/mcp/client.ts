/**
 * MCP Client for Quantish MCP Servers
 * 
 * Connects to MCP servers via HTTP to execute tools.
 * Supports both Discovery MCP (market data) and Trading MCP (wallet/orders).
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  source?: MCPSource; // Which MCP server the result came from
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: {
    content?: Array<{
      type: string;
      text?: string;
    }>;
    tools?: MCPTool[];
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Source identifier for MCP servers
 */
export type MCPSource = 'discovery' | 'trading' | 'kalshi';

/**
 * Extended MCPTool with source information
 */
export interface MCPToolWithSource extends MCPTool {
  source: MCPSource;
}

export class MCPClient {
  private baseUrl: string;
  private apiKey: string;
  private toolsCache: MCPTool[] | null = null;
  public readonly source: MCPSource;

  constructor(baseUrl: string, apiKey: string, source: MCPSource = 'trading') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.source = source;
  }

  /**
   * List available tools from the MCP server
   * Discovery MCP uses REST endpoints, Trading MCP uses JSON-RPC
   */
  async listTools(): Promise<MCPTool[]> {
    if (this.toolsCache) {
      return this.toolsCache;
    }

    // All MCPs now use JSON-RPC format
    // Build headers - use only one API key header (not both)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.source === 'discovery') {
      // Discovery MCP requires Accept header and uses uppercase X-API-Key
      headers['Accept'] = 'application/json, text/event-stream';
      headers['X-API-Key'] = this.apiKey;
    } else {
      // Trading and Kalshi MCPs use lowercase x-api-key
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as JSONRPCResponse;

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }

    const tools = data.result?.tools || [];
    this.toolsCache = tools;
    return tools;
  }

  /**
   * Call a tool on the MCP server
   * All MCPs use JSON-RPC format
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    // Build headers - use only one API key header (not both)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.source === 'discovery') {
      // Discovery MCP requires Accept header and uses uppercase X-API-Key
      headers['Accept'] = 'application/json, text/event-stream';
      headers['X-API-Key'] = this.apiKey;
    } else {
      // Trading and Kalshi MCPs use lowercase x-api-key
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `MCP server error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json() as JSONRPCResponse;

    if (data.error) {
      return {
        success: false,
        error: data.error.message,
      };
    }

    // Extract text content from MCP response
    const content = data.result?.content;
    if (content && content.length > 0) {
      const textContent = content.find(c => c.type === 'text');
      if (textContent?.text) {
        try {
          return {
            success: true,
            data: JSON.parse(textContent.text),
          };
        } catch {
          return {
            success: true,
            data: textContent.text,
          };
        }
      }
    }

    return {
      success: true,
      data: data.result,
    };
  }

  /**
   * Clear the tools cache (useful if server tools are updated)
   */
  clearCache(): void {
    this.toolsCache = null;
    this.resourcesCache = null;
  }

  private resourcesCache: MCPResource[] | null = null;

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<MCPResource[]> {
    if (this.resourcesCache) {
      return this.resourcesCache;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.source === 'discovery') {
      headers['Accept'] = 'application/json, text/event-stream';
      headers['X-API-Key'] = this.apiKey;
    } else {
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'resources/list',
        params: {},
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as JSONRPCResponse;

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }

    const resources = (data.result as { resources?: MCPResource[] })?.resources || [];
    this.resourcesCache = resources;
    return resources;
  }

  /**
   * Read a resource from the MCP server
   */
  async readResource(uri: string): Promise<MCPResourceContent | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.source === 'discovery') {
      headers['Accept'] = 'application/json, text/event-stream';
      headers['X-API-Key'] = this.apiKey;
    } else {
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as JSONRPCResponse;

    if (data.error) {
      return null;
    }

    const contents = (data.result as { contents?: MCPResourceContent[] })?.contents;
    return contents && contents.length > 0 ? contents[0] : null;
  }

  /**
   * Check if the MCP server is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to list tools as a health check
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }
}

export function createMCPClient(baseUrl: string, apiKey: string, source: MCPSource = 'trading'): MCPClient {
  return new MCPClient(baseUrl, apiKey, source);
}

/**
 * MCP Client Manager
 * 
 * Manages connections to multiple MCP servers:
 * - Discovery MCP: Always available with embedded public key (Polymarket market data)
 * - Trading MCP: Available when user has configured their API key (Polymarket wallet/orders)
 * - Kalshi MCP: Available when user has configured their Kalshi API key (Kalshi markets via DFlow)
 */
export class MCPClientManager {
  private discoveryClient: MCPClient;
  private tradingClient: MCPClient | null;
  private kalshiClient: MCPClient | null;
  private toolSourceMap: Map<string, MCPSource> = new Map();
  private allToolsCache: MCPToolWithSource[] | null = null;

  constructor(
    discoveryUrl: string,
    discoveryApiKey: string,
    tradingUrl?: string,
    tradingApiKey?: string,
    kalshiUrl?: string,
    kalshiApiKey?: string
  ) {
    // Discovery MCP is always available
    this.discoveryClient = new MCPClient(discoveryUrl, discoveryApiKey, 'discovery');
    
    // Trading MCP is optional (Polymarket)
    this.tradingClient = tradingUrl && tradingApiKey
      ? new MCPClient(tradingUrl, tradingApiKey, 'trading')
      : null;
    
    // Kalshi MCP is optional
    this.kalshiClient = kalshiUrl && kalshiApiKey
      ? new MCPClient(kalshiUrl, kalshiApiKey, 'kalshi')
      : null;
  }

  /**
   * Check if trading is enabled (Polymarket)
   */
  isTradingEnabled(): boolean {
    return this.tradingClient !== null;
  }

  /**
   * Check if Kalshi trading is enabled
   */
  isKalshiEnabled(): boolean {
    return this.kalshiClient !== null;
  }

  /**
   * Get the discovery client
   */
  getDiscoveryClient(): MCPClient {
    return this.discoveryClient;
  }

  /**
   * Get the trading client (may be null)
   */
  getTradingClient(): MCPClient | null {
    return this.tradingClient;
  }

  /**
   * Get the Kalshi client (may be null)
   */
  getKalshiClient(): MCPClient | null {
    return this.kalshiClient;
  }

  /**
   * List all tools from both servers
   */
  async listAllTools(): Promise<MCPToolWithSource[]> {
    if (this.allToolsCache) {
      return this.allToolsCache;
    }

    const allTools: MCPToolWithSource[] = [];
    this.toolSourceMap.clear();

    // Get Discovery tools (always available)
    try {
      const discoveryTools = await this.discoveryClient.listTools();
      for (const tool of discoveryTools) {
        allTools.push({ ...tool, source: 'discovery' });
        this.toolSourceMap.set(tool.name, 'discovery');
      }
    } catch (error) {
      console.warn('Failed to fetch Discovery MCP tools:', error);
    }

    // Get Trading tools (if available - Polymarket)
    // NOTE: Discovery search tools (search_markets, get_trending_markets, etc.) should NOT be overwritten
    // because they provide cross-platform semantic search. Trading MCP's search_markets is Polymarket-only.
    const discoverySearchTools = new Set([
      'search_markets',
      'get_market_details', 
      'get_trending_markets',
      'get_categories',
      'get_market_stats',
      'get_search_status',
      'find_arbitrage',
    ]);
    
    if (this.tradingClient) {
      try {
        const tradingTools = await this.tradingClient.listTools();
        for (const tool of tradingTools) {
          // Skip if this is a Discovery search tool (Discovery's cross-platform search takes precedence)
          if (discoverySearchTools.has(tool.name)) {
            continue;
          }
          allTools.push({ ...tool, source: 'trading' });
          this.toolSourceMap.set(tool.name, 'trading');
        }
      } catch (error) {
        console.warn('Failed to fetch Trading MCP tools:', error);
      }
    }

    // Get Kalshi tools (if available)
    if (this.kalshiClient) {
      try {
        const kalshiTools = await this.kalshiClient.listTools();
        for (const tool of kalshiTools) {
          allTools.push({ ...tool, source: 'kalshi' });
          this.toolSourceMap.set(tool.name, 'kalshi');
        }
      } catch (error) {
        console.warn('Failed to fetch Kalshi MCP tools:', error);
      }
    }

    this.allToolsCache = allTools;
    return allTools;
  }

  /**
   * Get which server a tool belongs to
   */
  getToolSource(toolName: string): MCPSource | undefined {
    return this.toolSourceMap.get(toolName);
  }

  /**
   * Call a tool on the appropriate server
   * Applies smart defaults for context efficiency (e.g., pagination limits)
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    // Ensure tool map is populated
    if (this.toolSourceMap.size === 0) {
      await this.listAllTools();
    }

    // Apply smart defaults for market tools to reduce context bloat
    const modifiedArgs = this.applySmartDefaults(name, args);

    const source = this.toolSourceMap.get(name);

    if (!source) {
      return {
        success: false,
        error: `Unknown MCP tool: ${name}`,
      };
    }

    if (source === 'discovery') {
      const result = await this.discoveryClient.callTool(name, modifiedArgs);
      return { ...result, source: 'discovery' };
    }

    if (source === 'trading') {
      if (!this.tradingClient) {
        return {
          success: false,
          error: `Polymarket trading not enabled. Run 'quantish init' to set up trading.`,
        };
      }
      const result = await this.tradingClient.callTool(name, modifiedArgs);
      return { ...result, source: 'trading' };
    }

    if (source === 'kalshi') {
      if (!this.kalshiClient) {
        return {
          success: false,
          error: `Kalshi trading not enabled. Run 'quantish init' to set up your Kalshi API key.`,
        };
      }
      const result = await this.kalshiClient.callTool(name, modifiedArgs);
      return { ...result, source: 'kalshi' };
    }

    return {
      success: false,
      error: `Unknown tool source: ${source}`,
    };
  }

  /**
   * Apply smart defaults to tool arguments for context efficiency.
   * This reduces context bloat by limiting large data returns.
   */
  private applySmartDefaults(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    const modifiedArgs = { ...args };

    // Market search tools - default to reasonable limits
    if (toolName === 'search_markets') {
      if (modifiedArgs.limit === undefined) {
        modifiedArgs.limit = 15;  // Default to 15 markets instead of unlimited
      }
    }

    if (toolName === 'get_trending_markets') {
      if (modifiedArgs.limit === undefined) {
        modifiedArgs.limit = 10;  // Default to 10 trending markets
      }
    }

    if (toolName === 'find_arbitrage') {
      if (modifiedArgs.limit === undefined) {
        modifiedArgs.limit = 10;  // Default to top 10 arbitrage opportunities
      }
      if (modifiedArgs.min_profit === undefined) {
        modifiedArgs.min_profit = 0.02;  // Default 2% minimum profit threshold
      }
    }

    return modifiedArgs;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.discoveryClient.clearCache();
    this.tradingClient?.clearCache();
    this.kalshiClient?.clearCache();
    this.allToolsCache = null;
    this.toolSourceMap.clear();
    this.allResourcesCache = null;
  }

  private allResourcesCache: MCPResource[] | null = null;

  /**
   * List all resources from the Trading MCP (which hosts documentation)
   */
  async listAllResources(): Promise<MCPResource[]> {
    if (this.allResourcesCache) {
      return this.allResourcesCache;
    }

    const allResources: MCPResource[] = [];

    // Resources are primarily on the Trading MCP
    if (this.tradingClient) {
      try {
        const tradingResources = await this.tradingClient.listResources();
        allResources.push(...tradingResources);
      } catch (error) {
        console.warn('Failed to fetch Trading MCP resources:', error);
      }
    }

    this.allResourcesCache = allResources;
    return allResources;
  }

  /**
   * Read a resource by URI
   */
  async readResource(uri: string): Promise<MCPResourceContent | null> {
    // Resources are on the Trading MCP
    if (this.tradingClient) {
      try {
        return await this.tradingClient.readResource(uri);
      } catch (error) {
        console.warn('Failed to read resource from Trading MCP:', error);
      }
    }
    return null;
  }

  /**
   * Health check both servers
   */
  async healthCheck(): Promise<{ discovery: boolean; trading: boolean | null }> {
    const discovery = await this.discoveryClient.healthCheck();
    const trading = this.tradingClient ? await this.tradingClient.healthCheck() : null;
    return { discovery, trading };
  }
}

/**
 * Create an MCP Client Manager with Discovery, Trading, and Kalshi clients
 */
export function createMCPClientManager(
  discoveryUrl: string,
  discoveryApiKey: string,
  tradingUrl?: string,
  tradingApiKey?: string,
  kalshiUrl?: string,
  kalshiApiKey?: string
): MCPClientManager {
  return new MCPClientManager(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey, kalshiUrl, kalshiApiKey);
}

