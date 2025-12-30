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
import {
  createLLMProvider,
  LLMProvider,
  LLMResponse,
} from './provider.js';
import {
  resolveOpenRouterModelId,
  getOpenRouterModelConfig,
  listOpenRouterModels,
  OPENROUTER_MODELS,
} from './openrouter.js';
import type { LLMProvider as LLMProviderType } from '../config/manager.js';

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
  // Nested structures containing price data (Discovery MCP response)
  'markets', 'outcomes',
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
  // LLM Provider configuration
  provider?: LLMProviderType; // 'anthropic' | 'openrouter' - defaults to 'anthropic'
  anthropicApiKey?: string; // Required if provider is 'anthropic'
  openrouterApiKey?: string; // Required if provider is 'openrouter'
  
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
  
  // Abort handling - pass AbortSignal to cancel execution mid-loop
  abortSignal?: AbortSignal;
  
  // Max turns per request (prevents runaway loops)
  maxTurns?: number;
  
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown, success: boolean) => void;
  onText?: (text: string, isComplete: boolean) => void;
  onThinking?: (text: string) => void; // For extended thinking
  onStreamStart?: () => void;
  onStreamEnd?(): void;
  onAbort?: () => void; // Called when execution is aborted via signal
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

const DEFAULT_SYSTEM_PROMPT = `You are Quantish, an AI trading agent for prediction markets (Polymarket, Kalshi).

You have tools to search markets and place trades. When showing market data, display ALL relevant information from the response including prices/probabilities.

## Building Applications

When asked to create applications or projects:

1. **Use run_command for scaffolding** - Commands like \`npx create-react-app\` or \`npm create vite\` are automatically given 10 minutes to complete. Always add \`--yes\` flag to skip prompts.

2. **Verify after creation** - After scaffolding completes, use \`workspace_summary\` to see the file tree and confirm the project was created correctly.

3. **Use start_background_process for dev servers** - After the app is built, use this for \`npm start\`, \`npm run dev\`, etc. These run indefinitely until stopped.

4. **Read files before editing** - Always use \`read_file\` before \`edit_file\` to understand the existing code structure.

5. **Test incrementally** - After making changes, run the app and verify it works before making more changes.

Be concise and helpful.`;


export class Agent {
  private anthropic: Anthropic;
  private llmProvider?: LLMProvider;
  private mcpClient?: MCPClient;
  private mcpClientManager?: MCPClientManager;
  private config: AgentConfig;
  private conversationHistory: MessageParam[] = [];
  private workingDirectory: string;
  private sessionCost: number = 0; // Cumulative cost for this session
  
  // Loop detection: track last N tool calls to detect loops
  private recentToolCalls: Array<{ name: string; input: string }> = [];
  private static MAX_RECENT_TOOL_CALLS = 5;
  private static LOOP_THRESHOLD = 2; // Abort if same call appears this many times
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
      provider: 'anthropic', // Default to Anthropic
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
    
    // Initialize Anthropic client (still needed for compaction and token counting)
    const headers: Record<string, string> = {};
    if (this.config.contextEditing && this.config.contextEditing.length > 0) {
      headers['anthropic-beta'] = 'context-management-2025-06-27';
    }
    
    // Anthropic client for fallback operations
    const anthropicKey = config.anthropicApiKey || 'placeholder';
    this.anthropic = new Anthropic({
      apiKey: anthropicKey,
      defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    });
    
    this.mcpClient = config.mcpClient;
    this.mcpClientManager = config.mcpClientManager;
    this.workingDirectory = config.workingDirectory || process.cwd();
  }

  /**
   * Get the API key for the current provider
   */
  private getApiKey(): string {
    if (this.config.provider === 'openrouter') {
      return this.config.openrouterApiKey || '';
    }
    return this.config.anthropicApiKey || '';
  }

  /**
   * Check if using OpenRouter provider
   */
  isOpenRouter(): boolean {
    return this.config.provider === 'openrouter';
  }

  /**
   * Get the current provider name
   */
  getProvider(): LLMProviderType {
    return this.config.provider || 'anthropic';
  }

  /**
   * Set the LLM provider
   */
  setProvider(provider: LLMProviderType): void {
    this.config.provider = provider;
    this.llmProvider = undefined; // Reset provider to force recreation
  }

  /**
   * Get or create the LLM provider instance
   */
  private async getOrCreateProvider(): Promise<LLMProvider> {
    if (this.llmProvider) {
      return this.llmProvider;
    }

    const allTools = await this.getAllTools();
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    // Use provider-specific default model
    const defaultModel = this.config.provider === 'openrouter' ? 'z-ai/glm-4.7' : DEFAULT_MODEL;
    const model = this.config.model ?? defaultModel;
    const maxTokens = this.config.maxTokens ?? 8192;

    this.llmProvider = createLLMProvider({
      provider: this.config.provider || 'anthropic',
      apiKey: this.getApiKey(),
      model,
      maxTokens,
      systemPrompt,
      tools: allTools,
      contextEditing: this.config.contextEditing,
    });

    return this.llmProvider;
  }

  /**
   * Run the agent using the provider abstraction (for OpenRouter and future providers)
   */
  private async runWithProvider(userMessage: string): Promise<AgentResult> {
    const maxIterations = this.config.maxIterations ?? 200;
    const useStreaming = this.config.streaming ?? true;

    // Get or create the LLM provider
    const provider = await this.getOrCreateProvider();

    // Add context about working directory
    const contextMessage = `[Working directory: ${this.workingDirectory}]\n\n${userMessage}`;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: contextMessage,
    });

    // Clear loop tracking for new user message
    this.clearToolCallLoopTracking();

    const toolCalls: AgentResult['toolCalls'] = [];
    let iterations = 0;
    let finalText = '';

    // Use maxTurns if specified, otherwise fall back to maxIterations
    const maxTurns = this.config.maxTurns ?? maxIterations;

    while (iterations < maxTurns) {
      // Check abort signal at each iteration
      if (this.config.abortSignal?.aborted) {
        finalText += '\n\n[Operation cancelled by user]';
        break;
      }
      
      iterations++;
      this.config.onStreamStart?.();

      let response: LLMResponse;

      if (useStreaming) {
        // Use streaming
        response = await provider.streamChat(this.conversationHistory, {
          onText: (text) => {
            finalText += text;
            this.config.onText?.(text, false);
          },
          onThinking: (text) => {
            this.config.onThinking?.(text);
          },
          onToolCall: (id, name, input) => {
            this.config.onToolCall?.(name, input);
          },
        });
        
        // Mark text as complete
        if (response.text) {
          this.config.onText?.('', true);
        }
      } else {
        // Non-streaming
        response = await provider.chat(this.conversationHistory);
        
        if (response.text) {
          finalText += response.text;
          this.config.onText?.(response.text, true);
        }
      }

      this.config.onStreamEnd?.();

      // Update token usage - pass the pre-calculated cost from the provider
      this.updateTokenUsage({
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        cache_creation_input_tokens: response.usage.cacheCreationTokens,
        cache_read_input_tokens: response.usage.cacheReadTokens,
      }, response.cost);

      // Build response content for conversation history
      const responseContent: ContentBlockParam[] = [];
      if (response.text) {
        responseContent.push({ type: 'text', text: response.text });
      }
      for (const tc of response.toolCalls) {
        responseContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }

      // If no tool calls, we're done
      if (response.toolCalls.length === 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: responseContent,
        });
        break;
      }

      // Execute tools
      const toolResults: ToolResultBlockParam[] = [];

      for (const toolCall of response.toolCalls) {
        // Yield to allow UI to render pending state
        await new Promise(resolve => setImmediate(resolve));

        const { result, source } = await this.executeTool(
          toolCall.name,
          toolCall.input
        );

        const success = !(result && typeof result === 'object' && 'error' in result);
        this.config.onToolResult?.(toolCall.name, result, success);

        toolCalls.push({
          name: toolCall.name,
          input: toolCall.input,
          result,
          source,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Add assistant response and tool results to history
      this.conversationHistory.push({
        role: 'assistant',
        content: responseContent,
      });
      this.conversationHistory.push({
        role: 'user',
        content: toolResults,
      });

      // Truncate for future context savings
      this.truncateLastToolResults();

      // Check if we should stop
      if (response.stopReason === 'end_turn' && response.toolCalls.length === 0) {
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
    // Check if abort signal was triggered
    if (this.config.abortSignal?.aborted) {
      return {
        result: { error: 'Operation cancelled by user' },
        source: 'local',
      };
    }
    
    // Check for tool call loops
    if (this.checkToolCallLoop(name, args)) {
      return {
        result: { error: `Loop detected: "${name}" was called multiple times with the same input. Please try a different approach.` },
        source: 'local',
      };
    }
    
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
   * Set the abort signal for the current request (call before run())
   */
  setAbortSignal(signal: AbortSignal | undefined): void {
    this.config.abortSignal = signal;
  }
  
  /**
   * Run the agent with a user message (supports streaming)
   */
  async run(userMessage: string, options?: { abortSignal?: AbortSignal }): Promise<AgentResult> {
    // Set abort signal if provided in options
    if (options?.abortSignal) {
      this.config.abortSignal = options.abortSignal;
    }
    
    // Route to provider-specific implementation if using OpenRouter
    if (this.config.provider === 'openrouter') {
      return this.runWithProvider(userMessage);
    }
    
    const maxIterations = this.config.maxIterations ?? 15;
    // Model should be passed from ConfigManager.getModel() which handles provider-specific defaults
    const model = this.config.model ?? 'claude-sonnet-4-5-20250929';
    const maxTokens = this.config.maxTokens ?? 8192;
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const useStreaming = this.config.streaming ?? true;

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

    // Clear loop tracking for new user message
    this.clearToolCallLoopTracking();

    const toolCalls: AgentResult['toolCalls'] = [];
    let iterations = 0;
    let finalText = '';

    // Use maxTurns if specified, otherwise fall back to maxIterations
    const maxTurns = this.config.maxTurns ?? maxIterations;

    while (iterations < maxTurns) {
      // Check abort signal at each iteration
      if (this.config.abortSignal?.aborted) {
        finalText += '\n\n[Operation cancelled by user]';
        break;
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
        
        const stream = this.anthropic.messages.stream(streamOptions);

        // Process stream events
        for await (const event of stream) {
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
        this.config.onToolCall?.(toolUse.name, toolUse.input as Record<string, unknown>);

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
   * @param usage - Token counts from the API response
   * @param preCalculatedCost - Optional pre-calculated cost (from OpenRouter provider)
   */
  
  /**
   * Check if a tool call would create a loop (same call repeated too many times).
   * Returns true if this call is part of a loop and should be stopped.
   */
  private checkToolCallLoop(toolName: string, input: Record<string, unknown>): boolean {
    const inputStr = JSON.stringify(input);
    const callSignature = `${toolName}:${inputStr}`;
    
    // Add to recent calls
    this.recentToolCalls.push({ name: toolName, input: inputStr });
    
    // Keep only last N calls
    if (this.recentToolCalls.length > Agent.MAX_RECENT_TOOL_CALLS) {
      this.recentToolCalls.shift();
    }
    
    // Count how many times this exact call appears in recent history
    const duplicateCount = this.recentToolCalls.filter(
      call => call.name === toolName && call.input === inputStr
    ).length;
    
    if (duplicateCount >= Agent.LOOP_THRESHOLD) {
      console.warn(`[Loop Detection] Tool "${toolName}" called ${duplicateCount} times with identical input. Stopping loop.`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Clear the tool call loop tracking (call when starting a new user message)
   */
  private clearToolCallLoopTracking(): void {
    this.recentToolCalls = [];
  }
  
  private updateTokenUsage(
    usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null },
    preCalculatedCost?: CostBreakdown
  ): void {
    const model = this.config.model ?? DEFAULT_MODEL;
    
    // Update cumulative counts
    this.cumulativeTokenUsage.inputTokens = usage.input_tokens;
    this.cumulativeTokenUsage.outputTokens += usage.output_tokens;
    this.cumulativeTokenUsage.cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
    this.cumulativeTokenUsage.cacheReadInputTokens = usage.cache_read_input_tokens || 0;
    this.cumulativeTokenUsage.totalTokens = 
      this.cumulativeTokenUsage.inputTokens + 
      this.cumulativeTokenUsage.outputTokens;

    // Use pre-calculated cost if provided (from OpenRouter), otherwise calculate
    const callCost = preCalculatedCost ?? calculateCost(
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
    const model = this.config.model ?? (this.config.provider === 'openrouter' ? 'z-ai/glm-4.7' : 'claude-sonnet-4-5-20250929');
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
    // Try resolving as Anthropic model first
    let resolvedId = resolveModelId(modelIdOrAlias);
    let displayName: string | undefined;
    
    if (resolvedId) {
      const modelConfig = getModelConfig(resolvedId);
      displayName = modelConfig?.displayName;
    } else {
      // Try resolving as OpenRouter model
      resolvedId = resolveOpenRouterModelId(modelIdOrAlias);
      if (resolvedId) {
        const orConfig = getOpenRouterModelConfig(resolvedId);
        displayName = orConfig?.displayName ?? resolvedId;
        // Auto-switch to OpenRouter if using an OpenRouter model
        if (!this.isOpenRouter() && resolvedId.includes('/')) {
          this.config.provider = 'openrouter';
        }
      }
    }
    
    if (!resolvedId) {
      const anthropicModels = Object.values(MODELS).map(m => m.name).join(', ');
      const orModels = Object.values(OPENROUTER_MODELS).slice(0, 5).map(m => m.name).join(', ');
      return {
        success: false,
        error: `Unknown model: "${modelIdOrAlias}". Anthropic: ${anthropicModels}. OpenRouter: ${orModels}, ...`,
      };
    }
    
    this.config.model = resolvedId;
    this.llmProvider = undefined; // Reset provider to force recreation with new model
    
    return {
      success: true,
      model: displayName ?? resolvedId,
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
   * This uses the current LLM to create a structured summary of the conversation,
   * then replaces the history with just the summary. This dramatically
   * reduces token count while preserving important context.
   * 
   * @returns Object with original/new token counts and the summary
   */
  async compactHistory(): Promise<CompactionResult> {
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
      // Estimate original token count
      const originalContentLength = JSON.stringify(this.conversationHistory).length;
      const originalTokens = Math.ceil(originalContentLength / 4);
      
      // Use current provider for compaction
      const compactionPrompt = `Your context window is filling up. Create a concise summary of our conversation so far.

Include:
- User's main goals and what was accomplished
- Files created/modified (with paths)
- Key decisions and discoveries  
- Next steps still needed
- Any important context to preserve

Be thorough but concise. The goal is to capture everything needed to continue seamlessly.`;
      
      // Add compaction request to history
      const compactionMessages: MessageParam[] = [
        ...this.conversationHistory,
        { role: 'user', content: compactionPrompt },
      ];
      
      // Use the current provider to generate the summary
      let summary: string;
      
      if (this.config.provider === 'openrouter' && this.llmProvider) {
        // Use OpenRouter
        const response = await this.llmProvider.chat(compactionMessages);
        summary = response.text;
      } else {
        // Use Anthropic
        const model = this.config.model ?? DEFAULT_MODEL;
        const response = await this.anthropic.messages.create({
          model,
          max_tokens: 4096,
          messages: compactionMessages,
        });
        
        const textBlocks = response.content.filter(block => block.type === 'text');
        summary = textBlocks.map(block => (block as any).text).join('\n');
      }
      
      if (!summary || summary.trim().length === 0) {
        throw new Error('Failed to generate summary');
      }
      
      // Create new history from summary
      const newHistory: MessageParam[] = [
        { role: 'assistant', content: summary.trim() },
      ];
      
      // Estimate new token count
      const newContentLength = JSON.stringify(newHistory).length;
      const newTokens = Math.ceil(newContentLength / 4);
      
      // Replace history with compacted version
      this.conversationHistory = newHistory;

      // Reset and update token usage
      this.resetTokenUsage();
      this.cumulativeTokenUsage.inputTokens = newTokens;
      this.cumulativeTokenUsage.totalTokens = newTokens;
      this.config.onTokenUsage?.(this.cumulativeTokenUsage);

      return {
        success: true,
        summary: summary.trim(),
        originalTokenCount: originalTokens,
        newTokenCount: newTokens,
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
  
  /**
   * Get conversation history (alias for getHistory)
   */
  getConversationHistory(): MessageParam[] {
    return this.getHistory();
  }
  
  /**
   * Set conversation history (alias for setHistory)
   */
  setConversationHistory(history: MessageParam[]): void {
    this.setHistory(history);
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
