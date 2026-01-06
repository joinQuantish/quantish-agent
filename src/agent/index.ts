export { Agent, createAgent } from './loop.js';
export type { AgentConfig, AgentResult, TokenUsage, ContextEditConfig } from './loop.js';
export { formatHistory, truncate, formatJSON, extractText } from './messages.js';
export { compactConversation, COMPACTION_PROMPT } from './compaction.js';
export type { CompactionResult } from './compaction.js';
export {
  MODELS,
  DEFAULT_MODEL,
  MODEL_ALIASES,
  resolveModelId,
  getModelConfig,
  getModelPricing,
  calculateCost,
  formatCost,
  formatCostBreakdown,
  listModels,
} from './pricing.js';
export type { ModelConfig, ModelPricing, CostBreakdown } from './pricing.js';

// Result compression module
export {
  compressToolResult,
  truncateToolResult,
  needsCompression,
  DEFAULTS as COMPRESSION_DEFAULTS,
} from './result-compression.js';
export type { CompressionResult, CompressionConfig } from './result-compression.js';

// Sub-agent delegation module
export {
  runSubAgent,
  filterToolsForSubAgent,
  createDelegateResearchTool,
  executeDelegateResearch,
  DEFAULT_ALLOWED_TOOLS,
  BLOCKED_TOOLS,
  THOROUGHNESS_CONFIG,
} from './sub-agent.js';
export type { SubAgentTask, SubAgentResult, ThoroughnessLevel } from './sub-agent.js';

