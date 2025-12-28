/**
 * Configuration Manager
 * 
 * Manages persistent configuration stored in ~/.quantish/config.json
 */

import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';

export interface QuantishConfig {
  anthropicApiKey?: string;
  quantishApiKey?: string;
  mcpServerUrl: string;
  model?: string;
}

// Trading MCP - requires user's API key for wallet/order operations
const DEFAULT_TRADING_MCP_URL = 'https://quantish-sdk-production.up.railway.app/mcp';

// Discovery MCP - public read-only market data (embedded key)
export const DISCOVERY_MCP_URL = 'https://quantish.live/mcp';
export const DISCOVERY_MCP_PUBLIC_KEY = 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8';

// Legacy alias
const DEFAULT_MCP_URL = DEFAULT_TRADING_MCP_URL;

const schema = {
  anthropicApiKey: {
    type: 'string' as const,
  },
  quantishApiKey: {
    type: 'string' as const,
  },
  mcpServerUrl: {
    type: 'string' as const,
    default: DEFAULT_MCP_URL,
  },
  model: {
    type: 'string' as const,
    default: 'claude-sonnet-4-5-20250929',
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
   * Get the model to use
   */
  getModel(): string {
    return this.conf.get('model') ?? 'claude-sonnet-4-5-20250929';
  }

  /**
   * Set the model to use
   */
  setModel(model: string): void {
    this.conf.set('model', model);
  }

  /**
   * Check if the CLI is configured (has at least Anthropic key)
   * Discovery MCP works without any user key (embedded public key)
   * Trading MCP requires a user key
   */
  isConfigured(): boolean {
    // Only Anthropic key is strictly required - Discovery MCP works without user auth
    return !!this.getAnthropicApiKey();
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
      quantishApiKey: this.getQuantishApiKey(),
      mcpServerUrl: this.getMcpServerUrl(),
      model: this.getModel(),
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

