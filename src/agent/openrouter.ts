/**
 * OpenRouter Provider
 * 
 * Provides integration with OpenRouter's OpenAI-compatible API,
 * enabling access to many LLM providers (MiniMax, DeepSeek, Mistral, etc.)
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

// OpenRouter base URL
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter model configuration with pricing
 */
export interface OpenRouterModelConfig {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  pricing: {
    inputPerMTok: number;  // USD per million tokens
    outputPerMTok: number;
    cacheReadPerMTok?: number;
    cacheWritePerMTok?: number;
  };
  contextWindow: number;
  maxOutputTokens?: number;
  supportsTools: boolean;
  supportsReasoning?: boolean;
  description: string;
}

/**
 * Popular OpenRouter models with pricing
 * Prices are converted from per-token to per-MTok for consistency with Anthropic pricing
 */
export const OPENROUTER_MODELS: Record<string, OpenRouterModelConfig> = {
  // Z.AI GLM models
  'z-ai/glm-4.7': {
    id: 'z-ai/glm-4.7',
    name: 'glm-4.7',
    displayName: 'GLM 4.7',
    provider: 'Z.AI',
    pricing: {
      inputPerMTok: 0.40,
      outputPerMTok: 1.50,
    },
    contextWindow: 202752,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Z.AI flagship. Enhanced programming, multi-step reasoning, agent tasks.',
  },

  // MiniMax models - very cost effective
  'minimax/minimax-m2.1': {
    id: 'minimax/minimax-m2.1',
    name: 'minimax-m2.1',
    displayName: 'MiniMax M2.1',
    provider: 'MiniMax',
    pricing: {
      inputPerMTok: 0.30,    // $0.0000003 * 1M
      outputPerMTok: 1.20,   // $0.0000012 * 1M
      cacheReadPerMTok: 0.03,
      cacheWritePerMTok: 0.375,
    },
    contextWindow: 204800,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsReasoning: true,
    description: '10B active params, state-of-the-art for coding and agentic workflows. Very cost efficient.',
  },
  'minimax/minimax-m2': {
    id: 'minimax/minimax-m2',
    name: 'minimax-m2',
    displayName: 'MiniMax M2',
    provider: 'MiniMax',
    pricing: {
      inputPerMTok: 0.20,
      outputPerMTok: 1.00,
      cacheReadPerMTok: 0.03,
    },
    contextWindow: 196608,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Compact model optimized for end-to-end coding and agentic workflows.',
  },

  // DeepSeek models - very cheap
  'deepseek/deepseek-v3.2': {
    id: 'deepseek/deepseek-v3.2',
    name: 'deepseek-v3.2',
    displayName: 'DeepSeek V3.2',
    provider: 'DeepSeek',
    pricing: {
      inputPerMTok: 0.224,
      outputPerMTok: 0.32,
    },
    contextWindow: 163840,
    supportsTools: true,
    supportsReasoning: true,
    description: 'High efficiency with strong reasoning. GPT-5 class performance.',
  },

  // Mistral models
  'mistralai/devstral-2512': {
    id: 'mistralai/devstral-2512',
    name: 'devstral-2512',
    displayName: 'Devstral 2 2512',
    provider: 'Mistral',
    pricing: {
      inputPerMTok: 0.05,
      outputPerMTok: 0.22,
    },
    contextWindow: 262144,
    supportsTools: true,
    description: 'State-of-the-art open model for agentic coding. 123B params.',
  },
  'mistralai/mistral-large-2512': {
    id: 'mistralai/mistral-large-2512',
    name: 'mistral-large-2512',
    displayName: 'Mistral Large 3',
    provider: 'Mistral',
    pricing: {
      inputPerMTok: 0.50,
      outputPerMTok: 1.50,
    },
    contextWindow: 262144,
    supportsTools: true,
    description: 'Most capable Mistral model. 675B total params (41B active).',
  },

  // Google Gemini
  'google/gemini-3-flash-preview': {
    id: 'google/gemini-3-flash-preview',
    name: 'gemini-3-flash',
    displayName: 'Gemini 3 Flash Preview',
    provider: 'Google',
    pricing: {
      inputPerMTok: 0.50,
      outputPerMTok: 3.00,
      cacheReadPerMTok: 0.05,
    },
    contextWindow: 1048576,
    supportsTools: true,
    supportsReasoning: true,
    description: 'High speed thinking model for agentic workflows. 1M context.',
  },
  'google/gemini-3-pro-preview': {
    id: 'google/gemini-3-pro-preview',
    name: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro Preview',
    provider: 'Google',
    pricing: {
      inputPerMTok: 2.00,
      outputPerMTok: 12.00,
      cacheReadPerMTok: 0.20,
      cacheWritePerMTok: 2.375,
    },
    contextWindow: 1048576,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Flagship frontier model for high-precision multimodal reasoning.',
  },

  // xAI Grok
  'x-ai/grok-4.1-fast': {
    id: 'x-ai/grok-4.1-fast',
    name: 'grok-4.1-fast',
    displayName: 'Grok 4.1 Fast',
    provider: 'xAI',
    pricing: {
      inputPerMTok: 0.20,
      outputPerMTok: 0.50,
      cacheReadPerMTok: 0.05,
    },
    contextWindow: 2000000,
    maxOutputTokens: 30000,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Best agentic tool calling model. 2M context window.',
  },

  // Anthropic via OpenRouter (for fallback/comparison)
  'anthropic/claude-opus-4.5': {
    id: 'anthropic/claude-opus-4.5',
    name: 'claude-opus-4.5-or',
    displayName: 'Claude Opus 4.5 (OR)',
    provider: 'Anthropic',
    pricing: {
      inputPerMTok: 5.00,
      outputPerMTok: 25.00,
      cacheReadPerMTok: 0.50,
      cacheWritePerMTok: 6.25,
    },
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Anthropic Opus 4.5 via OpenRouter.',
  },
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    name: 'claude-haiku-4.5-or',
    displayName: 'Claude Haiku 4.5 (OR)',
    provider: 'Anthropic',
    pricing: {
      inputPerMTok: 1.00,
      outputPerMTok: 5.00,
      cacheReadPerMTok: 0.10,
      cacheWritePerMTok: 1.25,
    },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Anthropic Haiku 4.5 via OpenRouter. Fast and efficient.',
  },

  // Free models (for testing/experimentation)
  'mistralai/devstral-2512:free': {
    id: 'mistralai/devstral-2512:free',
    name: 'devstral-free',
    displayName: 'Devstral 2 (Free)',
    provider: 'Mistral',
    pricing: {
      inputPerMTok: 0,
      outputPerMTok: 0,
    },
    contextWindow: 262144,
    supportsTools: true,
    description: 'Free tier Devstral for testing. Limited capacity.',
  },
  'xiaomi/mimo-v2-flash:free': {
    id: 'xiaomi/mimo-v2-flash:free',
    name: 'mimo-v2-flash-free',
    displayName: 'MiMo V2 Flash (Free)',
    provider: 'Xiaomi',
    pricing: {
      inputPerMTok: 0,
      outputPerMTok: 0,
    },
    contextWindow: 262144,
    supportsTools: true,
    supportsReasoning: true,
    description: 'Free MoE model. Top open-source on SWE-bench.',
  },
};

/**
 * OpenRouter model aliases for quick selection
 */
export const OPENROUTER_ALIASES: Record<string, string> = {
  // Z.AI GLM
  'glm': 'z-ai/glm-4.7',
  'glm-4.7': 'z-ai/glm-4.7',
  
  // MiniMax
  'minimax': 'minimax/minimax-m2.1',
  'm2': 'minimax/minimax-m2',
  'm2.1': 'minimax/minimax-m2.1',
  
  // DeepSeek  
  'deepseek': 'deepseek/deepseek-v3.2',
  'ds': 'deepseek/deepseek-v3.2',
  
  // Mistral
  'devstral': 'mistralai/devstral-2512',
  'mistral': 'mistralai/mistral-large-2512',
  'mistral-large': 'mistralai/mistral-large-2512',
  
  // Google
  'gemini': 'google/gemini-3-flash-preview',
  'gemini-flash': 'google/gemini-3-flash-preview',
  'gemini-pro': 'google/gemini-3-pro-preview',
  
  // xAI
  'grok': 'x-ai/grok-4.1-fast',
  
  // Anthropic via OR
  'opus-or': 'anthropic/claude-opus-4.5',
  'haiku-or': 'anthropic/claude-haiku-4.5',
  
  // Free
  'free': 'mistralai/devstral-2512:free',
  'mimo': 'xiaomi/mimo-v2-flash:free',
};

/**
 * Resolve an OpenRouter model alias or ID to the full model ID
 */
export function resolveOpenRouterModelId(nameOrAlias: string): string | null {
  const lower = nameOrAlias.toLowerCase();
  
  // Check if it's already a valid model ID
  if (OPENROUTER_MODELS[lower]) {
    return lower;
  }
  
  // Check aliases
  if (OPENROUTER_ALIASES[lower]) {
    return OPENROUTER_ALIASES[lower];
  }
  
  // Check if it matches a model name
  for (const [id, config] of Object.entries(OPENROUTER_MODELS)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  
  // For OpenRouter, we allow any model ID even if not in our list
  // since they have many models we don't track
  if (nameOrAlias.includes('/')) {
    return nameOrAlias;
  }
  
  return null;
}

/**
 * Get OpenRouter model config
 */
export function getOpenRouterModelConfig(modelId: string): OpenRouterModelConfig | null {
  return OPENROUTER_MODELS[modelId] ?? null;
}

/**
 * OpenAI-format tool definition (used by OpenRouter)
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert Anthropic tools to OpenAI format for OpenRouter
 */
export function convertToOpenAITools(anthropicTools: Tool[]): OpenAITool[] {
  return anthropicTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema,
    },
  }));
}

/**
 * OpenAI-format message
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * OpenAI-format tool call
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenRouter chat completion response
 */
export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter streaming chunk
 */
export interface OpenRouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter generation details (from /api/v1/generation endpoint)
 */
export interface OpenRouterGenerationDetails {
  id: string;
  model: string;
  object: string;
  created: number;
  total_cost: number;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  native_tokens_reasoning?: number;
  cache_discount?: number;
  tokens_prompt: number;
  tokens_completion: number;
}

/**
 * OpenRouter API Client
 */
export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private appName: string;
  private appUrl: string;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    appName?: string;
    appUrl?: string;
  }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? OPENROUTER_BASE_URL;
    this.appName = config.appName ?? 'Quantish Agent';
    this.appUrl = config.appUrl ?? 'https://quantish.ai';
  }

  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(options: {
    model: string;
    messages: OpenAIMessage[];
    tools?: OpenAITool[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: false;
  }): Promise<OpenRouterResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.appUrl,
        'X-Title': this.appName,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tool_choice ?? (options.tools ? 'auto' : undefined),
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Create a streaming chat completion
   */
  async *createStreamingChatCompletion(options: {
    model: string;
    messages: OpenAIMessage[];
    tools?: OpenAITool[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
  }): AsyncGenerator<OpenRouterStreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.appUrl,
        'X-Title': this.appName,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tool_choice ?? (options.tools ? 'auto' : undefined),
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            yield json;
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get generation details including exact cost
   */
  async getGenerationDetails(generationId: string): Promise<OpenRouterGenerationDetails> {
    const response = await fetch(`${this.baseUrl}/generation?id=${generationId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * List available models
   */
  async listModels(): Promise<{ data: Array<{ id: string; name: string; pricing: { prompt: string; completion: string } }> }> {
    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}

/**
 * Calculate cost for OpenRouter usage
 */
export function calculateOpenRouterCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheWriteTokens: number = 0
): { inputCost: number; outputCost: number; cacheReadCost: number; cacheWriteCost: number; totalCost: number } {
  // Try to get config - first try exact match, then lowercase
  let config = getOpenRouterModelConfig(modelId);
  
  if (!config) {
    // Try lowercase match
    config = getOpenRouterModelConfig(modelId.toLowerCase());
  }
  
  if (!config) {
    // Try to find by partial match or alias
    const lower = modelId.toLowerCase();
    for (const [key, model] of Object.entries(OPENROUTER_MODELS)) {
      if (key.toLowerCase() === lower || model.name.toLowerCase() === lower) {
        config = model;
        break;
      }
    }
    
    // Check aliases
    if (!config && OPENROUTER_ALIASES[lower]) {
      config = OPENROUTER_MODELS[OPENROUTER_ALIASES[lower]];
    }
  }
  
  // Use found pricing or cheap fallback for unknown models
  // Default to GLM 4.7 pricing as fallback (most common model)
  const pricing = config?.pricing ?? {
    inputPerMTok: 0.40,  // GLM 4.7 pricing as fallback
    outputPerMTok: 1.50,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
  };

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * (pricing.cacheReadPerMTok ?? 0);
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * (pricing.cacheWritePerMTok ?? 0);

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

/**
 * List all available OpenRouter models for display
 */
export function listOpenRouterModels(): OpenRouterModelConfig[] {
  return Object.values(OPENROUTER_MODELS);
}

