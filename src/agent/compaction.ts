/**
 * Compaction Module
 * 
 * Implements conversation compaction to reduce token usage.
 * Based on Anthropic's recommended compaction approach:
 * https://docs.anthropic.com/en/docs/build-with-claude/context-editing
 * 
 * When context grows too large, the conversation is summarized
 * into a structured summary that preserves key information while
 * dramatically reducing token count.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

export interface CompactionResult {
  success: boolean;
  summary?: string;
  originalTokenCount: number;
  newTokenCount: number;
  error?: string;
}

/**
 * The default compaction prompt based on Anthropic's recommended structure.
 * This prompt asks Claude to create a structured summary that preserves
 * all critical information needed to continue the conversation.
 */
export const COMPACTION_PROMPT = `Your context window is filling up. Please create a concise summary of our conversation so far that will allow you to continue working effectively.

The summary should be wrapped in <summary></summary> tags and include:

# Task Overview
- The user's core request and goals
- Success criteria and constraints
- Any specific preferences mentioned

# Current State
- What has been completed so far
- Files created or modified (with paths)
- Artifacts or outputs produced
- Current working directory if relevant

# Important Discoveries
- Technical constraints or requirements found
- Key decisions made and why
- Errors encountered and how they were resolved
- Approaches that didn't work (to avoid repeating)

# Next Steps
- Specific actions still needed
- Priority order if multiple steps remain
- Any blockers or dependencies

# Context to Preserve
- User preferences or style requirements
- Domain-specific details that matter
- Any commitments or promises made

Be thorough but concise. The goal is to capture everything needed to continue seamlessly, while reducing token usage significantly.`;

/**
 * Parse a compacted summary from Claude's response.
 * Extracts content between <summary></summary> tags.
 */
export function parseCompactedSummary(response: string): string | null {
  const match = response.match(/<summary>([\s\S]*?)<\/summary>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  // If no tags, assume the whole response is the summary
  return response.trim() || null;
}

/**
 * Create a compacted summary from conversation history.
 * 
 * @param anthropic - Anthropic client instance
 * @param history - Current conversation history
 * @param model - Model to use for summarization (can use cheaper model)
 * @param customPrompt - Optional custom compaction prompt
 * @returns The summary text
 */
export async function createCompactedSummary(
  anthropic: Anthropic,
  history: MessageParam[],
  model: string = 'claude-sonnet-4-5-20250929',
  customPrompt?: string
): Promise<string> {
  const prompt = customPrompt || COMPACTION_PROMPT;
  
  // Create a new message array with the compaction request
  const compactionMessages: MessageParam[] = [
    ...history,
    {
      role: 'user',
      content: prompt,
    },
  ];

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: compactionMessages,
  });

  // Extract text from response
  const textBlocks = response.content.filter(block => block.type === 'text');
  const fullText = textBlocks.map(block => (block as any).text).join('\n');

  // Parse the summary
  const summary = parseCompactedSummary(fullText);
  if (!summary) {
    throw new Error('Failed to parse compacted summary from response');
  }

  return summary;
}

/**
 * Create a new conversation history from a summary.
 * The summary becomes the first assistant message.
 */
export function historyFromSummary(summary: string): MessageParam[] {
  return [
    {
      role: 'assistant',
      content: summary,
    },
  ];
}

/**
 * Compact a conversation history.
 * 
 * This function:
 * 1. Counts tokens in current history
 * 2. Generates a summary using Claude
 * 3. Creates new history from the summary
 * 4. Returns both old and new token counts
 * 
 * @param anthropic - Anthropic client
 * @param history - Current conversation history  
 * @param model - Model to use
 * @param systemPrompt - System prompt (needed for token counting)
 * @param tools - Tool definitions (needed for token counting)
 */
export async function compactConversation(
  anthropic: Anthropic,
  history: MessageParam[],
  model: string,
  systemPrompt: string,
  tools: any[]
): Promise<{
  newHistory: MessageParam[];
  summary: string;
  originalTokens: number;
  newTokens: number;
}> {
  // Count original tokens
  let originalTokens = 0;
  try {
    const countResult = await anthropic.messages.countTokens({
      model,
      system: systemPrompt,
      tools,
      messages: history,
    });
    originalTokens = countResult.input_tokens;
  } catch (e) {
    // Estimate based on content length if counting fails
    const contentLength = JSON.stringify(history).length;
    originalTokens = Math.ceil(contentLength / 4); // Rough estimate
  }

  // Generate summary (can use a faster/cheaper model for this)
  const summaryModel = 'claude-sonnet-4-5-20250929'; // Could use Haiku for cost savings
  const summary = await createCompactedSummary(anthropic, history, summaryModel);

  // Create new history from summary
  const newHistory = historyFromSummary(summary);

  // Count new tokens
  let newTokens = 0;
  try {
    const countResult = await anthropic.messages.countTokens({
      model,
      system: systemPrompt,
      tools,
      messages: newHistory,
    });
    newTokens = countResult.input_tokens;
  } catch (e) {
    const contentLength = JSON.stringify(newHistory).length;
    newTokens = Math.ceil(contentLength / 4);
  }

  return {
    newHistory,
    summary,
    originalTokens,
    newTokens,
  };
}





