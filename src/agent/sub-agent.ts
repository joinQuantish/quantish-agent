/**
 * Sub-Agent Delegation Module
 *
 * Enables delegating tasks to sub-agents with isolated context.
 * Sub-agents can perform complex research without polluting the main context.
 * Only the summary returns to the main agent.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { MCPClientManager } from '../mcp/client.js';
import type { AgentConfig, AgentResult, TokenUsage } from './loop.js';

export type ThoroughnessLevel = 'quick' | 'medium' | 'thorough';

export interface SubAgentTask {
  description: string;
  thoroughness?: ThoroughnessLevel;
  allowedToolPatterns?: string[]; // Glob patterns for allowed tools
  maxIterations?: number;
  maxTokens?: number;
}

export interface SubAgentResult {
  summary: string;
  success: boolean;
  error?: string;
  tokensUsed: number;
  toolsUsed: string[];
  iterations: number;
}

/**
 * Configuration for sub-agent based on thoroughness
 */
const THOROUGHNESS_CONFIG: Record<ThoroughnessLevel, { maxIterations: number; maxTokens: number; prompt: string }> = {
  quick: {
    maxIterations: 3,
    maxTokens: 2048,
    prompt: 'Be concise. Find the answer quickly with minimal tool calls.',
  },
  medium: {
    maxIterations: 8,
    maxTokens: 4096,
    prompt: 'Be thorough but efficient. Explore multiple sources if needed.',
  },
  thorough: {
    maxIterations: 15,
    maxTokens: 8192,
    prompt: 'Be comprehensive. Explore all relevant sources and provide detailed findings.',
  },
};

/**
 * Default allowed tools for sub-agents (safe, read-only operations)
 */
const DEFAULT_ALLOWED_TOOLS = [
  // Market discovery (read-only)
  'search_markets',
  'get_market_details',
  'get_trending_markets',
  'get_categories',
  'get_market_stats',
  'find_arbitrage',
  // File system (read-only)
  'read_file',
  'list_dir',
  'file_exists',
  'workspace_summary',
  // Search (read-only)
  'grep',
  'find_files',
  // Web (read-only)
  'web_search',
  'fetch_url',
];

/**
 * Tools that sub-agents should NOT have access to (write/modify operations)
 */
const BLOCKED_TOOLS = [
  'write_file',
  'edit_file',
  'delete_file',
  'run_command',
  'start_background_process',
  'stop_process',
  'git_add',
  'git_commit',
  'place_order',
  'cancel_order',
  // Any trading/wallet operations
];

/**
 * Filter tools for sub-agent based on allowed patterns
 */
export function filterToolsForSubAgent(
  allTools: Tool[],
  allowedPatterns?: string[]
): Tool[] {
  const patterns = allowedPatterns || DEFAULT_ALLOWED_TOOLS;

  return allTools.filter(tool => {
    // Block dangerous tools
    if (BLOCKED_TOOLS.includes(tool.name)) {
      return false;
    }

    // Check if tool matches allowed patterns
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob matching
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(tool.name);
      }
      return tool.name === pattern;
    });
  });
}

/**
 * Build the sub-agent system prompt
 */
function buildSubAgentPrompt(task: SubAgentTask): string {
  const config = THOROUGHNESS_CONFIG[task.thoroughness || 'medium'];

  return `You are a research sub-agent. Your task is to complete the following and return a CONCISE summary.

## Task
${task.description}

## Instructions
${config.prompt}

## Output Requirements
- Return a clear, structured summary of your findings
- Include specific data points (prices, IDs, names) when relevant
- Do NOT include raw tool outputs - summarize them
- Be concise but complete
- If you cannot find the information, say so clearly

## Important
- You are running in an isolated context
- Your summary will be returned to the main agent
- Focus on answering the task, not explaining your process`;
}

/**
 * Run a sub-agent task
 *
 * This creates an isolated agent instance that performs the task
 * and returns only a summary to the main context.
 */
export async function runSubAgent(
  task: SubAgentTask,
  config: {
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    provider?: 'anthropic' | 'openrouter';
    model?: string;
    mcpClientManager?: MCPClientManager;
    allTools: Tool[];
  }
): Promise<SubAgentResult> {
  // Dynamic import to avoid circular dependency
  const { Agent } = await import('./loop.js');

  const thoroughnessConfig = THOROUGHNESS_CONFIG[task.thoroughness || 'medium'];

  // Filter tools for sub-agent
  const allowedTools = filterToolsForSubAgent(config.allTools, task.allowedToolPatterns);

  // Sub-agents should use Claude Haiku 4.5 for speed and large context (200k)
  // If using OpenRouter, use Haiku via OpenRouter
  // If using Anthropic directly, use Haiku directly
  const isOpenRouter = config.provider === 'openrouter';
  const subAgentModel = isOpenRouter
    ? 'anthropic/claude-haiku-4.5'  // Haiku 4.5 via OpenRouter - 200k context
    : 'claude-haiku-4-5-20250514';  // Haiku 4.5 direct - 200k context
  const subAgentProvider = config.provider || 'anthropic';

  // Create isolated agent with ONLY filtered tools (no MCP tools to avoid context bloat)
  // Sub-agents use only local tools (file, search) - no market tools
  const subAgent = new Agent({
    anthropicApiKey: config.anthropicApiKey,
    openrouterApiKey: config.openrouterApiKey,
    provider: subAgentProvider || 'anthropic',
    model: subAgentModel,
    mcpClientManager: undefined,  // No MCP - keeps context small
    maxIterations: task.maxIterations || thoroughnessConfig.maxIterations,
    maxTokens: task.maxTokens || thoroughnessConfig.maxTokens,
    systemPrompt: buildSubAgentPrompt(task),
    enableLocalTools: true,  // File reading, grep, etc.
    enableMCPTools: false,   // NO MCP tools - they're too large
    enableSubAgents: false,  // Prevent recursive sub-agents
    enableResultCompression: false,
    streaming: false,
  });

  const toolsUsed: string[] = [];

  try {
    // Run the sub-agent
    const result = await subAgent.run(task.description);

    // Collect tools used
    for (const tc of result.toolCalls) {
      if (!toolsUsed.includes(tc.name)) {
        toolsUsed.push(tc.name);
      }
    }

    return {
      summary: result.text || 'No summary generated',
      success: true,
      tokensUsed: result.tokenUsage.totalTokens,
      toolsUsed,
      iterations: result.iterations,
    };
  } catch (error) {
    return {
      summary: '',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tokensUsed: 0,
      toolsUsed,
      iterations: 0,
    };
  }
}

/**
 * Create a tool definition for delegating research to sub-agents
 */
export function createDelegateResearchTool(): Tool {
  return {
    name: 'delegate_research',
    description: `Delegate a research task to a sub-agent with isolated context.

Use this when you need to:
- Search for information across multiple markets
- Explore files or code without cluttering main context
- Perform complex analysis that requires many tool calls
- Gather information that doesn't all need to stay in context

The sub-agent will:
- Run in isolated context (doesn't affect your main conversation)
- Have access to read-only tools (search, read, etc.)
- Return only a summary of findings

Thoroughness levels:
- quick: 3 iterations max, fast answers
- medium: 8 iterations, balanced exploration (default)
- thorough: 15 iterations, comprehensive research`,
    input_schema: {
      type: 'object' as const,
      properties: {
        task: {
          type: 'string',
          description: 'The research task to delegate. Be specific about what information you need.',
        },
        thoroughness: {
          type: 'string',
          enum: ['quick', 'medium', 'thorough'],
          description: 'How thorough the research should be. Default: medium',
        },
      },
      required: ['task'],
    },
  };
}

/**
 * Execute the delegate_research tool
 */
export async function executeDelegateResearch(
  args: { task: string; thoroughness?: ThoroughnessLevel },
  config: {
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    provider?: 'anthropic' | 'openrouter';
    model?: string;
    mcpClientManager?: MCPClientManager;
    allTools: Tool[];
  }
): Promise<SubAgentResult> {
  return runSubAgent(
    {
      description: args.task,
      thoroughness: args.thoroughness || 'medium',
    },
    config
  );
}

// Export for use in tool definitions
export { DEFAULT_ALLOWED_TOOLS, BLOCKED_TOOLS, THOROUGHNESS_CONFIG };
