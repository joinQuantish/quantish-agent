/**
 * Web Search Tools
 * 
 * Provides web search capabilities:
 * - Exa (preferred) - requires EXA_API_KEY
 * - DuckDuckGo (fallback) - no API key needed
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { LocalToolResult } from './filesystem.js';

// Exa API types
interface ExaSearchResult {
  title: string;
  url: string;
  text?: string;
  publishedDate?: string;
  author?: string;
  score?: number;
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
  autopromptString?: string;
}

/**
 * Search the web using Exa API
 * Exa is an AI-native search engine trusted by Cursor, Notion, Vercel, and more
 * Docs: https://docs.exa.ai
 */
async function searchWithExa(
  query: string,
  apiKey: string,
  options: { maxResults?: number; includeText?: boolean } = {}
): Promise<LocalToolResult> {
  const { maxResults = 10, includeText = true } = options;

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        type: 'auto', // Let Exa decide between neural and keyword search
        contents: includeText ? {
          text: {
            maxCharacters: 1000, // Limit text length per result
          }
        } : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as ExaSearchResponse;

    return {
      success: true,
      data: {
        query,
        source: 'exa',
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.text?.slice(0, 500) || '',
          publishedDate: r.publishedDate,
          author: r.author,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Exa search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get an AI-generated answer using Exa's Answer API
 */
async function answerWithExa(
  query: string,
  apiKey: string
): Promise<LocalToolResult> {
  try {
    const response = await fetch('https://api.exa.ai/answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        text: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa Answer API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { answer: string; citations: ExaSearchResult[] };

    return {
      success: true,
      data: {
        query,
        source: 'exa',
        answer: data.answer,
        citations: data.citations?.map((c) => ({
          title: c.title,
          url: c.url,
        })) || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Exa answer failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fallback: Scrape DuckDuckGo HTML (no API key needed)
 */
async function searchWithDuckDuckGo(
  query: string,
  options: { maxResults?: number } = {}
): Promise<LocalToolResult> {
  const { maxResults = 10 } = options;

  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo error: ${response.status}`);
    }

    const html = await response.text();

    // Parse DuckDuckGo HTML results
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    
    // Match result links and snippets
    const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*)/g;
    
    let linkMatch;
    const snippets: string[] = [];
    let snippetMatch;
    
    while ((snippetMatch = snippetPattern.exec(html)) !== null) {
      snippets.push(snippetMatch[1].trim());
    }

    let i = 0;
    while ((linkMatch = resultPattern.exec(html)) !== null && results.length < maxResults) {
      // DuckDuckGo uses uddg parameter for the actual URL
      let url = linkMatch[1];
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }

      results.push({
        title: linkMatch[2].trim(),
        url,
        snippet: snippets[i] || '',
      });
      i++;
    }

    if (results.length === 0) {
      return {
        success: true,
        data: {
          query,
          source: 'duckduckgo',
          results: [],
          note: 'No results found. DuckDuckGo may be rate-limiting. Consider setting EXA_API_KEY for better results.',
        },
      };
    }

    return {
      success: true,
      data: {
        query,
        source: 'duckduckgo',
        results,
        note: 'Using DuckDuckGo (free). Set EXA_API_KEY for better AI-powered search results.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `DuckDuckGo search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Main web search function - uses Exa if available, falls back to DuckDuckGo
 */
export async function webSearch(
  query: string,
  options: { maxResults?: number } = {}
): Promise<LocalToolResult> {
  const exaKey = process.env.EXA_API_KEY;

  if (exaKey) {
    return searchWithExa(query, exaKey, options);
  }

  // Fallback to DuckDuckGo
  return searchWithDuckDuckGo(query, options);
}

/**
 * Get an AI-generated answer to a question (requires Exa)
 */
export async function webAnswer(query: string): Promise<LocalToolResult> {
  const exaKey = process.env.EXA_API_KEY;

  if (!exaKey) {
    return {
      success: false,
      error: 'EXA_API_KEY is required for web_answer. Get one at https://dashboard.exa.ai',
    };
  }

  return answerWithExa(query, exaKey);
}

/**
 * Fetch a URL and return its content
 */
export async function fetchUrl(
  url: string,
  options: { maxLength?: number } = {}
): Promise<LocalToolResult> {
  const { maxLength = 50000 } = options;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let content = await response.text();

    // Truncate if too long
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + '\n\n[Content truncated...]';
    }

    // If HTML, try to extract just the text content
    if (contentType.includes('text/html')) {
      // Simple HTML to text conversion (remove tags)
      content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return {
      success: true,
      data: {
        url,
        contentType,
        length: content.length,
        content,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tool definitions for Claude
 */
export const webTools: Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for information. Returns titles, URLs, and snippets from search results. Uses Exa AI search if EXA_API_KEY is set (recommended), otherwise falls back to DuckDuckGo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_answer',
    description: 'Get an AI-generated answer to a question with citations, powered by Exa. Requires EXA_API_KEY. Best for factual questions that need grounded answers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The question to answer',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch the content of a URL. Returns the text content of the page. Useful for reading articles, documentation, or any web page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
        max_length: {
          type: 'number',
          description: 'Maximum content length to return (default: 50000 characters)',
        },
      },
      required: ['url'],
    },
  },
];

/**
 * Execute a web tool
 */
export async function executeWebTool(name: string, args: Record<string, unknown>): Promise<LocalToolResult> {
  switch (name) {
    case 'web_search':
      return webSearch(args.query as string, {
        maxResults: args.max_results as number | undefined,
      });
    case 'web_answer':
      return webAnswer(args.query as string);
    case 'fetch_url':
      return fetchUrl(args.url as string, {
        maxLength: args.max_length as number | undefined,
      });
    default:
      return { success: false, error: `Unknown web tool: ${name}` };
  }
}
