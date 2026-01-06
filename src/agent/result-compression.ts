/**
 * Result Compression Module
 *
 * Compresses large tool results using LLM-based summarization to prevent context explosion
 * while preserving critical data (market prices, IDs, etc.)
 */

import Anthropic from '@anthropic-ai/sdk';

// Thresholds
const COMPRESSION_THRESHOLD = 15000; // chars - compress if larger
const TARGET_SIZE = 5000; // chars - target compressed size
const MAX_OUTPUT_SIZE = 30000; // chars - hard cap on any tool output

export interface CompressionResult {
  content: string;  // The final content (compressed or original)
  wasCompressed: boolean;
  wasTruncated: boolean;
  originalSize: number;
  finalSize: number;
  metadata?: {
    compressionRatio: number;
    method: 'none' | 'llm' | 'truncate';
  };
}

export interface CompressionConfig {
  enabled: boolean;
  threshold?: number;
  targetSize?: number;
  maxSize?: number;
}

/**
 * Tool-specific compression prompts for better summaries
 */
const TOOL_COMPRESSION_PROMPTS: Record<string, string> = {
  search_markets: `Compress market search results into a markdown table. CRITICAL: Preserve ALL of these for each market:
- Market title (full)
- Platform (Polymarket/Kalshi)
- Price/Probability (Yes and No prices)
- Market ID

Format as: | Market | Platform | Yes Price | No Price | ID |`,

  get_market_details: `Summarize this market detail. Preserve:
- Market title and description (brief)
- Current prices (Yes/No)
- Volume and liquidity
- Key dates
- Market ID`,

  find_arbitrage: `Summarize arbitrage opportunities as a table:
| Market | Buy Platform | Buy Price | Sell Platform | Sell Price | Profit % |

Keep top 10 opportunities by profit margin.`,

  read_file: `Summarize this file content. Note:
- File path and type
- Key sections/functions
- Line count
- Important code patterns or configurations`,

  grep: `Summarize search results:
- Number of matches found
- Files with matches (list top 10)
- Sample matching lines (3-5 examples)`,

  default: `Compress this tool result while preserving:
- All IDs and identifiers
- Numeric values (prices, counts, sizes)
- Status information
- Key data points the user needs to see

Be concise but don't lose critical information.`,
};

/**
 * Get the appropriate compression prompt for a tool
 */
function getCompressionPrompt(toolName: string): string {
  return TOOL_COMPRESSION_PROMPTS[toolName] || TOOL_COMPRESSION_PROMPTS.default;
}

/**
 * Truncate content to max size with indicator
 */
function truncateContent(content: string, maxSize: number): { content: string; truncated: boolean } {
  if (content.length <= maxSize) {
    return { content, truncated: false };
  }

  const truncated = content.slice(0, maxSize - 50) + '\n\n...[TRUNCATED - ' + (content.length - maxSize) + ' chars removed]';
  return { content: truncated, truncated: true };
}

/**
 * Compress a tool result if it exceeds the threshold
 *
 * @param toolName - Name of the tool that produced the result
 * @param result - The tool result to potentially compress
 * @param client - Anthropic client for LLM compression
 * @param config - Optional compression configuration
 */
export async function compressToolResult(
  toolName: string,
  result: unknown,
  client?: Anthropic,
  config?: Partial<CompressionConfig>
): Promise<CompressionResult> {
  const threshold = config?.threshold ?? COMPRESSION_THRESHOLD;
  const targetSize = config?.targetSize ?? TARGET_SIZE;
  const maxSize = config?.maxSize ?? MAX_OUTPUT_SIZE;
  const enabled = config?.enabled ?? true;

  // Convert result to string
  const resultStr = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);

  const originalSize = resultStr.length;

  // Step 1: Hard truncation if exceeds max size (safety net)
  if (originalSize > maxSize) {
    const { content, truncated } = truncateContent(resultStr, maxSize);

    // If we can't compress with LLM, just return truncated
    if (!enabled || !client) {
      return {
        content,
        wasCompressed: false,
        wasTruncated: truncated,
        originalSize,
        finalSize: content.length,
        metadata: {
          compressionRatio: content.length / originalSize,
          method: 'truncate',
        },
      };
    }
  }

  // Step 2: If under threshold or compression disabled, return as-is (with potential truncation)
  if (originalSize <= threshold || !enabled) {
    const { content, truncated } = truncateContent(resultStr, maxSize);
    return {
      content,
      wasCompressed: false,
      wasTruncated: truncated,
      originalSize,
      finalSize: content.length,
      metadata: {
        compressionRatio: content.length / originalSize,
        method: truncated ? 'truncate' : 'none',
      },
    };
  }

  // Step 3: If no client, fall back to truncation
  if (!client) {
    const { content, truncated } = truncateContent(resultStr, maxSize);
    return {
      content,
      wasCompressed: false,
      wasTruncated: true,
      originalSize,
      finalSize: content.length,
      metadata: {
        compressionRatio: content.length / originalSize,
        method: 'truncate',
      },
    };
  }

  // Step 4: LLM-based compression
  try {
    const compressionPrompt = getCompressionPrompt(toolName);

    // Truncate input to LLM if too large (50k char limit for prompt)
    const maxInputForLLM = 50000;
    const inputForLLM = resultStr.length > maxInputForLLM
      ? resultStr.slice(0, maxInputForLLM) + '\n\n...[Input truncated for compression]'
      : resultStr;

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022', // Use fast/cheap model for compression
      max_tokens: Math.min(targetSize / 3, 2000), // Roughly 3 chars per token
      messages: [{
        role: 'user',
        content: `${compressionPrompt}

Target size: ~${targetSize} characters

Data to compress:
\`\`\`
${inputForLLM}
\`\`\``,
      }],
    });

    const compressed = response.content[0].type === 'text'
      ? response.content[0].text
      : resultStr.slice(0, targetSize);

    // Final safety truncation
    const { content: finalContent, truncated: finalTruncated } = truncateContent(compressed, maxSize);

    return {
      content: finalContent,
      wasCompressed: true,
      wasTruncated: finalTruncated,
      originalSize,
      finalSize: finalContent.length,
      metadata: {
        compressionRatio: finalContent.length / originalSize,
        method: 'llm',
      },
    };
  } catch (error) {
    // On LLM failure, fall back to truncation
    console.warn('[ResultCompression] LLM compression failed, falling back to truncation:', error);
    const { content, truncated } = truncateContent(resultStr, maxSize);
    return {
      content,
      wasCompressed: false,
      wasTruncated: true,
      originalSize,
      finalSize: content.length,
      metadata: {
        compressionRatio: content.length / originalSize,
        method: 'truncate',
      },
    };
  }
}

/**
 * Simple truncation without LLM (for when speed is critical)
 */
export function truncateToolResult(result: unknown, maxSize: number = MAX_OUTPUT_SIZE): string {
  const resultStr = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);

  const { content } = truncateContent(resultStr, maxSize);
  return content;
}

/**
 * Check if a result needs compression
 */
export function needsCompression(result: unknown, threshold: number = COMPRESSION_THRESHOLD): boolean {
  const resultStr = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);

  return resultStr.length > threshold;
}

// Export constants for external configuration
export const DEFAULTS = {
  COMPRESSION_THRESHOLD,
  TARGET_SIZE,
  MAX_OUTPUT_SIZE,
};
