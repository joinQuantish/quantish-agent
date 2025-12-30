/**
 * Anthropic Model Pricing Configuration
 * 
 * Prices are per million tokens (MTok), updated from Anthropic docs as of Dec 2024.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;  // 1.25x input price for 5-minute cache
  cacheReadPerMTok: number;   // 0.1x input price
}

export interface ModelConfig {
  id: string;
  name: string;
  displayName: string;
  pricing: ModelPricing;
  contextWindow: number;
  description: string;
}

/**
 * Available Claude models with pricing
 */
export const MODELS: Record<string, ModelConfig> = {
  'claude-opus-4-5-20250929': {
    id: 'claude-opus-4-5-20250929',
    name: 'opus-4.5',
    displayName: 'Claude Opus 4.5',
    pricing: {
      inputPerMTok: 5,
      outputPerMTok: 25,
      cacheWritePerMTok: 6.25,   // 1.25x input
      cacheReadPerMTok: 0.50,   // 0.1x input
    },
    contextWindow: 200000,
    description: 'Most capable model. Best for complex reasoning and creative tasks.',
  },
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    name: 'sonnet-4.5',
    displayName: 'Claude Sonnet 4.5',
    pricing: {
      inputPerMTok: 3,
      outputPerMTok: 15,
      cacheWritePerMTok: 3.75,  // 1.25x input
      cacheReadPerMTok: 0.30,  // 0.1x input
    },
    contextWindow: 200000,
    description: 'Balanced performance and cost. Great for most coding and trading tasks.',
  },
  'claude-haiku-4-5-20250929': {
    id: 'claude-haiku-4-5-20250929',
    name: 'haiku-4.5',
    displayName: 'Claude Haiku 4.5',
    pricing: {
      inputPerMTok: 1,
      outputPerMTok: 5,
      cacheWritePerMTok: 1.25,  // 1.25x input
      cacheReadPerMTok: 0.10,  // 0.1x input
    },
    contextWindow: 200000,
    description: 'Fastest and most economical. Good for simple tasks and high volume.',
  },
};

// Default model
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Short aliases for quick model selection
 */
export const MODEL_ALIASES: Record<string, string> = {
  'opus': 'claude-opus-4-5-20250929',
  'opus-4.5': 'claude-opus-4-5-20250929',
  'sonnet': 'claude-sonnet-4-5-20250929',
  'sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'haiku': 'claude-haiku-4-5-20250929',
  'haiku-4.5': 'claude-haiku-4-5-20250929',
};

/**
 * Resolve a model alias or ID to the full model ID (checks both Anthropic and OpenRouter)
 */
export function resolveModelId(nameOrAlias: string): string | null {
  const lower = nameOrAlias.toLowerCase();
  
  // Check if it's already a valid Anthropic model ID
  if (MODELS[lower]) {
    return lower;
  }
  
  // Check Anthropic aliases
  if (MODEL_ALIASES[lower]) {
    return MODEL_ALIASES[lower];
  }
  
  // Check if it matches an Anthropic model name
  for (const [id, config] of Object.entries(MODELS)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  
  // NOTE: Do NOT check OpenRouter models here!
  // The setModel() function in loop.ts expects this function to ONLY return
  // Anthropic models. OpenRouter models are resolved separately via
  // resolveOpenRouterModelId() which also handles the provider auto-switch.
  
  return null;
}

/**
 * Get pricing for a model (checks both Anthropic and OpenRouter)
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  // Check Anthropic models first
  const anthropicModel = MODELS[modelId];
  if (anthropicModel?.pricing) {
    return anthropicModel.pricing;
  }
  
  // Check OpenRouter models
  const openrouterModel = OPENROUTER_MODELS[modelId];
  if (openrouterModel?.pricing) {
    return openrouterModel.pricing;
  }
  
  return null;
}

/**
 * Get model config (checks both Anthropic and OpenRouter)
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return MODELS[modelId] ?? OPENROUTER_MODELS[modelId] ?? null;
}

/**
 * Calculate cost for given token usage
 */
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  totalCost: number;
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0
): CostBreakdown {
  const pricing = getModelPricing(modelId);
  
  if (!pricing) {
    // Default to Sonnet pricing if model not found
    const defaultPricing = MODELS[DEFAULT_MODEL].pricing;
    return calculateCostWithPricing(
      defaultPricing,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens
    );
  }
  
  return calculateCostWithPricing(
    pricing,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens
  );
}

function calculateCostWithPricing(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number
): CostBreakdown {
  // Calculate costs (prices are per million tokens)
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  const cacheWriteCost = (cacheCreationTokens / 1_000_000) * pricing.cacheWritePerMTok;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMTok;
  
  return {
    inputCost,
    outputCost,
    cacheWriteCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost,
  };
}

/**
 * Format cost for display
 * Shows cents for small amounts, dollars for larger
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    // Show in cents (e.g., "0.15¢" for $0.0015)
    const cents = cost * 100;
    return `${cents.toFixed(3)}¢`;
  }
  if (cost < 1) {
    // Show in dollars with 4 decimals (e.g., "$0.0523")
    return `$${cost.toFixed(4)}`;
  }
  // Show in dollars with 2 decimals (e.g., "$1.52")
  return `$${cost.toFixed(2)}`;
}

/**
 * Format a full cost breakdown for display
 */
export function formatCostBreakdown(breakdown: CostBreakdown): string {
  const parts: string[] = [];
  
  if (breakdown.inputCost > 0) {
    parts.push(`Input: ${formatCost(breakdown.inputCost)}`);
  }
  if (breakdown.outputCost > 0) {
    parts.push(`Output: ${formatCost(breakdown.outputCost)}`);
  }
  if (breakdown.cacheWriteCost > 0) {
    parts.push(`Cache Write: ${formatCost(breakdown.cacheWriteCost)}`);
  }
  if (breakdown.cacheReadCost > 0) {
    parts.push(`Cache Read: ${formatCost(breakdown.cacheReadCost)}`);
  }
  
  return `Total: ${formatCost(breakdown.totalCost)} (${parts.join(' | ')})`;
}

/**
 * List all available models for display
 */
export function listModels(): ModelConfig[] {
  return Object.values(MODELS);
}

/**
 * OpenRouter Models Configuration
 */
export const OPENROUTER_MODELS: Record<string, ModelConfig> = {
  'z-ai/glm-4.7': {
    id: 'z-ai/glm-4.7',
    name: 'glm-4.7',
    displayName: 'GLM 4.7',
    pricing: {
      inputPerMTok: 0.40,
      outputPerMTok: 1.50,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0,
    },
    contextWindow: 202752,
    description: 'Z.AI flagship. Enhanced programming, multi-step reasoning, agent tasks.',
  },
  'minimax/minimax-m2.1': {
    id: 'minimax/minimax-m2.1',
    name: 'minimax-m2.1',
    displayName: 'MiniMax M2.1',
    pricing: {
      inputPerMTok: 0.30,
      outputPerMTok: 1.20,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0,
    },
    contextWindow: 204800,
    description: 'Lightweight, optimized for coding and agentic workflows.',
  },
  'deepseek/deepseek-chat': {
    id: 'deepseek/deepseek-chat',
    name: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    pricing: {
      inputPerMTok: 0.14,
      outputPerMTok: 0.28,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0,
    },
    contextWindow: 128000,
    description: 'Ultra-cheap, strong coding and reasoning. Great for high-volume.',
  },
  'google/gemini-2.0-flash-001': {
    id: 'google/gemini-2.0-flash-001',
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    pricing: {
      inputPerMTok: 0.10,
      outputPerMTok: 0.40,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0,
    },
    contextWindow: 1000000,
    description: 'Google\'s fast multimodal model. 1M context window.',
  },
  'qwen/qwen-2.5-coder-32b-instruct': {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'qwen-coder-32b',
    displayName: 'Qwen 2.5 Coder 32B',
    pricing: {
      inputPerMTok: 0.18,
      outputPerMTok: 0.18,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0,
    },
    contextWindow: 32768,
    description: 'Alibaba\'s coding specialist. Excellent for code generation.',
  },
};

/**
 * OpenRouter model aliases
 */
export const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  'glm': 'z-ai/glm-4.7',
  'glm-4.7': 'z-ai/glm-4.7',
  'minimax': 'minimax/minimax-m2.1',
  'deepseek': 'deepseek/deepseek-chat',
  'gemini': 'google/gemini-2.0-flash-001',
  'gemini-flash': 'google/gemini-2.0-flash-001',
  'qwen': 'qwen/qwen-2.5-coder-32b-instruct',
  'qwen-coder': 'qwen/qwen-2.5-coder-32b-instruct',
};

/**
 * Resolve an OpenRouter model alias or ID
 */
export function resolveOpenRouterModelId(nameOrAlias: string): string | null {
  const lower = nameOrAlias.toLowerCase();
  
  // Check if it's already a valid model ID
  if (OPENROUTER_MODELS[lower]) {
    return lower;
  }
  
  // Check aliases
  if (OPENROUTER_MODEL_ALIASES[lower]) {
    return OPENROUTER_MODEL_ALIASES[lower];
  }
  
  // Check if it matches a model name
  for (const [id, config] of Object.entries(OPENROUTER_MODELS)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  
  // For OpenRouter, also accept full model paths directly
  if (nameOrAlias.includes('/')) {
    return nameOrAlias;
  }
  
  return null;
}

/**
 * Get OpenRouter model config
 */
export function getOpenRouterModelConfig(modelId: string): ModelConfig | null {
  return OPENROUTER_MODELS[modelId] ?? null;
}

/**
 * Get OpenRouter model pricing
 */
export function getOpenRouterModelPricing(modelId: string): ModelPricing | null {
  const model = OPENROUTER_MODELS[modelId];
  return model?.pricing ?? null;
}

/**
 * List all available OpenRouter models
 */
export function listOpenRouterModels(): ModelConfig[] {
  return Object.values(OPENROUTER_MODELS);
}



