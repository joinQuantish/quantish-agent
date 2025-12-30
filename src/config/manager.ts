/**
 * Configuration Manager
 * 
 * Manages persistent configuration stored in ~/.quantish/config.json
 */

import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';

export type LLMProvider = 'anthropic' | 'openrouter';

export interface QuantishConfig {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  quantishApiKey?: string;
  kalshiApiKey?: string;
  mcpServerUrl: string;
  model?: string;
  provider?: LLMProvider;
}

// Trading MCP (Polymarket) - requires user's API key for wallet/order operations
const DEFAULT_TRADING_MCP_URL = 'https://quantish-sdk-production.up.railway.app/mcp';

// Discovery MCP (Polymarket) - public read-only market data (embedded key)
export const DISCOVERY_MCP_URL = 'https://quantish.live/mcp';
export const DISCOVERY_MCP_PUBLIC_KEY = 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8';

// Kalshi MCP - Kalshi markets via DFlow on Solana
export const KALSHI_MCP_URL = 'https://kalshi-mcp-production-7c2c.up.railway.app/mcp';

// Legacy alias
const DEFAULT_MCP_URL = DEFAULT_TRADING_MCP_URL;

// Default models per provider
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
export const DEFAULT_OPENROUTER_MODEL = 'z-ai/glm-4.7';

const schema = {
  anthropicApiKey: {
    type: 'string' as const,
  },
  openrouterApiKey: {
    type: 'string' as const,
  },
  quantishApiKey: {
    type: 'string' as const,
  },
  kalshiApiKey: {
    type: 'string' as const,
  },
  mcpServerUrl: {
    type: 'string' as const,
    default: DEFAULT_MCP_URL,
  },
  model: {
    type: 'string' as const,
    // No default here - getModel() returns provider-specific default
  },
  provider: {
    type: 'string' as const,
    default: 'openrouter', // OpenRouter is recommended for new users
  },
};

class ConfigManager {
  private conf: Conf<QuantishConfig>;

  constructor() {
    this.conf = new Conf<QuantishConfig>({
      projectName: 'quantish',
      schema,
      cwd: join(homedir(), '.quantish'),
      configName: 'config',
    });
  }

  /**
   * Get the Anthropic API key
   */
  getAnthropicApiKey(): string | undefined {
    // Check environment variable first
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;
    
    return this.conf.get('anthropicApiKey');
  }

  /**
   * Set the Anthropic API key
   */
  setAnthropicApiKey(key: string): void {
    this.conf.set('anthropicApiKey', key);
  }

  /**
   * Get the OpenRouter API key
   */
  getOpenRouterApiKey(): string | undefined {
    // Check environment variable first
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) return envKey;
    
    return this.conf.get('openrouterApiKey');
  }

  /**
   * Set the OpenRouter API key
   */
  setOpenRouterApiKey(key: string): void {
    this.conf.set('openrouterApiKey', key);
  }

  /**
   * Get the Quantish API key
   */
  getQuantishApiKey(): string | undefined {
    // Check environment variable first
    const envKey = process.env.QUANTISH_API_KEY;
    if (envKey) return envKey;
    
    return this.conf.get('quantishApiKey');
  }

  /**
   * Set the Quantish API key
   */
  setQuantishApiKey(key: string): void {
    this.conf.set('quantishApiKey', key);
  }

  /**
   * Get the Kalshi API key
   */
  getKalshiApiKey(): string | undefined {
    // Check environment variable first
    const envKey = process.env.KALSHI_API_KEY;
    if (envKey) return envKey;
    
    return this.conf.get('kalshiApiKey');
  }

  /**
   * Set the Kalshi API key
   */
  setKalshiApiKey(key: string): void {
    this.conf.set('kalshiApiKey', key);
  }

  /**
   * Get the current LLM provider
   */
  getProvider(): LLMProvider {
    return (this.conf.get('provider') as LLMProvider) ?? 'anthropic';
  }

  /**
   * Set the LLM provider
   */
  setProvider(provider: LLMProvider): void {
    this.conf.set('provider', provider);
  }

  /**
   * Get the Trading MCP server URL (user's wallet/orders)
   */
  getMcpServerUrl(): string {
    return this.conf.get('mcpServerUrl') ?? DEFAULT_MCP_URL;
  }

  /**
   * Alias for getMcpServerUrl for clarity
   */
  getTradingMcpUrl(): string {
    return this.getMcpServerUrl();
  }

  /**
   * Get the Discovery MCP server URL (public market data)
   */
  getDiscoveryMcpUrl(): string {
    return DISCOVERY_MCP_URL;
  }

  /**
   * Get the Discovery MCP public API key
   */
  getDiscoveryApiKey(): string {
    return DISCOVERY_MCP_PUBLIC_KEY;
  }

  /**
   * Set the MCP server URL
   */
  setMcpServerUrl(url: string): void {
    this.conf.set('mcpServerUrl', url);
  }

  /**
   * Get the model to use (returns default based on current provider)
   */
  getModel(): string {
    const model = this.conf.get('model');
    if (model) return model;
    
    // Return default model based on provider
    const provider = this.getProvider();
    return provider === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : DEFAULT_ANTHROPIC_MODEL;
  }

  /**
   * Set the model to use
   */
  setModel(model: string): void {
    this.conf.set('model', model);
  }

  /**
   * Check if the CLI is configured (has required LLM API key)
   * Discovery MCP works without any user key (embedded public key)
   * Trading MCP requires a user key
   */
  isConfigured(): boolean {
    const provider = this.getProvider();
    if (provider === 'openrouter') {
      return !!this.getOpenRouterApiKey();
    }
    return !!this.getAnthropicApiKey();
  }

  /**
   * Get the appropriate LLM API key based on current provider
   */
  getLLMApiKey(): string | undefined {
    const provider = this.getProvider();
    if (provider === 'openrouter') {
      return this.getOpenRouterApiKey();
    }
    return this.getAnthropicApiKey();
  }

  /**
   * Check if trading is enabled (has Quantish API key)
   */
  isTradingEnabled(): boolean {
    return !!this.getQuantishApiKey();
  }

  /**
   * Get all configuration values
   */
  getAll(): QuantishConfig {
    return {
      anthropicApiKey: this.getAnthropicApiKey(),
      openrouterApiKey: this.getOpenRouterApiKey(),
      quantishApiKey: this.getQuantishApiKey(),
      mcpServerUrl: this.getMcpServerUrl(),
      model: this.getModel(),
      provider: this.getProvider(),
    };
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.conf.clear();
  }

  /**
   * Get the path to the config file
   */
  getConfigPath(): string {
    return this.conf.path;
  }
}

// Singleton instance
let configManager: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

