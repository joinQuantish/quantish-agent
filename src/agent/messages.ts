/**
 * Message formatting utilities
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Format conversation history for display
 */
export function formatHistory(history: MessageParam[]): string {
  return history
    .map((msg) => {
      const role = msg.role === 'user' ? 'You' : 'Assistant';
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : JSON.stringify(msg.content, null, 2);
      return `${role}: ${content}`;
    })
    .join('\n\n');
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format JSON for display
 */
export function formatJSON(data: unknown, indent = 2): string {
  try {
    return JSON.stringify(data, null, indent);
  } catch {
    return String(data);
  }
}

/**
 * Extract plain text from message content
 */
export function extractText(content: MessageParam['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: 'text'; text: string } => 
        typeof block === 'object' && block !== null && 'type' in block && block.type === 'text'
      )
      .map((block) => block.text)
      .join('\n');
  }
  
  return '';
}










