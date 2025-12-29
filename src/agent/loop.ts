/**
 * Agent Loop
 * 
 * Implements the agentic loop that:
 * 1. Sends user messages to Claude with streaming
 * 2. Streams text and thinking in real-time
 * 3. Intercepts tool_use blocks
 * 4. Executes local tools (filesystem, shell, git) directly
 * 5. Executes MCP tools via Discovery and Trading servers
 * 6. Returns tool results to Claude
 * 7. Continues until no more tools are called
 */

import Anthropic from '@anthropic-ai/sdk';
import type { 
  MessageParam, 
  ToolResultBlockParam,
  TextBlock,
  ToolUseBlock,
  Tool,
  ContentBlockParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages.js';
import { MCPClient, MCPClientManager, convertToClaudeTools } from '../mcp/index.js';
import { localTools, isLocalTool, executeLocalTool } from '../tools/index.js';
import { compactConversation, CompactionResult } from './compaction.js';
import { 
  calculateCost, 
  CostBreakdown, 
  DEFAULT_MODEL, 
  getModelConfig, 
  resolveModelId,
  MODELS 
} from './pricing.js';

/**
 * Maximum characters for tool results stored in conversation history.
 * Prevents context explosion from large tool outputs (like market searches).
 * ~4000 chars ≈ ~1000 tokens
 */
const MAX_TOOL_RESULT_CHARS = 8000;

/**
 * Truncate a tool result to prevent context explosion.
 * 
 * Smart truncation for different result types:
 * - MCP responses: Extract and truncate the inner JSON data
 * - Arrays: Keep first N items and add summary
 * - Objects with arrays: Keep first few items of each array
 * - Strings: Simple truncation with ellipsis
 */
function truncateToolResult(result: unknown, toolName: string): unknown {
  const resultStr = JSON.stringify(result);
  
  // If it's small enough, return as-is
  if (resultStr.length <= MAX_TOOL_RESULT_CHARS) {
    return result;
  }

  // Handle MCP response format: { content: [{ type: "text", text: "..." }] }
  // This is the format returned by MCP servers - we need to parse and truncate the inner JSON
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    
    // Check if this is an MCP response format
    if (Array.isArray(obj.content) && obj.content.length > 0) {
      const firstContent = obj.content[0] as Record<string, unknown>;
      if (firstContent?.type === 'text' && typeof firstContent.text === 'string') {
        try {
          // Parse the inner JSON and truncate it
          const innerData = JSON.parse(firstContent.text);
          const truncatedInner = truncateDataObject(innerData);
          
          // Return in the same MCP format but with truncated data
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(truncatedInner),
            }],
          };
        } catch {
          // If parsing fails, truncate the text string directly
          const truncatedText = firstContent.text.length > MAX_TOOL_RESULT_CHARS
            ? firstContent.text.substring(0, MAX_TOOL_RESULT_CHARS) + '... [truncated]'
            : firstContent.text;
          return {
            content: [{
              type: 'text',
              text: truncatedText,
            }],
          };
        }
      }
    }
  }

  // Handle arrays (e.g., market search results)
  if (Array.isArray(result)) {
    return truncateArray(result);
  }

  // Handle regular objects
  if (typeof result === 'object' && result !== null) {
    return truncateDataObject(result as Record<string, unknown>);
  }

  // Handle strings
  if (typeof result === 'string' && result.length > MAX_TOOL_RESULT_CHARS) {
    return result.substring(0, MAX_TOOL_RESULT_CHARS) + '... [truncated]';
  }

  return result;
}

/**
 * Truncate an array to keep only essential items
 */
function truncateArray(arr: unknown[]): Record<string, unknown> {
  const MAX_ITEMS = 5; // Keep up to 5 items
  const truncated = arr.slice(0, MAX_ITEMS).map(item => 
    typeof item === 'object' && item !== null 
      ? truncateObject(item as Record<string, unknown>) 
      : item
  );
  return {
    _truncated: arr.length > MAX_ITEMS,
    _originalCount: arr.length,
    _note: arr.length > MAX_ITEMS 
      ? `Showing ${MAX_ITEMS} of ${arr.length} items.`
      : undefined,
    items: truncated,
  };
}

/**
 * Truncate a data object (like market search results)
 */
function truncateDataObject(obj: Record<string, unknown>): Record<string, unknown> {
  const truncated: Record<string, unknown> = {};
  const MAX_ARRAY_ITEMS = 5;
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      // Truncate arrays but keep more items (5 instead of 3)
      if (value.length > MAX_ARRAY_ITEMS) {
        truncated[key] = value.slice(0, MAX_ARRAY_ITEMS).map(item =>
          typeof item === 'object' && item !== null 
            ? truncateObject(item as Record<string, unknown>) 
            : item
        );
        truncated[`_${key}Count`] = value.length;
        truncated['_truncated'] = true;
      } else {
        truncated[key] = value.map(item =>
          typeof item === 'object' && item !== null 
            ? truncateObject(item as Record<string, unknown>) 
            : item
        );
      }
    } else if (typeof value === 'object' && value !== null) {
      truncated[key] = truncateObject(value as Record<string, unknown>);
    } else if (typeof value === 'string' && value.length > 500) {
      truncated[key] = value.substring(0, 500) + '...';
    } else {
      truncated[key] = value;
    }
  }
  
  return truncated;
}

/**
 * Actionable fields that MUST be kept for trading functionality.
 * These are required to place orders and interact with markets.
 */
const ACTIONABLE_FIELDS = new Set([
  // Market identifiers (required for trading)
  'conditionId', 'tokenId', 'marketId', 'id', 'ticker',
  // Token info (required for order placement)  
  'token_id', 'clobTokenIds', 'tokens',
  // Pricing (required for trading decisions)
  'price', 'probability', 'outcomePrices', 'bestBid', 'bestAsk',
  // Market identity (for user understanding)
  'title', 'question', 'slug', 'outcome', 'name',
  // Status info (affects tradability)
  'active', 'closed', 'status', 'endDate',
  // Platform (for multi-platform support)
  'platform',
]);

/**
 * Fields that are nice to have but can be summarized
 */
const SUMMARY_FIELDS = new Set([
  'volume', 'liquidity', 'volume24hr',
]);

/**
 * Fields to completely drop from context (not actionable)
 */
const DROP_FIELDS = new Set([
  'description', 'rules', 'resolutionSource', 'image', 'icon',
  'createdAt', 'updatedAt', 'lastTradePrice', 'spread',
  'acceptingOrders', 'acceptingOrdersTimestamp', 'minimum_tick_size',
  'minimum_order_size', 'maker_base_fee', 'taker_base_fee',
  'neg_risk', 'neg_risk_market_id', 'neg_risk_request_id',
  'notifications_enabled', 'is_50_50_outcome', 'game_start_time',
  'seconds_delay', 'icon', 'fpmm', 'rewards', 'competitive',
]);

/**
 * Truncate an object keeping only actionable trading data
 */
function truncateObject(obj: Record<string, unknown>): Record<string, unknown> {
  const truncated: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip fields we don't need in context
    if (DROP_FIELDS.has(key)) continue;
    
    // Always keep actionable fields
    if (ACTIONABLE_FIELDS.has(key)) {
      if (typeof value === 'string' && value.length > 150) {
        // Truncate long strings but keep them
        truncated[key] = value.substring(0, 150) + '...';
      } else if (Array.isArray(value)) {
        // For arrays like tokens, keep essential data
        truncated[key] = value.slice(0, 10).map(item => {
          if (typeof item === 'object' && item !== null) {
            return extractTokenInfo(item as Record<string, unknown>);
          }
          return item;
        });
      } else {
        truncated[key] = value;
      }
      continue;
    }
    
    // Keep summary fields as simple values
    if (SUMMARY_FIELDS.has(key)) {
      if (typeof value === 'number' || typeof value === 'string') {
        truncated[key] = value;
      }
      continue;
    }
    
    // For other fields, only keep simple values if we have room
    if (typeof value !== 'object' && JSON.stringify(truncated).length < 800) {
      truncated[key] = value;
    }
  }

  return truncated;
}

/**
 * Extract only actionable token info (for tokens array)
 */
function extractTokenInfo(token: Record<string, unknown>): Record<string, unknown> {
  return {
    token_id: token.token_id ?? token.tokenId,
    outcome: token.outcome ?? token.name,
    price: token.price ?? token.probability,
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  // Cost tracking
  cost: CostBreakdown;
  sessionCost: number; // Cumulative cost for this session
}

/**
 * Context editing configuration for automatic tool result clearing.
 * Uses Anthropic's beta context-management API to reduce context size.
 */
export interface ContextEditConfig {
  type: 'clear_tool_uses_20250919' | 'clear_thinking_20251015';
  trigger: {
    type: 'input_tokens';
    value: number; // Token threshold to trigger clearing
  };
  keep: {
    type: 'tool_uses' | 'thinking';
    value: number; // Number of recent tool uses/thinking blocks to keep
  };
}

export interface AgentConfig {
  anthropicApiKey: string;
  mcpClient?: MCPClient; // Legacy: single MCP client
  mcpClientManager?: MCPClientManager; // New: manages Discovery + Trading MCPs
  model?: string;
  maxTokens?: number;
  maxIterations?: number;
  systemPrompt?: string;
  enableLocalTools?: boolean;
  enableMCPTools?: boolean;
  workingDirectory?: string;
  streaming?: boolean; // Enable streaming output
  contextEditing?: ContextEditConfig[]; // Server-side context editing rules
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown, success: boolean) => void;
  onText?: (text: string, isComplete: boolean) => void;
  onThinking?: (text: string) => void; // For extended thinking
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  onTokenUsage?: (usage: TokenUsage) => void; // Token usage after each response
}

export interface AgentResult {
  text: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: unknown;
    source: 'local' | 'mcp' | 'discovery' | 'trading';
  }>;
  iterations: number;
  tokenUsage: TokenUsage;
}

const DEFAULT_SYSTEM_PROMPT = `You are Quantish, an AI coding and trading agent. Be concise.

## APIs

TRADING (requires QUANTISH_API_KEY):
- URL: https://quantish-sdk-production.up.railway.app/mcp/execute
- Format: JSON-RPC 2.0 { jsonrpc: '2.0', method: 'tools/call', params: { name, arguments }, id }
- Tools: get_balances, get_positions, place_order, cancel_order, get_orders, get_orderbook, get_price

DISCOVERY (free):
- URL: https://quantish.live/mcp/execute
- Format: { name, arguments }
- Key: qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8
- Tools: search_markets, get_market_details, get_trending_markets

## Response Structures (IMPORTANT - use these field paths)

search_markets / get_trending_markets returns:
{
  "found": N,
  "markets": [{ "platform", "id", "title", "markets": [{ "marketId", "question", "outcomes": [{ "name", "price" }], "clobTokenIds": "[json_array]", "conditionId" }] }]
}

get_market_details returns:
{
  "platform": "polymarket",
  "id": "12345",
  "conditionId": "0x...",
  "title": "Market Title",
  "clobTokenIds": "[\"TOKEN_YES\",\"TOKEN_NO\"]",
  "markets": [{
    "marketId": "67890",
    "question": "Question?",
    "outcomes": [{ "name": "Yes", "price": 0.55 }, { "name": "No", "price": 0.45 }],
    "clobTokenIds": "[\"TOKEN_YES\",\"TOKEN_NO\"]"
  }]
}

KEY FIELDS:
- market.id = top-level ID for get_market_details
- market.markets[0].marketId = sub-market ID
- market.markets[0].outcomes[].name = "Yes"/"No" or outcome name
- market.markets[0].outcomes[].price = decimal 0-1
- JSON.parse(market.clobTokenIds || market.markets[0].clobTokenIds) = token IDs array
- market.conditionId = condition ID for trading

## Standalone App Code

Trading helper:
async function callTradingTool(name, args = {}) {
  const res = await fetch('https://quantish-sdk-production.up.railway.app/mcp/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.QUANTISH_API_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: Date.now() })
  });
  return JSON.parse((await res.json()).result.content[0].text);
}

Discovery helper:
async function callDiscoveryTool(name, args = {}) {
  const res = await fetch('https://quantish.live/mcp/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8' },
    body: JSON.stringify({ name, arguments: args })
  });
  return JSON.parse((await res.json()).result.content[0].text);
}

## Rules
1. Never use @modelcontextprotocol/sdk - use fetch()
2. Always create .env.example and use dotenv
3. Never hardcode/mock data - always fetch real data
4. Check logs before restarting servers
5. PREFER edit_lines over edit_file - uses line numbers, saves tokens`;


export class Agent {
  private anthropic: Anthropic;
  private mcpClient?: MCPClient;
  private mcpClientManager?: MCPClientManager;
  private config: AgentConfig;
  private conversationHistory: MessageParam[] = [];
  private workingDirectory: string;
  private sessionCost: number = 0; // Cumulative cost for this session
  private cumulativeTokenUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
    sessionCost: 0,
  };

  constructor(config: AgentConfig) {
    this.config = {
      enableLocalTools: true,
      enableMCPTools: true,
      // Default context editing: clear old tool uses when context exceeds 100k tokens
      contextEditing: config.contextEditing || [
        {
          type: 'clear_tool_uses_20250919',
          trigger: { type: 'input_tokens', value: 100000 },
          keep: { type: 'tool_uses', value: 5 },
        },
      ],
      ...config,
    };
    
    // Initialize Anthropic client with beta header for context editing
    const headers: Record<string, string> = {};
    if (this.config.contextEditing && this.config.contextEditing.length > 0) {
      headers['anthropic-beta'] = 'context-management-2025-06-27';
    }
    
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
      defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    });
    this.mcpClient = config.mcpClient;
    this.mcpClientManager = config.mcpClientManager;
    this.workingDirectory = config.workingDirectory || process.cwd();
  }

  /**
   * Get all available tools
   */
  private async getAllTools(): Promise<Tool[]> {
    const tools: Tool[] = [];

    // Add local tools
    if (this.config.enableLocalTools) {
      tools.push(...localTools);
    }

    // Add MCP tools (prefer manager if available)
    if (this.config.enableMCPTools) {
      if (this.mcpClientManager) {
        // Use MCPClientManager for dual MCP support
        const mcpTools = await this.mcpClientManager.listAllTools();
        tools.push(...convertToClaudeTools(mcpTools));
      } else if (this.mcpClient) {
        // Fallback to single client
        const mcpTools = await this.mcpClient.listTools();
        tools.push(...convertToClaudeTools(mcpTools));
      }
    }

    return tools;
  }

  /**
   * Execute a tool (local or MCP)
   */
  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ result: unknown; source: 'local' | 'mcp' | 'discovery' | 'trading' }> {
    // Check if it's a local tool
    if (isLocalTool(name)) {
      const result = await executeLocalTool(name, args);
      return {
        result: result.success ? result.data : { error: result.error },
        source: 'local',
      };
    }

    // Try MCPClientManager first (handles routing to correct server)
    if (this.mcpClientManager) {
      const result = await this.mcpClientManager.callTool(name, args);
      // Return with the specific MCP source if known
      const source = result.source || 'mcp';
      return {
        result: result.success ? result.data : { error: result.error },
        source: source as 'discovery' | 'trading' | 'mcp',
      };
    }

    // Fallback to single MCP client
    if (this.mcpClient) {
      const result = await this.mcpClient.callTool(name, args);
      return {
        result: result.success ? result.data : { error: result.error },
        source: 'mcp',
      };
    }

    return {
      result: { error: `Unknown tool: ${name}` },
      source: 'local',
    };
  }

  /**
   * Run the agent with a user message (supports streaming)
   * @param userMessage - The user's input message
   * @param options - Optional configuration including abort signal
   */
  async run(userMessage: string, options?: { signal?: AbortSignal }): Promise<AgentResult> {
    // No arbitrary limit - loop until LLM stops (safety cap at 200)
    const maxIterations = this.config.maxIterations ?? 200;
    const model = this.config.model ?? 'claude-sonnet-4-5-20250929';
    const maxTokens = this.config.maxTokens ?? 8192;
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const useStreaming = this.config.streaming ?? true;
    const signal = options?.signal;

    // Get all available tools
    const allTools = await this.getAllTools();

    // Build context management config for server-side clearing
    const contextManagement = this.config.contextEditing && this.config.contextEditing.length > 0
      ? { edits: this.config.contextEditing }
      : undefined;

    // Add context about working directory
    const contextMessage = `[Working directory: ${this.workingDirectory}]\n\n${userMessage}`;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: contextMessage,
    });

    const toolCalls: AgentResult['toolCalls'] = [];
    let iterations = 0;
    let finalText = '';

    while (iterations < maxIterations) {
      // Check if aborted before starting new iteration
      if (signal?.aborted) {
        throw new Error('Operation aborted by user');
      }
      
      iterations++;
      this.config.onStreamStart?.();

      let response;
      let responseContent: ContentBlockParam[] = [];
      let currentText = '';
      let toolUses: ToolUseBlock[] = [];

      if (useStreaming) {
        // Use streaming API with prompt caching for cost reduction
        // Cached tokens are 90% cheaper than regular input tokens
        const systemWithCache: TextBlockParam[] = [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ];

        const streamOptions: any = {
          model,
          max_tokens: maxTokens,
          system: systemWithCache,
          tools: allTools,
          messages: this.conversationHistory,
        };
        
        // Add context management if configured (requires beta header)
        if (contextManagement) {
          streamOptions.context_management = contextManagement;
        }
        
        const stream = this.anthropic.messages.stream(streamOptions, { signal });

        // Process stream events
        for await (const event of stream) {
          // Check for abort during streaming
          if (signal?.aborted) {
            stream.controller.abort();
            throw new Error('Operation aborted by user');
          }
          if (event.type === 'content_block_delta') {
            const delta = event.delta as any;
            if (delta.type === 'text_delta' && delta.text) {
              currentText += delta.text;
              finalText += delta.text;
              this.config.onText?.(delta.text, false);
            } else if (delta.type === 'thinking_delta' && delta.thinking) {
              this.config.onThinking?.(delta.thinking);
            } else if (delta.type === 'input_json_delta' && delta.partial_json) {
              // Tool input is being streamed - we'll get the full thing at the end
            }
          } else if (event.type === 'content_block_stop') {
            // A content block finished
          }
        }

        // Get final message
        response = await stream.finalMessage();
        responseContent = response.content as ContentBlockParam[];

        // Track token usage
        this.updateTokenUsage(response.usage);

        // Extract tool uses from final response
        toolUses = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        // Mark text as complete
        if (currentText) {
          this.config.onText?.('', true);
        }
      } else {
        // Non-streaming fallback with prompt caching
        const systemWithCache: TextBlockParam[] = [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ];

        const createOptions: any = {
          model,
          max_tokens: maxTokens,
          system: systemWithCache,
          tools: allTools,
          messages: this.conversationHistory,
        };
        
        // Add context management if configured (requires beta header)
        if (contextManagement) {
          createOptions.context_management = contextManagement;
        }

        response = await this.anthropic.messages.create(createOptions);

        responseContent = response.content as ContentBlockParam[];

        // Track token usage
        this.updateTokenUsage(response.usage);

        // Extract tool uses and text from response
        toolUses = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );
        const textBlocks = response.content.filter(
          (block): block is TextBlock => block.type === 'text'
        );

        // Collect text
        for (const block of textBlocks) {
          finalText += block.text;
          this.config.onText?.(block.text, true);
        }
      }

      this.config.onStreamEnd?.();

      // If no tool calls, we're done
      if (toolUses.length === 0) {
        // Add assistant response to history
        this.conversationHistory.push({
          role: 'assistant',
          content: responseContent,
        });
        break;
      }

      // Execute tools
      const toolResults: ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        // Check if aborted before each tool execution
        if (signal?.aborted) {
          throw new Error('Operation aborted by user');
        }
        
        this.config.onToolCall?.(toolUse.name, toolUse.input as Record<string, unknown>);

        // Allow UI to render the "pending" state before executing
        // This ensures the spinner is visible during tool execution
        await new Promise(resolve => setImmediate(resolve));

        const { result, source } = await this.executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );

        const success = !(result && typeof result === 'object' && 'error' in result);
        this.config.onToolResult?.(toolUse.name, result, success);

        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          result,
          source,
        });

        // Send FULL result to Claude so it can see all data for this turn
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Add assistant response and FULL tool results to history for THIS turn
      // Claude needs full data to generate a proper response
      this.conversationHistory.push({
        role: 'assistant',
        content: responseContent,
      });
      this.conversationHistory.push({
        role: 'user',
        content: toolResults,
      });
      
      // After adding to history, truncate the tool results for FUTURE context
      // This keeps full data for current turn but saves tokens on subsequent turns
      this.truncateLastToolResults();

      // Check if we should stop
      if (response.stop_reason === 'end_turn' && toolUses.length === 0) {
        break;
      }
    }

    return {
      text: finalText,
      toolCalls,
      iterations,
      tokenUsage: { ...this.cumulativeTokenUsage },
    };
  }

  /**
   * Clear conversation history (start fresh)
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): MessageParam[] {
    return [...this.conversationHistory];
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  /**
   * Get working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Truncate tool results in the last message of conversation history.
   * 
   * This is called AFTER Claude has seen the full tool results and responded.
   * We then replace the full results with truncated versions to save context
   * on future turns. This way:
   * - Current turn: Claude sees full data, can display everything to user
   * - Future turns: Only actionable data (IDs, prices) is in context
   */
  private truncateLastToolResults(): void {
    // Find the last user message with tool results
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const message = this.conversationHistory[i];
      if (message.role === 'user' && Array.isArray(message.content)) {
        const toolResults = message.content.filter(
          (block: any) => block.type === 'tool_result'
        );
        
        if (toolResults.length > 0) {
          // Truncate each tool result
          const truncatedContent = message.content.map((block: any) => {
            if (block.type === 'tool_result' && typeof block.content === 'string') {
              try {
                const fullResult = JSON.parse(block.content);
                const truncatedResult = truncateToolResult(fullResult, 'unknown');
                return {
                  ...block,
                  content: JSON.stringify(truncatedResult),
                };
              } catch {
                // If parsing fails, truncate the string directly
                if (block.content.length > MAX_TOOL_RESULT_CHARS) {
                  return {
                    ...block,
                    content: block.content.substring(0, MAX_TOOL_RESULT_CHARS) + '... [truncated for context]',
                  };
                }
              }
            }
            return block;
          });
          
          // Replace the message content with truncated version
          this.conversationHistory[i] = {
            ...message,
            content: truncatedContent,
          };
          break; // Only truncate the most recent tool results
        }
      }
    }
  }

  /**
   * Update cumulative token usage from API response
   */
  private updateTokenUsage(usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }): void {
    const model = this.config.model ?? DEFAULT_MODEL;
    
    // Update cumulative counts
    this.cumulativeTokenUsage.inputTokens = usage.input_tokens;
    this.cumulativeTokenUsage.outputTokens += usage.output_tokens;
    this.cumulativeTokenUsage.cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
    this.cumulativeTokenUsage.cacheReadInputTokens = usage.cache_read_input_tokens || 0;
    this.cumulativeTokenUsage.totalTokens = 
      this.cumulativeTokenUsage.inputTokens + 
      this.cumulativeTokenUsage.outputTokens;

    // Calculate cost for THIS API call
    const callCost = calculateCost(
      model,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens || 0,
      usage.cache_read_input_tokens || 0
    );
    
    // Update session cost
    this.sessionCost += callCost.totalCost;
    
    // Update cost in token usage
    this.cumulativeTokenUsage.cost = callCost;
    this.cumulativeTokenUsage.sessionCost = this.sessionCost;

    // Emit token usage callback
    this.config.onTokenUsage?.(this.cumulativeTokenUsage);
  }

  /**
   * Get current token usage estimate
   */
  getTokenUsage(): TokenUsage {
    return { ...this.cumulativeTokenUsage };
  }

  /**
   * Count tokens in current conversation (uses Anthropic's token counting API)
   */
  async countTokens(): Promise<number> {
    const model = this.config.model ?? 'claude-sonnet-4-5-20250929';
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const allTools = await this.getAllTools();

    try {
      const response = await this.anthropic.messages.countTokens({
        model,
        system: systemPrompt,
        tools: allTools,
        messages: this.conversationHistory,
      });
      return response.input_tokens;
    } catch (error) {
      // If token counting fails, return our tracked estimate
      return this.cumulativeTokenUsage.inputTokens;
    }
  }

  /**
   * Reset token usage (e.g., after compaction)
   */
  resetTokenUsage(): void {
    this.sessionCost = 0;
    this.cumulativeTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalTokens: 0,
      cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
      sessionCost: 0,
    };
  }

  /**
   * Get the current model being used
   */
  getModel(): string {
    return this.config.model ?? DEFAULT_MODEL;
  }

  /**
   * Set the model to use for future requests
   */
  setModel(modelIdOrAlias: string): { success: boolean; model?: string; error?: string } {
    const resolvedId = resolveModelId(modelIdOrAlias);
    
    if (!resolvedId) {
      const availableModels = Object.values(MODELS).map(m => m.name).join(', ');
      return {
        success: false,
        error: `Unknown model: "${modelIdOrAlias}". Available: ${availableModels}`,
      };
    }
    
    this.config.model = resolvedId;
    const modelConfig = getModelConfig(resolvedId);
    
    return {
      success: true,
      model: modelConfig?.displayName ?? resolvedId,
    };
  }

  /**
   * Get session cost so far
   */
  getSessionCost(): number {
    return this.sessionCost;
  }

  /**
   * Compact the conversation history to reduce token usage.
   * 
   * This uses Claude to create a structured summary of the conversation,
   * then replaces the history with just the summary. This dramatically
   * reduces token count while preserving important context.
   * 
   * @returns Object with original/new token counts and the summary
   */
  async compactHistory(): Promise<CompactionResult> {
    const model = this.config.model ?? 'claude-sonnet-4-5-20250929';
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const allTools = await this.getAllTools();

    // Don't compact if history is empty or very short
    if (this.conversationHistory.length < 2) {
      return {
        success: false,
        originalTokenCount: 0,
        newTokenCount: 0,
        error: 'Conversation too short to compact',
      };
    }

    try {
      const result = await compactConversation(
        this.anthropic,
        this.conversationHistory,
        model,
        systemPrompt,
        allTools
      );

      // Replace history with compacted version
      this.conversationHistory = result.newHistory;

      // Reset and update token usage
      this.resetTokenUsage();
      this.cumulativeTokenUsage.inputTokens = result.newTokens;
      this.cumulativeTokenUsage.totalTokens = result.newTokens;
      this.config.onTokenUsage?.(this.cumulativeTokenUsage);

      return {
        success: true,
        summary: result.summary,
        originalTokenCount: result.originalTokens,
        newTokenCount: result.newTokens,
      };
    } catch (error) {
      return {
        success: false,
        originalTokenCount: this.cumulativeTokenUsage.inputTokens,
        newTokenCount: this.cumulativeTokenUsage.inputTokens,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Set conversation history (useful for restoring state)
   */
  setHistory(history: MessageParam[]): void {
    this.conversationHistory = history;
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
