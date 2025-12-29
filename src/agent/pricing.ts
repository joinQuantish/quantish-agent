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
  'claude-opus-4-5-20251101': {
    id: 'claude-opus-4-5-20251101',
    name: 'opus-4.5',
    displayName: 'Claude Opus 4.5',
    pricing: {
      inputPerMTok: 15,
      outputPerMTok: 75,
      cacheWritePerMTok: 18.75,   // 1.25x input
      cacheReadPerMTok: 1.50,   // 0.1x input
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
  'claude-haiku-4-5-20251001': {
    id: 'claude-haiku-4-5-20251001',
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
  'opus': 'claude-opus-4-5-20251101',
  'opus-4.5': 'claude-opus-4-5-20251101',
  'sonnet': 'claude-sonnet-4-5-20250929',
  'sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'haiku': 'claude-haiku-4-5-20251001',
  'haiku-4.5': 'claude-haiku-4-5-20251001',
};

/**
 * Resolve a model alias or ID to the full model ID
 */
export function resolveModelId(nameOrAlias: string): string | null {
  const lower = nameOrAlias.toLowerCase();
  
  // Check if it's already a valid model ID
  if (MODELS[lower]) {
    return lower;
  }
  
  // Check aliases
  if (MODEL_ALIASES[lower]) {
    return MODEL_ALIASES[lower];
  }
  
  // Check if it matches a model name
  for (const [id, config] of Object.entries(MODELS)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  
  return null;
}

/**
 * Get pricing for a model
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  const model = MODELS[modelId];
  return model?.pricing ?? null;
}

/**
 * Get model config
 */
export function getModelConfig(modelId: string): ModelConfig | null {
  return MODELS[modelId] ?? null;
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
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(3)}¢`;
  }
  return `$${cost.toFixed(4)}`;
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

