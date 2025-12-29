/**
 * LLM Provider Abstraction
 * 
 * Provides a unified interface for different LLM providers (Anthropic, OpenRouter).
 * This allows the agent to work with any provider without changing the main loop logic.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  TextBlockParam,
  Tool,
  ContentBlockParam,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import {
  OpenRouterClient,
  OpenAIMessage,
  OpenAITool,
  OpenAIToolCall,
  convertToOpenAITools,
  getOpenRouterModelConfig,
  calculateOpenRouterCost,
} from './openrouter.js';
import { calculateCost, CostBreakdown } from './pricing.js';

/**
 * Unified response format from any LLM provider
 */
export interface LLMResponse {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
  cost: CostBreakdown;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  rawResponse?: unknown;
}

/**
 * Streaming event from LLM
 */
export interface LLMStreamEvent {
  type: 'text' | 'thinking' | 'tool_input' | 'done';
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

/**
 * LLM Provider Configuration
 */
export interface LLMProviderConfig {
  provider: 'anthropic' | 'openrouter';
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  tools: Tool[];
  contextEditing?: Array<{
    type: string;
    trigger: { type: string; value: number };
    keep: { type: string; value: number };
  }>;
}

/**
 * Abstract LLM Provider Interface
 */
export interface LLMProvider {
  /**
   * Send a message and get a response (non-streaming)
   */
  chat(messages: MessageParam[]): Promise<LLMResponse>;

  /**
   * Send a message and stream the response
   */
  streamChat(
    messages: MessageParam[],
    callbacks: {
      onText?: (text: string) => void;
      onThinking?: (text: string) => void;
      onToolCall?: (id: string, name: string, input: Record<string, unknown>) => void;
    }
  ): Promise<LLMResponse>;

  /**
   * Count tokens in messages
   */
  countTokens(messages: MessageParam[]): Promise<number>;

  /**
   * Get the current model ID
   */
  getModel(): string;
}

/**
 * Anthropic Provider Implementation
 */
export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    
    // Initialize with beta headers for context editing
    const headers: Record<string, string> = {};
    if (config.contextEditing && config.contextEditing.length > 0) {
      headers['anthropic-beta'] = 'context-management-2025-06-27';
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }

  getModel(): string {
    return this.config.model;
  }

  async countTokens(messages: MessageParam[]): Promise<number> {
    try {
      const response = await this.client.messages.countTokens({
        model: this.config.model,
        system: this.config.systemPrompt,
        tools: this.config.tools,
        messages,
      });
      return response.input_tokens;
    } catch {
      return 0;
    }
  }

  async chat(messages: MessageParam[]): Promise<LLMResponse> {
    const systemWithCache: TextBlockParam[] = [
      {
        type: 'text',
        text: this.config.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ];

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemWithCache,
      tools: this.config.tools,
      messages,
    });

    const usage = response.usage;
    const cost = calculateCost(
      this.config.model,
      usage.input_tokens,
      usage.output_tokens,
      (usage as any).cache_creation_input_tokens ?? 0,
      (usage as any).cache_read_input_tokens ?? 0
    );

    // Extract text and tool calls
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );
    const toolUses = response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );

    return {
      text: textBlocks.map(b => b.text).join(''),
      toolCalls: toolUses.map(t => ({
        id: t.id,
        name: t.name,
        input: t.input as Record<string, unknown>,
      })),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: (usage as any).cache_creation_input_tokens ?? 0,
        cacheReadTokens: (usage as any).cache_read_input_tokens ?? 0,
      },
      cost,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      rawResponse: response,
    };
  }

  async streamChat(
    messages: MessageParam[],
    callbacks: {
      onText?: (text: string) => void;
      onThinking?: (text: string) => void;
      onToolCall?: (id: string, name: string, input: Record<string, unknown>) => void;
    }
  ): Promise<LLMResponse> {
    const systemWithCache: TextBlockParam[] = [
      {
        type: 'text',
        text: this.config.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ];

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemWithCache,
      tools: this.config.tools,
      messages,
    });

    let fullText = '';

    // Process stream events
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as any;
        if (delta.type === 'text_delta' && delta.text) {
          fullText += delta.text;
          callbacks.onText?.(delta.text);
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          callbacks.onThinking?.(delta.thinking);
        }
      }
    }

    // Get final message
    const response = await stream.finalMessage();
    const usage = response.usage;
    const cost = calculateCost(
      this.config.model,
      usage.input_tokens,
      usage.output_tokens,
      (usage as any).cache_creation_input_tokens ?? 0,
      (usage as any).cache_read_input_tokens ?? 0
    );

    // Extract tool calls
    const toolUses = response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );

    // Notify callbacks about tool calls
    for (const tool of toolUses) {
      callbacks.onToolCall?.(tool.id, tool.name, tool.input as Record<string, unknown>);
    }

    return {
      text: fullText,
      toolCalls: toolUses.map(t => ({
        id: t.id,
        name: t.name,
        input: t.input as Record<string, unknown>,
      })),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: (usage as any).cache_creation_input_tokens ?? 0,
        cacheReadTokens: (usage as any).cache_read_input_tokens ?? 0,
      },
      cost,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      rawResponse: response,
    };
  }
}

/**
 * OpenRouter Provider Implementation
 */
export class OpenRouterProvider implements LLMProvider {
  private client: OpenRouterClient;
  private config: LLMProviderConfig;
  private openaiTools: OpenAITool[];

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.client = new OpenRouterClient({
      apiKey: config.apiKey,
    });
    // Convert Anthropic tools to OpenAI format
    this.openaiTools = convertToOpenAITools(config.tools);
  }

  getModel(): string {
    return this.config.model;
  }

  async countTokens(_messages: MessageParam[]): Promise<number> {
    // OpenRouter doesn't have a token counting API
    // Rough estimate: ~4 chars per token for English
    const text = JSON.stringify(_messages);
    return Math.ceil(text.length / 4);
  }

  /**
   * Convert Anthropic message format to OpenAI format
   */
  private convertMessages(messages: MessageParam[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];
    
    // Add system message first
    result.push({
      role: 'system',
      content: this.config.systemPrompt,
    });

    for (const msg of messages) {
      if (msg.role === 'user') {
        // User messages
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Check if this contains tool results
          const toolResults = msg.content.filter(
            (block: any) => block.type === 'tool_result'
          );
          
          if (toolResults.length > 0) {
            // Convert tool results to OpenAI format
            for (const tr of toolResults) {
              const toolResult = tr as any;
              result.push({
                role: 'tool',
                tool_call_id: toolResult.tool_use_id,
                content: typeof toolResult.content === 'string'
                  ? toolResult.content
                  : JSON.stringify(toolResult.content),
              });
            }
          } else {
            // Regular content blocks
            const textContent = msg.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
            if (textContent) {
              result.push({ role: 'user', content: textContent });
            }
          }
        }
      } else if (msg.role === 'assistant') {
        // Assistant messages
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Extract text and tool calls
          const textBlocks = msg.content.filter(
            (block: any) => block.type === 'text'
          );
          const toolUses = msg.content.filter(
            (block: any) => block.type === 'tool_use'
          );

          const textContent = textBlocks.map((b: any) => b.text).join('');
          
          if (toolUses.length > 0) {
            // Message with tool calls
            result.push({
              role: 'assistant',
              content: textContent || null,
              tool_calls: toolUses.map((t: any) => ({
                id: t.id,
                type: 'function' as const,
                function: {
                  name: t.name,
                  arguments: JSON.stringify(t.input),
                },
              })),
            });
          } else {
            result.push({ role: 'assistant', content: textContent });
          }
        }
      }
    }

    return result;
  }

  async chat(messages: MessageParam[]): Promise<LLMResponse> {
    const openaiMessages = this.convertMessages(messages);

    const response = await this.client.createChatCompletion({
      model: this.config.model,
      messages: openaiMessages,
      tools: this.openaiTools.length > 0 ? this.openaiTools : undefined,
      max_tokens: this.config.maxTokens,
    });

    const choice = response.choices[0];
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    
    const cost = calculateOpenRouterCost(
      this.config.model,
      usage.prompt_tokens,
      usage.completion_tokens
    );

    const toolCalls = choice.message.tool_calls ?? [];

    return {
      text: choice.message.content ?? '',
      toolCalls: toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      })),
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      cost,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      rawResponse: response,
    };
  }

  async streamChat(
    messages: MessageParam[],
    callbacks: {
      onText?: (text: string) => void;
      onThinking?: (text: string) => void;
      onToolCall?: (id: string, name: string, input: Record<string, unknown>) => void;
    }
  ): Promise<LLMResponse> {
    const openaiMessages = this.convertMessages(messages);

    let fullText = '';
    const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let finishReason: string | null = null;
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const stream = this.client.createStreamingChatCompletion({
      model: this.config.model,
      messages: openaiMessages,
      tools: this.openaiTools.length > 0 ? this.openaiTools : undefined,
      max_tokens: this.config.maxTokens,
    });

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      // Handle text content
      if (choice.delta.content) {
        fullText += choice.delta.content;
        callbacks.onText?.(choice.delta.content);
      }

      // Handle tool calls being streamed
      if (choice.delta.tool_calls) {
        for (const tcDelta of choice.delta.tool_calls) {
          const existing = toolCallsInProgress.get(tcDelta.index);
          
          if (!existing) {
            // New tool call
            toolCallsInProgress.set(tcDelta.index, {
              id: tcDelta.id ?? '',
              name: tcDelta.function?.name ?? '',
              arguments: tcDelta.function?.arguments ?? '',
            });
          } else {
            // Update existing
            if (tcDelta.id) existing.id = tcDelta.id;
            if (tcDelta.function?.name) existing.name = tcDelta.function.name;
            if (tcDelta.function?.arguments) existing.arguments += tcDelta.function.arguments;
          }
        }
      }

      // Track finish reason
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      // Track usage from the final chunk (some models include this)
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    // Parse completed tool calls with defensive error handling
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const [, tc] of toolCallsInProgress) {
      try {
        // Defensive: ensure we have valid data
        if (!tc || !tc.name) {
          continue;
        }
        
        // Clean up tool name - some models (GLM 4.7) append malformed content to the name
        // e.g., "get_process_output<arg_key>process_id" should become "get_process_output"
        let toolName = tc.name;
        if (toolName.includes('<')) {
          toolName = toolName.split('<')[0];
        }
        if (toolName.includes('(')) {
          toolName = toolName.split('(')[0];
        }
        toolName = toolName.trim();
        
        // Some models send arguments with trailing whitespace or incomplete JSON
        let args = tc.arguments?.trim() || '{}';
        
        // Clean up <arg_key> tags that some models (GLM 4.7) emit
        // e.g., '<arg_key>process_id: 1' -> '{"process_id": 1}'
        if (args.includes('<arg_key>') || args.includes('</arg_key>')) {
          args = args.replace(/<\/?arg_key>/g, '');
          // Try to convert key: value format to JSON
          if (!args.startsWith('{')) {
            const keyValuePairs: string[] = [];
            const kvMatches = args.matchAll(/(\w+):\s*(?:"([^"]+)"|(\d+)|(\w+))/g);
            for (const match of kvMatches) {
              const key = match[1];
              const value = match[2] ?? match[3] ?? match[4];
              if (match[3]) {
                // It's a number
                keyValuePairs.push(`"${key}": ${value}`);
              } else {
                keyValuePairs.push(`"${key}": "${value}"`);
              }
            }
            if (keyValuePairs.length > 0) {
              args = `{${keyValuePairs.join(', ')}}`;
            }
          }
        }
        
        // Try to fix common issues with streamed JSON
        if (args && !args.endsWith('}') && !args.endsWith(']')) {
          // Count braces to determine what's needed
          const openBraces = (args.match(/{/g) || []).length;
          const closeBraces = (args.match(/}/g) || []).length;
          if (openBraces > closeBraces) {
            args = args + '}'.repeat(openBraces - closeBraces);
          }
        }
        
        // Handle empty or malformed args
        if (!args || args === '' || args === 'undefined') {
          args = '{}';
        }
        
        const input = JSON.parse(args);
        const toolId = tc.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        toolCalls.push({ id: toolId, name: toolName, input });
        callbacks.onToolCall?.(toolId, toolName, input);
      } catch (e) {
        // If parsing fails, try to extract arguments from malformed format
        // Some models output: read_file<arg_key>path: "/path"
        // toolName is already cleaned above, but if we get here it might be undefined
        const cleanToolName = tc?.name?.split('<')[0]?.split('(')[0]?.trim() || 'unknown_tool';
        
        // Try to parse key:value pairs from malformed output
        let parsedInput: Record<string, unknown> = {};
        try {
          const argsStr = tc?.arguments || '';
          // Match patterns like: path: "/some/path" or command: "some command"
          const matches = argsStr.matchAll(/(\w+):\s*"([^"]+)"/g);
          for (const match of matches) {
            parsedInput[match[1]] = match[2];
          }
        } catch {
          // Ignore parsing errors
        }
        
        const toolId = tc?.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        toolCalls.push({ id: toolId, name: cleanToolName, input: parsedInput });
        callbacks.onToolCall?.(toolId, cleanToolName, parsedInput);
      }
    }

    const cost = calculateOpenRouterCost(
      this.config.model,
      usage.prompt_tokens,
      usage.completion_tokens
    );

    return {
      text: fullText,
      toolCalls,
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      cost,
      stopReason: finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
    };
  }
}

/**
 * Create an LLM provider based on configuration
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  if (config.provider === 'openrouter') {
    return new OpenRouterProvider(config);
  }
  return new AnthropicProvider(config);
}

