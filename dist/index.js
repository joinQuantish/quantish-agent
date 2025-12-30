#!/usr/bin/env node

// src/index.ts
import React2 from "react";
import { render } from "ink";
import { Command } from "commander";
import chalk3 from "chalk";

// src/config/manager.ts
import Conf from "conf";
import { homedir } from "os";
import { join } from "path";
var DEFAULT_TRADING_MCP_URL = "https://quantish-sdk-production.up.railway.app/mcp";
var DISCOVERY_MCP_URL = "https://quantish.live/mcp";
var DISCOVERY_MCP_PUBLIC_KEY = "qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8";
var KALSHI_MCP_URL = "https://kalshi-mcp-production-7c2c.up.railway.app/mcp";
var DEFAULT_MCP_URL = DEFAULT_TRADING_MCP_URL;
var DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
var DEFAULT_OPENROUTER_MODEL = "z-ai/glm-4.7";
var schema = {
  anthropicApiKey: {
    type: "string"
  },
  openrouterApiKey: {
    type: "string"
  },
  quantishApiKey: {
    type: "string"
  },
  kalshiApiKey: {
    type: "string"
  },
  mcpServerUrl: {
    type: "string",
    default: DEFAULT_MCP_URL
  },
  model: {
    type: "string"
    // No default here - getModel() returns provider-specific default
  },
  provider: {
    type: "string",
    default: "openrouter"
    // OpenRouter is recommended for new users
  }
};
var ConfigManager = class {
  conf;
  constructor() {
    this.conf = new Conf({
      projectName: "quantish",
      schema,
      cwd: join(homedir(), ".quantish"),
      configName: "config"
    });
  }
  /**
   * Get the Anthropic API key
   */
  getAnthropicApiKey() {
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;
    return this.conf.get("anthropicApiKey");
  }
  /**
   * Set the Anthropic API key
   */
  setAnthropicApiKey(key) {
    this.conf.set("anthropicApiKey", key);
  }
  /**
   * Get the OpenRouter API key
   */
  getOpenRouterApiKey() {
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) return envKey;
    return this.conf.get("openrouterApiKey");
  }
  /**
   * Set the OpenRouter API key
   */
  setOpenRouterApiKey(key) {
    this.conf.set("openrouterApiKey", key);
  }
  /**
   * Get the Quantish API key
   */
  getQuantishApiKey() {
    const envKey = process.env.QUANTISH_API_KEY;
    if (envKey) return envKey;
    return this.conf.get("quantishApiKey");
  }
  /**
   * Set the Quantish API key
   */
  setQuantishApiKey(key) {
    this.conf.set("quantishApiKey", key);
  }
  /**
   * Get the Kalshi API key
   */
  getKalshiApiKey() {
    const envKey = process.env.KALSHI_API_KEY;
    if (envKey) return envKey;
    return this.conf.get("kalshiApiKey");
  }
  /**
   * Set the Kalshi API key
   */
  setKalshiApiKey(key) {
    this.conf.set("kalshiApiKey", key);
  }
  /**
   * Get the current LLM provider
   */
  getProvider() {
    return this.conf.get("provider") ?? "anthropic";
  }
  /**
   * Set the LLM provider
   */
  setProvider(provider) {
    this.conf.set("provider", provider);
  }
  /**
   * Get the Trading MCP server URL (user's wallet/orders)
   */
  getMcpServerUrl() {
    return this.conf.get("mcpServerUrl") ?? DEFAULT_MCP_URL;
  }
  /**
   * Alias for getMcpServerUrl for clarity
   */
  getTradingMcpUrl() {
    return this.getMcpServerUrl();
  }
  /**
   * Get the Discovery MCP server URL (public market data)
   */
  getDiscoveryMcpUrl() {
    return DISCOVERY_MCP_URL;
  }
  /**
   * Get the Discovery MCP public API key
   */
  getDiscoveryApiKey() {
    return DISCOVERY_MCP_PUBLIC_KEY;
  }
  /**
   * Set the MCP server URL
   */
  setMcpServerUrl(url) {
    this.conf.set("mcpServerUrl", url);
  }
  /**
   * Get the model to use (returns default based on current provider)
   */
  getModel() {
    const model = this.conf.get("model");
    if (model) return model;
    const provider = this.getProvider();
    return provider === "openrouter" ? DEFAULT_OPENROUTER_MODEL : DEFAULT_ANTHROPIC_MODEL;
  }
  /**
   * Set the model to use
   */
  setModel(model) {
    this.conf.set("model", model);
  }
  /**
   * Check if the CLI is configured (has required LLM API key)
   * Discovery MCP works without any user key (embedded public key)
   * Trading MCP requires a user key
   */
  isConfigured() {
    const provider = this.getProvider();
    if (provider === "openrouter") {
      return !!this.getOpenRouterApiKey();
    }
    return !!this.getAnthropicApiKey();
  }
  /**
   * Get the appropriate LLM API key based on current provider
   */
  getLLMApiKey() {
    const provider = this.getProvider();
    if (provider === "openrouter") {
      return this.getOpenRouterApiKey();
    }
    return this.getAnthropicApiKey();
  }
  /**
   * Check if trading is enabled (has Quantish API key)
   */
  isTradingEnabled() {
    return !!this.getQuantishApiKey();
  }
  /**
   * Get all configuration values
   */
  getAll() {
    return {
      anthropicApiKey: this.getAnthropicApiKey(),
      openrouterApiKey: this.getOpenRouterApiKey(),
      quantishApiKey: this.getQuantishApiKey(),
      mcpServerUrl: this.getMcpServerUrl(),
      model: this.getModel(),
      provider: this.getProvider()
    };
  }
  /**
   * Clear all configuration
   */
  clear() {
    this.conf.clear();
  }
  /**
   * Get the path to the config file
   */
  getConfigPath() {
    return this.conf.path;
  }
};
var configManager = null;
function getConfigManager() {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

// src/config/setup.ts
import * as readline from "readline";
import chalk from "chalk";

// src/mcp/client.ts
var MCPClient = class {
  baseUrl;
  apiKey;
  toolsCache = null;
  source;
  constructor(baseUrl, apiKey, source = "trading") {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.source = source;
  }
  /**
   * List available tools from the MCP server
   * Discovery MCP uses REST endpoints, Trading MCP uses JSON-RPC
   */
  async listTools() {
    if (this.toolsCache) {
      return this.toolsCache;
    }
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.source === "discovery") {
      headers["Accept"] = "application/json, text/event-stream";
      headers["X-API-Key"] = this.apiKey;
    } else {
      headers["x-api-key"] = this.apiKey;
    }
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: Date.now()
      })
    });
    if (!response.ok) {
      throw new Error(`MCP server error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }
    const tools = data.result?.tools || [];
    this.toolsCache = tools;
    return tools;
  }
  /**
   * Call a tool on the MCP server
   * All MCPs use JSON-RPC format
   */
  async callTool(name, args) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.source === "discovery") {
      headers["Accept"] = "application/json, text/event-stream";
      headers["X-API-Key"] = this.apiKey;
    } else {
      headers["x-api-key"] = this.apiKey;
    }
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name,
          arguments: args
        },
        id: Date.now()
      })
    });
    if (!response.ok) {
      return {
        success: false,
        error: `MCP server error: ${response.status} ${response.statusText}`
      };
    }
    const data = await response.json();
    if (data.error) {
      return {
        success: false,
        error: data.error.message
      };
    }
    const content = data.result?.content;
    if (content && content.length > 0) {
      const textContent = content.find((c) => c.type === "text");
      if (textContent?.text) {
        try {
          return {
            success: true,
            data: JSON.parse(textContent.text)
          };
        } catch {
          return {
            success: true,
            data: textContent.text
          };
        }
      }
    }
    return {
      success: true,
      data: data.result
    };
  }
  /**
   * Clear the tools cache (useful if server tools are updated)
   */
  clearCache() {
    this.toolsCache = null;
  }
  /**
   * Check if the MCP server is reachable
   */
  async healthCheck() {
    try {
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }
};
function createMCPClient(baseUrl, apiKey, source = "trading") {
  return new MCPClient(baseUrl, apiKey, source);
}
var MCPClientManager = class {
  discoveryClient;
  tradingClient;
  kalshiClient;
  toolSourceMap = /* @__PURE__ */ new Map();
  allToolsCache = null;
  constructor(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey, kalshiUrl, kalshiApiKey) {
    this.discoveryClient = new MCPClient(discoveryUrl, discoveryApiKey, "discovery");
    this.tradingClient = tradingUrl && tradingApiKey ? new MCPClient(tradingUrl, tradingApiKey, "trading") : null;
    this.kalshiClient = kalshiUrl && kalshiApiKey ? new MCPClient(kalshiUrl, kalshiApiKey, "kalshi") : null;
  }
  /**
   * Check if trading is enabled (Polymarket)
   */
  isTradingEnabled() {
    return this.tradingClient !== null;
  }
  /**
   * Check if Kalshi trading is enabled
   */
  isKalshiEnabled() {
    return this.kalshiClient !== null;
  }
  /**
   * Get the discovery client
   */
  getDiscoveryClient() {
    return this.discoveryClient;
  }
  /**
   * Get the trading client (may be null)
   */
  getTradingClient() {
    return this.tradingClient;
  }
  /**
   * Get the Kalshi client (may be null)
   */
  getKalshiClient() {
    return this.kalshiClient;
  }
  /**
   * List all tools from both servers
   */
  async listAllTools() {
    if (this.allToolsCache) {
      return this.allToolsCache;
    }
    const allTools = [];
    this.toolSourceMap.clear();
    try {
      const discoveryTools = await this.discoveryClient.listTools();
      for (const tool of discoveryTools) {
        allTools.push({ ...tool, source: "discovery" });
        this.toolSourceMap.set(tool.name, "discovery");
      }
    } catch (error2) {
      console.warn("Failed to fetch Discovery MCP tools:", error2);
    }
    const discoverySearchTools = /* @__PURE__ */ new Set([
      "search_markets",
      "get_market_details",
      "get_trending_markets",
      "get_categories",
      "get_market_stats",
      "get_search_status",
      "find_arbitrage"
    ]);
    if (this.tradingClient) {
      try {
        const tradingTools = await this.tradingClient.listTools();
        for (const tool of tradingTools) {
          if (discoverySearchTools.has(tool.name)) {
            continue;
          }
          allTools.push({ ...tool, source: "trading" });
          this.toolSourceMap.set(tool.name, "trading");
        }
      } catch (error2) {
        console.warn("Failed to fetch Trading MCP tools:", error2);
      }
    }
    if (this.kalshiClient) {
      try {
        const kalshiTools = await this.kalshiClient.listTools();
        for (const tool of kalshiTools) {
          allTools.push({ ...tool, source: "kalshi" });
          this.toolSourceMap.set(tool.name, "kalshi");
        }
      } catch (error2) {
        console.warn("Failed to fetch Kalshi MCP tools:", error2);
      }
    }
    this.allToolsCache = allTools;
    return allTools;
  }
  /**
   * Get which server a tool belongs to
   */
  getToolSource(toolName) {
    return this.toolSourceMap.get(toolName);
  }
  /**
   * Call a tool on the appropriate server
   */
  async callTool(name, args) {
    if (this.toolSourceMap.size === 0) {
      await this.listAllTools();
    }
    const source = this.toolSourceMap.get(name);
    if (!source) {
      return {
        success: false,
        error: `Unknown MCP tool: ${name}`
      };
    }
    if (source === "discovery") {
      const result = await this.discoveryClient.callTool(name, args);
      return { ...result, source: "discovery" };
    }
    if (source === "trading") {
      if (!this.tradingClient) {
        return {
          success: false,
          error: `Polymarket trading not enabled. Run 'quantish init' to set up trading.`
        };
      }
      const result = await this.tradingClient.callTool(name, args);
      return { ...result, source: "trading" };
    }
    if (source === "kalshi") {
      if (!this.kalshiClient) {
        return {
          success: false,
          error: `Kalshi trading not enabled. Run 'quantish init' to set up your Kalshi API key.`
        };
      }
      const result = await this.kalshiClient.callTool(name, args);
      return { ...result, source: "kalshi" };
    }
    return {
      success: false,
      error: `Unknown tool source: ${source}`
    };
  }
  /**
   * Clear all caches
   */
  clearCache() {
    this.discoveryClient.clearCache();
    this.tradingClient?.clearCache();
    this.allToolsCache = null;
    this.toolSourceMap.clear();
  }
  /**
   * Health check both servers
   */
  async healthCheck() {
    const discovery = await this.discoveryClient.healthCheck();
    const trading = this.tradingClient ? await this.tradingClient.healthCheck() : null;
    return { discovery, trading };
  }
};
function createMCPClientManager(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey, kalshiUrl, kalshiApiKey) {
  return new MCPClientManager(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey, kalshiUrl, kalshiApiKey);
}

// src/mcp/tools.ts
function convertToClaudeTools(mcpTools) {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}

// src/config/setup.ts
async function prompt(question, isSecret = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve2) => {
    if (isSecret) {
      console.log(chalk.dim("(Input will be visible)"));
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve2(answer.trim());
    });
  });
}
function printArchitectureInfo() {
  console.log(chalk.bold.yellow("\n\u{1F4CB} How Quantish Works\n"));
  console.log(chalk.dim("\u2500".repeat(60)));
  console.log();
  console.log(chalk.bold("Three Capabilities:"));
  console.log();
  console.log(chalk.cyan("\u{1F50D} Market Discovery") + chalk.dim(" (Free, always available)"));
  console.log(chalk.dim("   Search markets across Polymarket, Kalshi, and more"));
  console.log(chalk.dim("   Uses our Discovery MCP with embedded public key"));
  console.log();
  console.log(chalk.magenta("\u{1F4B0} Polymarket Trading") + chalk.dim(" (Optional, your own wallet)"));
  console.log(chalk.dim("   Trade on Polymarket with a managed Polygon wallet"));
  console.log(chalk.dim("   Uses the Quantish Signing Server"));
  console.log();
  console.log(chalk.blue("\u{1F5F3}\uFE0F  Kalshi Trading") + chalk.dim(" (Optional, via DFlow on Solana)"));
  console.log(chalk.dim("   Trade on Kalshi markets via DFlow protocol"));
  console.log(chalk.dim("   Uses a Solana wallet managed by the Kalshi MCP"));
  console.log();
  console.log(chalk.bold("How Trading Works:"));
  console.log(chalk.dim("  Polymarket: Gasless transactions on Polygon, fees covered"));
  console.log(chalk.dim("  Kalshi: Trade on Solana via DFlow, small SOL fees"));
  console.log(chalk.dim("  Both: Non-custodial wallets, export keys anytime\n"));
  console.log(chalk.bold("Security:"));
  console.log(chalk.dim("  \u2022 Your wallets are non-custodial - only you can authorize trades"));
  console.log(chalk.dim("  \u2022 Export your private key anytime with: ") + chalk.cyan("export_private_key"));
  console.log(chalk.dim("  \u2022 Discovery is read-only - it can't access your wallets"));
  console.log();
  console.log(chalk.dim("\u2500".repeat(60)));
  console.log();
}
async function runSetup() {
  const config = getConfigManager();
  console.log();
  console.log(chalk.bold.yellow("\u{1F680} Welcome to Quantish CLI"));
  console.log(chalk.dim("AI-powered trading agent for Polymarket\n"));
  if (config.isConfigured()) {
    console.log(chalk.yellow("You already have a configuration."));
    const overwrite = await prompt("Do you want to reconfigure? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log(chalk.dim("Setup cancelled."));
      return false;
    }
    console.log();
  }
  printArchitectureInfo();
  const proceed = await prompt('Press Enter to continue with setup (or "q" to quit): ');
  if (proceed.toLowerCase() === "q") {
    console.log(chalk.dim("Setup cancelled."));
    return false;
  }
  console.log();
  console.log(chalk.bold("Step 1: Choose your LLM Provider"));
  console.log(chalk.dim("The AI that powers the agent.\n"));
  console.log("  1. " + chalk.green.bold("OpenRouter") + chalk.green(" (Recommended)") + chalk.dim(" - Uses GLM 4.7, fastest & cheapest"));
  console.log("  2. " + chalk.cyan("Anthropic") + chalk.dim(" (Claude models - Opus, Sonnet, Haiku)\n"));
  console.log(chalk.dim("OpenRouter gives you access to GLM 4.7 - the best price/performance model available."));
  console.log(chalk.dim("Get started free: ") + chalk.underline.cyan("https://openrouter.ai/keys\n"));
  const providerChoice = await prompt("Choose (1 or 2, default 1): ");
  const useOpenRouter = providerChoice !== "2";
  if (useOpenRouter) {
    config.setProvider("openrouter");
    console.log();
    console.log(chalk.bold("OpenRouter API Key"));
    console.log(chalk.dim("Sign up and get your key at: ") + chalk.underline.cyan("https://openrouter.ai/keys"));
    console.log(chalk.dim("Default model: GLM 4.7 (fast, accurate, low cost)\n"));
    let openrouterKey = config.getOpenRouterApiKey();
    if (openrouterKey) {
      console.log(chalk.dim(`Current: ${openrouterKey.slice(0, 10)}...`));
      const newKey = await prompt("Enter new key (or press Enter to keep current): ", true);
      if (newKey) {
        openrouterKey = newKey;
      }
    } else {
      openrouterKey = await prompt("Enter your OpenRouter API key: ", true);
    }
    if (!openrouterKey) {
      console.log(chalk.red("OpenRouter API key is required."));
      return false;
    }
    if (!openrouterKey.startsWith("sk-or-")) {
      console.log(chalk.yellow("Warning: Key doesn't look like an OpenRouter key (should start with sk-or-)"));
    }
    config.setOpenRouterApiKey(openrouterKey);
    console.log(chalk.green("\u2713 OpenRouter API key saved"));
    console.log(chalk.dim("  Using model: z-ai/glm-4.7\n"));
  } else {
    config.setProvider("anthropic");
    console.log();
    console.log(chalk.bold("Anthropic API Key"));
    console.log(chalk.dim("Get yours at: ") + chalk.underline.cyan("https://console.anthropic.com/\n"));
    let anthropicKey = config.getAnthropicApiKey();
    if (anthropicKey) {
      console.log(chalk.dim(`Current: ${anthropicKey.slice(0, 10)}...`));
      const newKey = await prompt("Enter new key (or press Enter to keep current): ", true);
      if (newKey) {
        anthropicKey = newKey;
      }
    } else {
      anthropicKey = await prompt("Enter your Anthropic API key: ", true);
    }
    if (!anthropicKey) {
      console.log(chalk.red("Anthropic API key is required."));
      return false;
    }
    if (!anthropicKey.startsWith("sk-ant-")) {
      console.log(chalk.yellow("Warning: Key doesn't look like an Anthropic key (should start with sk-ant-)"));
    }
    config.setAnthropicApiKey(anthropicKey);
    console.log(chalk.green("\u2713 Anthropic API key saved\n"));
  }
  console.log(chalk.bold("Step 2: Polymarket Trading (Optional)"));
  console.log(chalk.dim("Enable trading on Polymarket with your own managed wallet."));
  console.log(chalk.dim("Skip this if you only want to search/discover markets.\n"));
  let quantishKey = config.getQuantishApiKey();
  let skipTrading = false;
  if (quantishKey) {
    console.log(chalk.dim(`Current trading key: ${quantishKey.slice(0, 12)}...`));
    const action = await prompt("Keep (Enter), new key (n), create wallet (c), or disable (d): ");
    if (action.toLowerCase() === "n") {
      quantishKey = await prompt("Enter your Quantish Trading API key: ", true);
    } else if (action.toLowerCase() === "c") {
      console.log(chalk.dim("\nCreating a new wallet on Quantish Signing Server..."));
      const externalId = await prompt("Enter a unique identifier (e.g., email or username): ");
      if (!externalId) {
        console.log(chalk.red("Identifier is required to create an account."));
        console.log(chalk.dim("Keeping current key.\n"));
      } else {
        try {
          const mcpClient = createMCPClient(config.getTradingMcpUrl(), "");
          const result = await mcpClient.callTool("request_api_key", { externalId });
          if (result.success && typeof result.data === "object" && result.data !== null) {
            const data = result.data;
            quantishKey = data.apiKey;
            console.log(chalk.green("\n\u2713 New wallet created!"));
            console.log(chalk.dim(`  EOA Address: ${data.eoaAddress}`));
            console.log(chalk.dim("  (Your Safe wallet will deploy on first trade)\n"));
            if (data.apiSecret) {
              console.log(chalk.yellow("\u26A0\uFE0F  Save your API secret (shown only once):"));
              console.log(chalk.bold.yellow(`   ${String(data.apiSecret)}`));
              console.log();
            }
          } else {
            console.log(chalk.red("Failed to create wallet: " + (result.error || "Unknown error")));
            console.log(chalk.dim("Keeping current key.\n"));
          }
        } catch (error2) {
          console.log(chalk.red("Failed to connect to Quantish Trading Server."));
          console.log(chalk.dim(String(error2)));
          console.log(chalk.dim("Keeping current key.\n"));
        }
      }
    } else if (action.toLowerCase() === "d") {
      quantishKey = void 0;
      skipTrading = true;
    }
  } else {
    console.log("Options:");
    console.log(chalk.dim("  1. Enter an existing API key"));
    console.log(chalk.dim("  2. Create a new wallet (recommended for new users)"));
    console.log(chalk.dim("  3. Skip trading for now\n"));
    const choice = await prompt("Choose (1/2/3): ");
    if (choice === "1") {
      quantishKey = await prompt("Enter your Quantish Trading API key: ", true);
    } else if (choice === "2") {
      console.log(chalk.dim("\nCreating a new wallet on Quantish Signing Server..."));
      const externalId = await prompt("Enter a unique identifier (e.g., email or username): ");
      if (!externalId) {
        console.log(chalk.red("Identifier is required to create an account."));
        return false;
      }
      try {
        const mcpClient = createMCPClient(config.getTradingMcpUrl(), "");
        const result = await mcpClient.callTool("request_api_key", { externalId });
        if (result.success && typeof result.data === "object" && result.data !== null) {
          const data = result.data;
          quantishKey = data.apiKey;
          console.log(chalk.green("\n\u2713 Wallet created on Quantish Signing Server!"));
          console.log(chalk.dim(`  EOA Address: ${data.eoaAddress}`));
          console.log(chalk.dim("  (Your Safe wallet will be deployed on first trade)\n"));
          if (data.apiSecret) {
            console.log(chalk.yellow("\u26A0\uFE0F  Save your API secret (shown only once):"));
            console.log(chalk.bold.yellow(`   ${String(data.apiSecret)}`));
            console.log();
          }
        } else {
          console.log(chalk.red("Failed to create account: " + (result.error || "Unknown error")));
          console.log(chalk.dim('You can continue without trading - run "quantish init" later to set up.'));
          skipTrading = true;
        }
      } catch (error2) {
        console.log(chalk.red("Failed to connect to Quantish Trading Server."));
        console.log(chalk.dim(String(error2)));
        console.log(chalk.dim('You can continue without trading - run "quantish init" later to set up.'));
        skipTrading = true;
      }
    } else {
      skipTrading = true;
    }
  }
  if (quantishKey) {
    config.setQuantishApiKey(quantishKey);
    console.log(chalk.green("\u2713 Trading API key saved\n"));
  } else if (skipTrading) {
    console.log(chalk.dim("\u2713 Trading disabled - you can still search markets via Discovery\n"));
  } else {
    console.log(chalk.dim("\u2713 No trading key - you can still search markets via Discovery\n"));
  }
  console.log(chalk.bold("Step 3: Kalshi Trading (Optional)"));
  console.log(chalk.dim("Trade on Kalshi markets via DFlow on Solana."));
  console.log(chalk.dim("Skip this if you only want Polymarket or market discovery.\n"));
  let kalshiKey = config.getKalshiApiKey();
  let skipKalshi = false;
  if (kalshiKey) {
    console.log(chalk.dim(`Current Kalshi key: ${kalshiKey.slice(0, 12)}...`));
    const action = await prompt("Keep (Enter), new key (n), create wallet (c), or disable (d): ");
    if (action.toLowerCase() === "n") {
      kalshiKey = await prompt("Enter your Kalshi API key: ", true);
    } else if (action.toLowerCase() === "c") {
      console.log(chalk.dim("\nCreating a new Solana wallet on Kalshi MCP..."));
      const externalId = await prompt("Enter a unique identifier (e.g., email or username): ");
      if (!externalId) {
        console.log(chalk.red("Identifier is required to create an account."));
        console.log(chalk.dim("Keeping current key.\n"));
      } else {
        try {
          const kalshiClient = createMCPClient(KALSHI_MCP_URL, "", "kalshi");
          const result = await kalshiClient.callTool("kalshi_signup", { externalId });
          if (result.success && typeof result.data === "object" && result.data !== null) {
            const data = result.data;
            kalshiKey = data.apiKey;
            console.log(chalk.green("\n\u2713 New Kalshi wallet created!"));
            console.log(chalk.dim(`  Solana Address: ${data.walletAddress}`));
            if (data.apiSecret) {
              console.log(chalk.yellow("\n\u26A0\uFE0F  Save your API secret (shown only once):"));
              console.log(chalk.bold.yellow(`   ${String(data.apiSecret)}`));
              console.log();
            }
          } else {
            console.log(chalk.red("Failed to create wallet: " + (result.error || "Unknown error")));
            console.log(chalk.dim("Keeping current key.\n"));
          }
        } catch (error2) {
          console.log(chalk.red("Failed to connect to Kalshi MCP."));
          console.log(chalk.dim(String(error2)));
          console.log(chalk.dim("Keeping current key.\n"));
        }
      }
    } else if (action.toLowerCase() === "d") {
      kalshiKey = void 0;
      skipKalshi = true;
    }
  } else {
    console.log("Options:");
    console.log(chalk.dim("  1. Create a new Kalshi wallet (recommended for new users)"));
    console.log(chalk.dim("  2. Enter an existing Kalshi API key"));
    console.log(chalk.dim("  3. Skip Kalshi for now\n"));
    const choice = await prompt("Choose (1/2/3): ");
    if (choice === "1") {
      console.log(chalk.dim("\nCreating a new Solana wallet on Kalshi MCP..."));
      const externalId = await prompt("Enter a unique identifier (e.g., email or username): ");
      if (!externalId) {
        console.log(chalk.red("Identifier is required to create an account."));
        skipKalshi = true;
      } else {
        try {
          const kalshiClient = createMCPClient(KALSHI_MCP_URL, "", "kalshi");
          const result = await kalshiClient.callTool("kalshi_signup", { externalId });
          if (result.success && typeof result.data === "object" && result.data !== null) {
            const data = result.data;
            kalshiKey = data.apiKey;
            console.log(chalk.green("\n\u2713 Kalshi wallet created!"));
            console.log(chalk.dim(`  Solana Address: ${data.walletAddress}`));
            if (data.apiSecret) {
              console.log(chalk.yellow("\n\u26A0\uFE0F  Save your API secret (shown only once):"));
              console.log(chalk.bold.yellow(`   ${String(data.apiSecret)}`));
              console.log();
            }
          } else {
            console.log(chalk.red("Failed to create Kalshi account: " + (result.error || "Unknown error")));
            console.log(chalk.dim("You can try again later via the agent."));
            skipKalshi = true;
          }
        } catch (error2) {
          console.log(chalk.red("Failed to connect to Kalshi MCP."));
          console.log(chalk.dim(String(error2)));
          console.log(chalk.dim("You can try again later via the agent."));
          skipKalshi = true;
        }
      }
    } else if (choice === "2") {
      kalshiKey = await prompt("Enter your Kalshi API key: ", true);
    } else {
      skipKalshi = true;
    }
  }
  if (kalshiKey) {
    config.setKalshiApiKey(kalshiKey);
    console.log(chalk.green("\u2713 Kalshi API key saved\n"));
  } else if (skipKalshi) {
    console.log(chalk.dim("\u2713 Kalshi disabled - you can set it up later via the agent\n"));
  } else {
    console.log(chalk.dim("\u2713 No Kalshi key - you can set it up later\n"));
  }
  console.log(chalk.bold("Step 4: Exa API Key (Optional)"));
  console.log(chalk.dim("Powers web search. Get one free at https://dashboard.exa.ai"));
  console.log(chalk.dim("Without this, web search will use DuckDuckGo as fallback.\n"));
  const exaKey = await prompt("Enter your Exa API key (or press Enter to skip): ", true);
  if (exaKey) {
    console.log(chalk.green("\u2713 Great! Add this to your shell profile:"));
    console.log(chalk.cyan(`   export EXA_API_KEY="${exaKey}"`));
    console.log();
  } else {
    console.log(chalk.dim("Skipped. Web search will use DuckDuckGo.\n"));
  }
  console.log(chalk.bold("Step 5: Verifying connections..."));
  try {
    const discoveryClient = createMCPClient(DISCOVERY_MCP_URL, DISCOVERY_MCP_PUBLIC_KEY, "discovery");
    const discoveryResult = await discoveryClient.callTool("get_market_stats", {});
    if (discoveryResult.success) {
      console.log(chalk.green("\u2713 Discovery MCP connected"));
    } else {
      console.log(chalk.yellow("\u26A0 Discovery MCP: " + (discoveryResult.error || "Unknown error")));
    }
  } catch (error2) {
    console.log(chalk.yellow("\u26A0 Could not verify Discovery MCP"));
    console.log(chalk.dim(String(error2)));
  }
  if (quantishKey) {
    try {
      const tradingClient = createMCPClient(config.getTradingMcpUrl(), quantishKey, "trading");
      const result = await tradingClient.callTool("get_wallet_status", {});
      if (result.success && typeof result.data === "object" && result.data !== null) {
        const data = result.data;
        console.log(chalk.green("\u2713 Polymarket MCP connected"));
        if (data.safeAddress) {
          console.log(chalk.dim(`  Safe Address: ${data.safeAddress}`));
          console.log(chalk.dim(`  Status: READY`));
        } else {
          console.log(chalk.dim(`  Safe Address: Will deploy on first trade`));
          console.log(chalk.dim(`  Status: CREATED (wallet ready, Safe deploys on first trade)`));
        }
      } else {
        console.log(chalk.yellow("\u26A0 Polymarket MCP: " + (result.error || "Unknown error")));
      }
    } catch (error2) {
      console.log(chalk.yellow("\u26A0 Could not verify Polymarket MCP connection."));
      console.log(chalk.dim(String(error2)));
    }
  } else {
    console.log(chalk.dim("\u23ED Polymarket MCP skipped (no API key)"));
  }
  if (kalshiKey) {
    try {
      const kalshiClient = createMCPClient(KALSHI_MCP_URL, kalshiKey, "kalshi");
      const result = await kalshiClient.callTool("kalshi_get_wallet_info", {});
      if (result.success && typeof result.data === "object" && result.data !== null) {
        const data = result.data;
        const wallet = data.wallet;
        const publicKey = wallet?.publicKey;
        console.log(chalk.green("\u2713 Kalshi MCP connected"));
        console.log(chalk.dim(`  Solana Address: ${publicKey || "No wallet yet"}`));
        if (wallet) {
          console.log(chalk.dim(`  Status: READY`));
        }
      } else {
        console.log(chalk.yellow("\u26A0 Kalshi MCP: " + (result.error || "Unknown error")));
      }
    } catch (error2) {
      console.log(chalk.yellow("\u26A0 Could not verify Kalshi MCP connection."));
      console.log(chalk.dim(String(error2)));
    }
  } else {
    console.log(chalk.dim("\u23ED Kalshi MCP skipped (no API key)"));
  }
  console.log();
  console.log(chalk.bold.green("\u{1F389} Setup complete!"));
  console.log();
  console.log(chalk.bold("\u{1F4C1} Your credentials are saved:"));
  console.log(chalk.dim(`   Local config: ${config.getConfigPath()}`));
  console.log(chalk.dim("   Wallet keys:  Encrypted on Quantish server (accessible via your API key)"));
  console.log();
  console.log("You can now use Quantish CLI:");
  console.log(chalk.yellow("  quantish") + " - Start interactive chat");
  console.log(chalk.yellow('  quantish -p "check my balance"') + " - One-shot command");
  console.log(chalk.yellow("  quantish tools") + " - List available tools");
  console.log(chalk.yellow("  quantish config") + " - View configuration");
  console.log(chalk.yellow("  quantish config --export") + " - Export keys for your own agents");
  console.log();
  console.log(chalk.dim("Your wallet is managed by the Quantish Signing Server."));
  console.log(chalk.dim("The CLOB signing credentials are stored encrypted on the server."));
  console.log(chalk.dim('To export your private key: quantish -p "export my private key"'));
  console.log();
  return true;
}
async function ensureConfigured() {
  const config = getConfigManager();
  if (!config.isConfigured()) {
    console.log(chalk.yellow("Quantish CLI is not configured yet.\n"));
    return await runSetup();
  }
  return true;
}

// src/agent/loop.ts
import Anthropic2 from "@anthropic-ai/sdk";

// src/tools/filesystem.ts
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";
async function readFile2(filePath, options) {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    const content = await fs.readFile(resolvedPath, "utf-8");
    if (options?.offset !== void 0 || options?.limit !== void 0) {
      const lines = content.split("\n");
      const start = options.offset ?? 0;
      const end = options.limit ? start + options.limit : lines.length;
      const selectedLines = lines.slice(start, end);
      const numbered = selectedLines.map((line, i) => `${(start + i + 1).toString().padStart(6)}|${line}`).join("\n");
      return { success: true, data: numbered };
    }
    return { success: true, data: content };
  } catch (error2) {
    return { success: false, error: `Failed to read file: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
async function writeFile2(filePath, content) {
  try {
    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolvedPath, content, "utf-8");
    return { success: true, data: { path: resolvedPath, bytesWritten: Buffer.byteLength(content) } };
  } catch (error2) {
    return { success: false, error: `Failed to write file: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
async function listDir(dirPath, options) {
  try {
    const resolvedPath = path.resolve(dirPath);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `Directory not found: ${dirPath}` };
    }
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      path: path.join(resolvedPath, entry.name)
    }));
    items.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "directory" ? -1 : 1;
    });
    return { success: true, data: items };
  } catch (error2) {
    return { success: false, error: `Failed to list directory: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
async function deleteFile(filePath) {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    await fs.unlink(resolvedPath);
    return { success: true, data: { deleted: resolvedPath } };
  } catch (error2) {
    return { success: false, error: `Failed to delete file: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
async function fileExists(filePath) {
  try {
    const resolvedPath = path.resolve(filePath);
    const exists = existsSync(resolvedPath);
    if (exists) {
      const stats = await fs.stat(resolvedPath);
      return {
        success: true,
        data: {
          exists: true,
          type: stats.isDirectory() ? "directory" : "file",
          size: stats.size,
          modified: stats.mtime.toISOString()
        }
      };
    }
    return { success: true, data: { exists: false } };
  } catch (error2) {
    return { success: false, error: `Failed to check file: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
async function editFile(filePath, oldString, newString, options) {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    const content = await fs.readFile(resolvedPath, "utf-8");
    if (!content.includes(oldString)) {
      return {
        success: false,
        error: `The string to replace was not found in the file. Make sure to include exact whitespace and formatting.`
      };
    }
    const occurrences = content.split(oldString).length - 1;
    if (!options?.replaceAll && occurrences > 1) {
      return {
        success: false,
        error: `Found ${occurrences} occurrences of the string. Use replaceAll: true to replace all, or provide a more unique string.`
      };
    }
    const newContent = options?.replaceAll ? content.replaceAll(oldString, newString) : content.replace(oldString, newString);
    await fs.writeFile(resolvedPath, newContent, "utf-8");
    return {
      success: true,
      data: {
        path: resolvedPath,
        replacements: options?.replaceAll ? occurrences : 1,
        bytesWritten: Buffer.byteLength(newContent)
      }
    };
  } catch (error2) {
    return { success: false, error: `Failed to edit file: ${error2 instanceof Error ? error2.message : String(error2)}` };
  }
}
var filesystemTools = [
  {
    name: "read_file",
    description: "Read the contents of a file from the local filesystem. Returns the file content as text. Supports optional line offset and limit for large files.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to read (absolute or relative to current directory)"
        },
        offset: {
          type: "number",
          description: "Optional: Start reading from this line number (0-indexed)"
        },
        limit: {
          type: "number",
          description: "Optional: Maximum number of lines to read"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file on the local filesystem. Creates the file if it doesn't exist, or overwrites if it does. Creates parent directories as needed.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to write (absolute or relative)"
        },
        content: {
          type: "string",
          description: "The content to write to the file"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "list_dir",
    description: "List files and directories in a given path. Returns entries with name, type (file/directory), and full path.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The directory path to list"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "delete_file",
    description: "Delete a file from the local filesystem.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to delete"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "file_exists",
    description: "Check if a file or directory exists, and get basic info (type, size, modified date).",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to check"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "edit_file",
    description: "Edit a file by replacing a specific string with new content. Safer than write_file as it only modifies the targeted section. The old_string must match exactly (including whitespace).",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to edit"
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace. Must be unique in the file unless using replaceAll."
        },
        new_string: {
          type: "string",
          description: "The new string to replace the old one with"
        },
        replace_all: {
          type: "boolean",
          description: "If true, replace all occurrences. Default false (only replace first, and fail if multiple found)."
        }
      },
      required: ["path", "old_string", "new_string"]
    }
  }
];
async function executeFilesystemTool(name, args) {
  switch (name) {
    case "read_file":
      return readFile2(args.path, {
        offset: args.offset,
        limit: args.limit
      });
    case "write_file":
      return writeFile2(args.path, args.content);
    case "list_dir":
      return listDir(args.path);
    case "delete_file":
      return deleteFile(args.path);
    case "file_exists":
      return fileExists(args.path);
    case "edit_file":
      return editFile(
        args.path,
        args.old_string,
        args.new_string,
        { replaceAll: args.replace_all }
      );
    default:
      return { success: false, error: `Unknown filesystem tool: ${name}` };
  }
}

// src/tools/shell.ts
import { exec } from "child_process";
import { promisify } from "util";

// src/tools/process-manager.ts
import { spawn } from "child_process";
import { EventEmitter } from "events";
var ProcessManager = class extends EventEmitter {
  processes = /* @__PURE__ */ new Map();
  nextId = 1;
  maxOutputLines = 100;
  constructor() {
    super();
  }
  /**
   * Spawn a new background process
   */
  spawn(command, options = {}) {
    const id = this.nextId++;
    const cwd = options.cwd || process.cwd();
    const name = options.name || command.split(" ")[0];
    const child = spawn("bash", ["-c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      // Keep attached so we can track it
      env: { ...process.env, FORCE_COLOR: "1" }
      // Enable colors
    });
    const spawnedProcess = {
      id,
      pid: child.pid,
      command,
      name,
      cwd,
      startedAt: /* @__PURE__ */ new Date(),
      status: "running",
      child,
      outputBuffer: [],
      lastOutput: [],
      onOutput: options.onOutput
    };
    child.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        this.addOutput(spawnedProcess, line);
      }
    });
    child.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        this.addOutput(spawnedProcess, `[stderr] ${line}`);
      }
    });
    child.on("exit", (code, signal) => {
      spawnedProcess.status = code === 0 ? "stopped" : "error";
      this.addOutput(spawnedProcess, `[Process exited with code ${code}${signal ? `, signal ${signal}` : ""}]`);
      this.emit("exit", id, code, signal);
    });
    child.on("error", (err) => {
      spawnedProcess.status = "error";
      this.addOutput(spawnedProcess, `[Error: ${err.message}]`);
      this.emit("error", id, err);
    });
    this.processes.set(id, spawnedProcess);
    this.emit("spawn", id, spawnedProcess);
    return this.getProcessInfo(spawnedProcess);
  }
  /**
   * Add output to process buffer
   */
  addOutput(process2, line) {
    process2.outputBuffer.push(line);
    process2.lastOutput.push(line);
    if (process2.outputBuffer.length > this.maxOutputLines) {
      process2.outputBuffer.shift();
    }
    if (process2.lastOutput.length > 20) {
      process2.lastOutput.shift();
    }
    process2.onOutput?.(line);
    this.emit("output", process2.id, line);
  }
  /**
   * Get process info without the child process object
   */
  getProcessInfo(process2) {
    return {
      id: process2.id,
      pid: process2.pid,
      command: process2.command,
      name: process2.name,
      cwd: process2.cwd,
      startedAt: process2.startedAt,
      status: process2.status,
      lastOutput: [...process2.lastOutput]
    };
  }
  /**
   * Kill a process by ID
   */
  kill(id) {
    const process2 = this.processes.get(id);
    if (!process2) {
      return false;
    }
    if (process2.status !== "running") {
      return true;
    }
    try {
      process2.child.kill("SIGTERM");
      setTimeout(() => {
        if (process2.status === "running") {
          process2.child.kill("SIGKILL");
        }
      }, 3e3);
      process2.status = "stopped";
      this.emit("kill", id);
      return true;
    } catch (error2) {
      return false;
    }
  }
  /**
   * Kill all running processes
   */
  killAll() {
    for (const [id, process2] of this.processes) {
      if (process2.status === "running") {
        this.kill(id);
      }
    }
  }
  /**
   * List all processes
   */
  list() {
    return Array.from(this.processes.values()).map((p) => this.getProcessInfo(p));
  }
  /**
   * List running processes only
   */
  listRunning() {
    return this.list().filter((p) => p.status === "running");
  }
  /**
   * Get a specific process
   */
  get(id) {
    const process2 = this.processes.get(id);
    return process2 ? this.getProcessInfo(process2) : void 0;
  }
  /**
   * Get recent output from a process
   */
  getOutput(id, lines = 20) {
    const process2 = this.processes.get(id);
    if (!process2) {
      return [];
    }
    return process2.outputBuffer.slice(-lines);
  }
  /**
   * Check if any processes are running
   */
  hasRunning() {
    return this.listRunning().length > 0;
  }
  /**
   * Get count of running processes
   */
  runningCount() {
    return this.listRunning().length;
  }
  /**
   * Set output callback for a process
   */
  setOutputCallback(id, callback) {
    const process2 = this.processes.get(id);
    if (process2) {
      process2.onOutput = callback;
    }
  }
};
var processManager = new ProcessManager();

// src/tools/shell.ts
var execPromise = promisify(exec);
var BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf /*",
  "mkfs",
  "dd if=/dev/zero",
  ":(){:|:&};:",
  // Fork bomb
  "chmod -R 777 /",
  "chown -R"
];
var DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+/,
  /sudo\s+/,
  />\s*\/dev\//,
  /chmod\s+.*\s+\//
];
var PACKAGE_MANAGER_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(install|i|add|ci|update|upgrade)/,
  /^(pip|pip3)\s+install/,
  /^cargo\s+(build|install)/,
  /^go\s+(build|get|mod)/
];
var LONG_RUNNING_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(build|test|run)/,
  /webpack|vite|esbuild|rollup/,
  /docker\s+(build|pull|push)/
];
function getSmartTimeout(command, explicitTimeout) {
  if (explicitTimeout !== void 0) {
    return explicitTimeout;
  }
  for (const pattern of PACKAGE_MANAGER_PATTERNS) {
    if (pattern.test(command)) {
      return 3e5;
    }
  }
  for (const pattern of LONG_RUNNING_PATTERNS) {
    if (pattern.test(command)) {
      return 18e4;
    }
  }
  return 3e4;
}
function checkCommand(command) {
  for (const blocked of BLOCKED_COMMANDS) {
    if (command.includes(blocked)) {
      return { allowed: false, reason: `Blocked command pattern: ${blocked}` };
    }
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Dangerous command pattern detected. Use allowDangerous option to override.` };
    }
  }
  return { allowed: true };
}
async function runCommand(command, options = {}) {
  const {
    cwd = process.cwd(),
    timeout: explicitTimeout,
    maxBuffer = 10 * 1024 * 1024,
    // 10MB
    allowDangerous = false
  } = options;
  const timeout = getSmartTimeout(command, explicitTimeout);
  if (!allowDangerous) {
    const check = checkCommand(command);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }
  }
  try {
    const { stdout, stderr } = await execPromise(command, {
      cwd,
      timeout,
      maxBuffer,
      shell: "/bin/bash",
      // Explicit bash for compound command support
      env: { ...process.env }
    });
    return {
      success: true,
      data: {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command,
        cwd,
        timeoutUsed: timeout
      }
    };
  } catch (error2) {
    const execError = error2;
    if (execError.killed) {
      return {
        success: false,
        error: `Command timed out after ${timeout / 1e3}s. For long-running commands, use start_background_process or increase timeout.`,
        data: {
          stdout: execError.stdout || "",
          stderr: execError.stderr || "",
          timedOut: true
        }
      };
    }
    return {
      success: false,
      error: execError.message || "Command failed",
      data: {
        stdout: execError.stdout || "",
        stderr: execError.stderr || "",
        exitCode: execError.code
      }
    };
  }
}
async function grep(pattern, path2, options = {}) {
  const { ignoreCase = false, contextLines = 0 } = options;
  const rgArgs = [
    pattern,
    path2,
    "--no-heading",
    "--line-number",
    "--color=never"
  ];
  if (ignoreCase) rgArgs.push("-i");
  if (contextLines > 0) rgArgs.push(`-C${contextLines}`);
  try {
    const { stdout } = await execPromise(`rg ${rgArgs.join(" ")}`, {
      timeout: 3e4,
      maxBuffer: 10 * 1024 * 1024
    });
    return {
      success: true,
      data: {
        matches: stdout.trim().split("\n").filter(Boolean),
        pattern,
        path: path2
      }
    };
  } catch {
    try {
      const grepArgs = [
        ignoreCase ? "-i" : "",
        contextLines > 0 ? `-C${contextLines}` : "",
        "-rn",
        pattern,
        path2
      ].filter(Boolean);
      const { stdout } = await execPromise(`grep ${grepArgs.join(" ")}`, {
        timeout: 3e4,
        maxBuffer: 10 * 1024 * 1024
      });
      return {
        success: true,
        data: {
          matches: stdout.trim().split("\n").filter(Boolean),
          pattern,
          path: path2
        }
      };
    } catch (error2) {
      const execError = error2;
      if (execError.code === 1) {
        return { success: true, data: { matches: [], pattern, path: path2 } };
      }
      return { success: false, error: `Search failed: ${execError.message}` };
    }
  }
}
async function findFiles(pattern, directory = ".") {
  try {
    const { stdout } = await execPromise(
      `find "${directory}" -name "${pattern}" -type f 2>/dev/null | head -100`,
      { timeout: 3e4, maxBuffer: 10 * 1024 * 1024 }
    );
    return {
      success: true,
      data: {
        files: stdout.trim().split("\n").filter(Boolean),
        pattern,
        directory
      }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Find failed: ${execError.message}` };
  }
}
var shellTools = [
  {
    name: "run_command",
    description: "Execute a shell command on the local machine. Returns stdout, stderr, and exit code. Some dangerous commands are blocked for safety. Supports compound commands (&&, ||). Smart timeout: 5 min for npm/yarn install, 3 min for builds, 30s default. For dev servers or long-running processes, use start_background_process instead.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute. Compound commands with && and || are supported."
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory for the command (defaults to current directory)"
        },
        timeout: {
          type: "number",
          description: "Optional: Timeout in milliseconds. Smart defaults: 300000 for npm install, 180000 for builds, 30000 for quick commands."
        }
      },
      required: ["command"]
    }
  },
  {
    name: "grep",
    description: "Search for a text pattern in files. Uses ripgrep if available, falls back to grep. Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regex pattern to search for"
        },
        path: {
          type: "string",
          description: "The file or directory to search in"
        },
        ignore_case: {
          type: "boolean",
          description: "Optional: Case-insensitive search (default: false)"
        },
        context_lines: {
          type: "number",
          description: "Optional: Number of context lines before and after matches"
        }
      },
      required: ["pattern", "path"]
    }
  },
  {
    name: "find_files",
    description: "Find files by name pattern (glob). Returns up to 100 matching file paths.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'The glob pattern to match (e.g., "*.ts", "package.json")'
        },
        directory: {
          type: "string",
          description: "Optional: Directory to search in (default: current directory)"
        }
      },
      required: ["pattern"]
    }
  },
  {
    name: "start_background_process",
    description: "Start a long-running process (like a dev server) in the background. The process runs independently and its output is captured. Returns a process ID that can be used to stop it later. Use this for: npm start, npm run dev, python servers, watch mode commands, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'The command to run (e.g., "npm start", "python -m http.server 8000")'
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory for the process"
        },
        name: {
          type: "string",
          description: 'Optional: Friendly name for the process (e.g., "React Dev Server")'
        }
      },
      required: ["command"]
    }
  },
  {
    name: "stop_process",
    description: "Stop a background process by its process ID. Use list_processes to see running processes.",
    input_schema: {
      type: "object",
      properties: {
        process_id: {
          type: "number",
          description: "The process ID returned by start_background_process"
        }
      },
      required: ["process_id"]
    }
  },
  {
    name: "list_processes",
    description: "List all background processes started by this session, including their status and recent output.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_process_output",
    description: "Get recent output from a background process.",
    input_schema: {
      type: "object",
      properties: {
        process_id: {
          type: "number",
          description: "The process ID"
        },
        lines: {
          type: "number",
          description: "Number of output lines to retrieve (default: 20)"
        }
      },
      required: ["process_id"]
    }
  }
];
function startBackgroundProcess(command, options = {}) {
  try {
    const processInfo = processManager.spawn(command, {
      cwd: options.cwd,
      name: options.name
    });
    return {
      success: true,
      data: {
        processId: processInfo.id,
        pid: processInfo.pid,
        name: processInfo.name,
        command: processInfo.command,
        message: `Started background process "${processInfo.name}" (ID: ${processInfo.id}, PID: ${processInfo.pid}). Use stop_process with ID ${processInfo.id} to stop it.`
      }
    };
  } catch (error2) {
    const err = error2;
    return { success: false, error: `Failed to start background process: ${err.message}` };
  }
}
function stopProcess(processId) {
  const process2 = processManager.get(processId);
  if (!process2) {
    return { success: false, error: `Process with ID ${processId} not found` };
  }
  const killed = processManager.kill(processId);
  if (killed) {
    return {
      success: true,
      data: {
        processId,
        name: process2.name,
        message: `Stopped process "${process2.name}" (ID: ${processId})`
      }
    };
  } else {
    return { success: false, error: `Failed to stop process ${processId}` };
  }
}
function listProcesses() {
  const processes = processManager.list();
  const running = processes.filter((p) => p.status === "running");
  const stopped = processes.filter((p) => p.status !== "running");
  return {
    success: true,
    data: {
      running: running.map((p) => ({
        id: p.id,
        pid: p.pid,
        name: p.name,
        command: p.command,
        startedAt: p.startedAt.toISOString(),
        uptime: Math.round((Date.now() - p.startedAt.getTime()) / 1e3) + "s"
      })),
      stopped: stopped.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status
      })),
      summary: `${running.length} running, ${stopped.length} stopped`
    }
  };
}
function getProcessOutput(processId, lines = 20) {
  const process2 = processManager.get(processId);
  if (!process2) {
    return { success: false, error: `Process with ID ${processId} not found` };
  }
  const output = processManager.getOutput(processId, lines);
  return {
    success: true,
    data: {
      processId,
      name: process2.name,
      status: process2.status,
      output,
      lineCount: output.length
    }
  };
}
async function executeShellTool(name, args) {
  switch (name) {
    case "run_command":
      return runCommand(args.command, {
        cwd: args.cwd,
        timeout: args.timeout
      });
    case "grep":
      return grep(args.pattern, args.path, {
        ignoreCase: args.ignore_case,
        contextLines: args.context_lines
      });
    case "find_files":
      return findFiles(args.pattern, args.directory);
    case "start_background_process":
      return startBackgroundProcess(args.command, {
        cwd: args.cwd,
        name: args.name
      });
    case "stop_process":
      return stopProcess(args.process_id);
    case "list_processes":
      return listProcesses();
    case "get_process_output":
      return getProcessOutput(args.process_id, args.lines);
    default:
      return { success: false, error: `Unknown shell tool: ${name}` };
  }
}

// src/tools/git.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
var execPromise2 = promisify2(exec2);
async function gitExec(command, cwd) {
  return execPromise2(`git ${command}`, {
    cwd: cwd || process.cwd(),
    timeout: 3e4,
    maxBuffer: 10 * 1024 * 1024
  });
}
async function gitStatus(cwd) {
  try {
    const { stdout } = await gitExec("status --porcelain", cwd);
    const { stdout: branch } = await gitExec("branch --show-current", cwd);
    const files = stdout.trim().split("\n").filter(Boolean).map((line) => {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      return { status: status.trim(), file };
    });
    return {
      success: true,
      data: {
        branch: branch.trim(),
        files,
        clean: files.length === 0
      }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Git status failed: ${execError.message}` };
  }
}
async function gitDiff(options, cwd) {
  try {
    const args = ["diff"];
    if (options?.staged) args.push("--staged");
    if (options?.file) args.push(options.file);
    const { stdout } = await gitExec(args.join(" "), cwd);
    return {
      success: true,
      data: {
        diff: stdout,
        hasChanges: stdout.trim().length > 0
      }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Git diff failed: ${execError.message}` };
  }
}
async function gitAdd(files, cwd) {
  try {
    const fileList = Array.isArray(files) ? files.join(" ") : files;
    await gitExec(`add ${fileList}`, cwd);
    return {
      success: true,
      data: { added: Array.isArray(files) ? files : [files] }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Git add failed: ${execError.message}` };
  }
}
async function gitCommit(message, cwd) {
  try {
    const { stdout } = await gitExec(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
    const match = stdout.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
    const hash = match ? match[1] : void 0;
    return {
      success: true,
      data: {
        message,
        hash,
        output: stdout.trim()
      }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Git commit failed: ${execError.message}` };
  }
}
async function gitLog(options, cwd) {
  try {
    const args = ["log"];
    if (options?.count) args.push(`-${options.count}`);
    if (options?.oneline) args.push("--oneline");
    const { stdout } = await gitExec(args.join(" "), cwd);
    const commits = stdout.trim().split("\n").filter(Boolean);
    return {
      success: true,
      data: { commits }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Git log failed: ${execError.message}` };
  }
}
async function gitCheckout(target, options, cwd) {
  try {
    const args = ["checkout"];
    if (options?.create) args.push("-b");
    args.push(target);
    const { stdout, stderr } = await gitExec(args.join(" "), cwd);
    return {
      success: true,
      data: {
        target,
        created: options?.create || false,
        output: (stdout || stderr).trim()
      }
    };
  } catch (error2) {
    const execError = error2;
    return { success: false, error: `Git checkout failed: ${execError.message}` };
  }
}
var gitTools = [
  {
    name: "git_status",
    description: "Get the current git status including branch name, modified files, and staged changes.",
    input_schema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Optional: Working directory (defaults to current)"
        }
      },
      required: []
    }
  },
  {
    name: "git_diff",
    description: "Show git diff of changes. Can show staged or unstaged changes, and optionally for a specific file.",
    input_schema: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "Show staged changes only (default: false, shows unstaged)"
        },
        file: {
          type: "string",
          description: "Optional: Show diff for a specific file only"
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory"
        }
      },
      required: []
    }
  },
  {
    name: "git_add",
    description: 'Stage files for commit. Can stage specific files or use "." to stage all.',
    input_schema: {
      type: "object",
      properties: {
        files: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } }
          ],
          description: 'File(s) to stage. Use "." for all files.'
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory"
        }
      },
      required: ["files"]
    }
  },
  {
    name: "git_commit",
    description: "Create a git commit with the staged changes.",
    input_schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The commit message"
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory"
        }
      },
      required: ["message"]
    }
  },
  {
    name: "git_log",
    description: "Show recent git commits.",
    input_schema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of commits to show (default: 10)"
        },
        oneline: {
          type: "boolean",
          description: "Show compact one-line format (default: false)"
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory"
        }
      },
      required: []
    }
  },
  {
    name: "git_checkout",
    description: "Switch branches or restore files. Can create a new branch with the create option.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Branch name or commit to checkout"
        },
        create: {
          type: "boolean",
          description: "Create a new branch (default: false)"
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory"
        }
      },
      required: ["target"]
    }
  }
];
async function executeGitTool(name, args) {
  const cwd = args.cwd;
  switch (name) {
    case "git_status":
      return gitStatus(cwd);
    case "git_diff":
      return gitDiff({
        staged: args.staged,
        file: args.file
      }, cwd);
    case "git_add":
      return gitAdd(args.files, cwd);
    case "git_commit":
      return gitCommit(args.message, cwd);
    case "git_log":
      return gitLog({
        count: args.count,
        oneline: args.oneline
      }, cwd);
    case "git_checkout":
      return gitCheckout(args.target, {
        create: args.create
      }, cwd);
    default:
      return { success: false, error: `Unknown git tool: ${name}` };
  }
}

// src/tools/web.ts
async function searchWithExa(query, apiKey, options = {}) {
  const { maxResults = 10, includeText = true } = options;
  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        type: "auto",
        // Let Exa decide between neural and keyword search
        contents: includeText ? {
          text: {
            maxCharacters: 1e3
            // Limit text length per result
          }
        } : void 0
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return {
      success: true,
      data: {
        query,
        source: "exa",
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.text?.slice(0, 500) || "",
          publishedDate: r.publishedDate,
          author: r.author
        }))
      }
    };
  } catch (error2) {
    return {
      success: false,
      error: `Exa search failed: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
async function answerWithExa(query, apiKey) {
  try {
    const response = await fetch("https://api.exa.ai/answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        query,
        text: true
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa Answer API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return {
      success: true,
      data: {
        query,
        source: "exa",
        answer: data.answer,
        citations: data.citations?.map((c) => ({
          title: c.title,
          url: c.url
        })) || []
      }
    };
  } catch (error2) {
    return {
      success: false,
      error: `Exa answer failed: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
async function searchWithDuckDuckGo(query, options = {}) {
  const { maxResults = 10 } = options;
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      }
    );
    if (!response.ok) {
      throw new Error(`DuckDuckGo error: ${response.status}`);
    }
    const html = await response.text();
    const results = [];
    const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*)/g;
    let linkMatch;
    const snippets = [];
    let snippetMatch;
    while ((snippetMatch = snippetPattern.exec(html)) !== null) {
      snippets.push(snippetMatch[1].trim());
    }
    let i = 0;
    while ((linkMatch = resultPattern.exec(html)) !== null && results.length < maxResults) {
      let url = linkMatch[1];
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }
      results.push({
        title: linkMatch[2].trim(),
        url,
        snippet: snippets[i] || ""
      });
      i++;
    }
    if (results.length === 0) {
      return {
        success: true,
        data: {
          query,
          source: "duckduckgo",
          results: [],
          note: "No results found. DuckDuckGo may be rate-limiting. Consider setting EXA_API_KEY for better results."
        }
      };
    }
    return {
      success: true,
      data: {
        query,
        source: "duckduckgo",
        results,
        note: "Using DuckDuckGo (free). Set EXA_API_KEY for better AI-powered search results."
      }
    };
  } catch (error2) {
    return {
      success: false,
      error: `DuckDuckGo search failed: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
async function webSearch(query, options = {}) {
  const exaKey = process.env.EXA_API_KEY;
  if (exaKey) {
    return searchWithExa(query, exaKey, options);
  }
  return searchWithDuckDuckGo(query, options);
}
async function webAnswer(query) {
  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return {
      success: false,
      error: "EXA_API_KEY is required for web_answer. Get one at https://dashboard.exa.ai"
    };
  }
  return answerWithExa(query, exaKey);
}
async function fetchUrl(url, options = {}) {
  const { maxLength = 5e4 } = options;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "";
    let content = await response.text();
    if (content.length > maxLength) {
      content = content.slice(0, maxLength) + "\n\n[Content truncated...]";
    }
    if (contentType.includes("text/html")) {
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    return {
      success: true,
      data: {
        url,
        contentType,
        length: content.length,
        content
      }
    };
  } catch (error2) {
    return {
      success: false,
      error: `Failed to fetch URL: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
var webTools = [
  {
    name: "web_search",
    description: "Search the web for information. Returns titles, URLs, and snippets from search results. Uses Exa AI search if EXA_API_KEY is set (recommended), otherwise falls back to DuckDuckGo.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query"
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 10)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "web_answer",
    description: "Get an AI-generated answer to a question with citations, powered by Exa. Requires EXA_API_KEY. Best for factual questions that need grounded answers.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The question to answer"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch_url",
    description: "Fetch the content of a URL. Returns the text content of the page. Useful for reading articles, documentation, or any web page.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch"
        },
        max_length: {
          type: "number",
          description: "Maximum content length to return (default: 50000 characters)"
        }
      },
      required: ["url"]
    }
  }
];
async function executeWebTool(name, args) {
  switch (name) {
    case "web_search":
      return webSearch(args.query, {
        maxResults: args.max_results
      });
    case "web_answer":
      return webAnswer(args.query);
    case "fetch_url":
      return fetchUrl(args.url, {
        maxLength: args.max_length
      });
    default:
      return { success: false, error: `Unknown web tool: ${name}` };
  }
}

// src/tools/index.ts
var localTools = [
  ...filesystemTools,
  ...shellTools,
  ...gitTools,
  ...webTools
];
var localToolNames = new Set(localTools.map((t) => t.name));
function isLocalTool(name) {
  return localToolNames.has(name);
}
async function executeLocalTool(name, args) {
  if (filesystemTools.some((t) => t.name === name)) {
    return executeFilesystemTool(name, args);
  }
  if (shellTools.some((t) => t.name === name)) {
    return executeShellTool(name, args);
  }
  if (gitTools.some((t) => t.name === name)) {
    return executeGitTool(name, args);
  }
  if (webTools.some((t) => t.name === name)) {
    return executeWebTool(name, args);
  }
  return { success: false, error: `Unknown local tool: ${name}` };
}

// src/agent/pricing.ts
var MODELS = {
  "claude-opus-4-5-20250929": {
    id: "claude-opus-4-5-20250929",
    name: "opus-4.5",
    displayName: "Claude Opus 4.5",
    pricing: {
      inputPerMTok: 5,
      outputPerMTok: 25,
      cacheWritePerMTok: 6.25,
      // 1.25x input
      cacheReadPerMTok: 0.5
      // 0.1x input
    },
    contextWindow: 2e5,
    description: "Most capable model. Best for complex reasoning and creative tasks."
  },
  "claude-sonnet-4-5-20250929": {
    id: "claude-sonnet-4-5-20250929",
    name: "sonnet-4.5",
    displayName: "Claude Sonnet 4.5",
    pricing: {
      inputPerMTok: 3,
      outputPerMTok: 15,
      cacheWritePerMTok: 3.75,
      // 1.25x input
      cacheReadPerMTok: 0.3
      // 0.1x input
    },
    contextWindow: 2e5,
    description: "Balanced performance and cost. Great for most coding and trading tasks."
  },
  "claude-haiku-4-5-20250929": {
    id: "claude-haiku-4-5-20250929",
    name: "haiku-4.5",
    displayName: "Claude Haiku 4.5",
    pricing: {
      inputPerMTok: 1,
      outputPerMTok: 5,
      cacheWritePerMTok: 1.25,
      // 1.25x input
      cacheReadPerMTok: 0.1
      // 0.1x input
    },
    contextWindow: 2e5,
    description: "Fastest and most economical. Good for simple tasks and high volume."
  }
};
var DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
var MODEL_ALIASES = {
  "opus": "claude-opus-4-5-20250929",
  "opus-4.5": "claude-opus-4-5-20250929",
  "sonnet": "claude-sonnet-4-5-20250929",
  "sonnet-4.5": "claude-sonnet-4-5-20250929",
  "haiku": "claude-haiku-4-5-20250929",
  "haiku-4.5": "claude-haiku-4-5-20250929"
};
function resolveModelId(nameOrAlias) {
  const lower = nameOrAlias.toLowerCase();
  if (MODELS[lower]) {
    return lower;
  }
  if (MODEL_ALIASES[lower]) {
    return MODEL_ALIASES[lower];
  }
  for (const [id, config] of Object.entries(MODELS)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  if (OPENROUTER_MODELS[lower]) {
    return lower;
  }
  if (OPENROUTER_MODEL_ALIASES[lower]) {
    return OPENROUTER_MODEL_ALIASES[lower];
  }
  for (const [id, config] of Object.entries(OPENROUTER_MODELS)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  if (nameOrAlias.includes("/")) {
    return nameOrAlias;
  }
  return null;
}
function getModelPricing(modelId) {
  const anthropicModel = MODELS[modelId];
  if (anthropicModel?.pricing) {
    return anthropicModel.pricing;
  }
  const openrouterModel = OPENROUTER_MODELS[modelId];
  if (openrouterModel?.pricing) {
    return openrouterModel.pricing;
  }
  return null;
}
function getModelConfig(modelId) {
  return MODELS[modelId] ?? OPENROUTER_MODELS[modelId] ?? null;
}
function calculateCost(modelId, inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0) {
  const pricing = getModelPricing(modelId);
  if (!pricing) {
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
function calculateCostWithPricing(pricing, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
  const inputCost = inputTokens / 1e6 * pricing.inputPerMTok;
  const outputCost = outputTokens / 1e6 * pricing.outputPerMTok;
  const cacheWriteCost = cacheCreationTokens / 1e6 * pricing.cacheWritePerMTok;
  const cacheReadCost = cacheReadTokens / 1e6 * pricing.cacheReadPerMTok;
  return {
    inputCost,
    outputCost,
    cacheWriteCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost
  };
}
function formatCost(cost) {
  if (cost < 0.01) {
    const cents = cost * 100;
    return `${cents.toFixed(3)}\xA2`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}
function listModels() {
  return Object.values(MODELS);
}
var OPENROUTER_MODELS = {
  "z-ai/glm-4.7": {
    id: "z-ai/glm-4.7",
    name: "glm-4.7",
    displayName: "GLM 4.7",
    pricing: {
      inputPerMTok: 0.4,
      outputPerMTok: 1.5,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0
    },
    contextWindow: 202752,
    description: "Z.AI flagship. Enhanced programming, multi-step reasoning, agent tasks."
  },
  "minimax/minimax-m2.1": {
    id: "minimax/minimax-m2.1",
    name: "minimax-m2.1",
    displayName: "MiniMax M2.1",
    pricing: {
      inputPerMTok: 0.3,
      outputPerMTok: 1.2,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0
    },
    contextWindow: 204800,
    description: "Lightweight, optimized for coding and agentic workflows."
  },
  "deepseek/deepseek-chat": {
    id: "deepseek/deepseek-chat",
    name: "deepseek-chat",
    displayName: "DeepSeek Chat",
    pricing: {
      inputPerMTok: 0.14,
      outputPerMTok: 0.28,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0
    },
    contextWindow: 128e3,
    description: "Ultra-cheap, strong coding and reasoning. Great for high-volume."
  },
  "google/gemini-2.0-flash-001": {
    id: "google/gemini-2.0-flash-001",
    name: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    pricing: {
      inputPerMTok: 0.1,
      outputPerMTok: 0.4,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0
    },
    contextWindow: 1e6,
    description: "Google's fast multimodal model. 1M context window."
  },
  "qwen/qwen-2.5-coder-32b-instruct": {
    id: "qwen/qwen-2.5-coder-32b-instruct",
    name: "qwen-coder-32b",
    displayName: "Qwen 2.5 Coder 32B",
    pricing: {
      inputPerMTok: 0.18,
      outputPerMTok: 0.18,
      cacheWritePerMTok: 0,
      cacheReadPerMTok: 0
    },
    contextWindow: 32768,
    description: "Alibaba's coding specialist. Excellent for code generation."
  }
};
var OPENROUTER_MODEL_ALIASES = {
  "glm": "z-ai/glm-4.7",
  "glm-4.7": "z-ai/glm-4.7",
  "minimax": "minimax/minimax-m2.1",
  "deepseek": "deepseek/deepseek-chat",
  "gemini": "google/gemini-2.0-flash-001",
  "gemini-flash": "google/gemini-2.0-flash-001",
  "qwen": "qwen/qwen-2.5-coder-32b-instruct",
  "qwen-coder": "qwen/qwen-2.5-coder-32b-instruct"
};

// src/agent/provider.ts
import Anthropic from "@anthropic-ai/sdk";

// src/agent/openrouter.ts
var OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
var OPENROUTER_MODELS2 = {
  // Z.AI GLM models
  "z-ai/glm-4.7": {
    id: "z-ai/glm-4.7",
    name: "glm-4.7",
    displayName: "GLM 4.7",
    provider: "Z.AI",
    pricing: {
      inputPerMTok: 0.4,
      outputPerMTok: 1.5
    },
    contextWindow: 202752,
    maxOutputTokens: 65536,
    supportsTools: true,
    supportsReasoning: true,
    description: "Z.AI flagship. Enhanced programming, multi-step reasoning, agent tasks."
  },
  // MiniMax models - very cost effective
  "minimax/minimax-m2.1": {
    id: "minimax/minimax-m2.1",
    name: "minimax-m2.1",
    displayName: "MiniMax M2.1",
    provider: "MiniMax",
    pricing: {
      inputPerMTok: 0.3,
      // $0.0000003 * 1M
      outputPerMTok: 1.2,
      // $0.0000012 * 1M
      cacheReadPerMTok: 0.03,
      cacheWritePerMTok: 0.375
    },
    contextWindow: 204800,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsReasoning: true,
    description: "10B active params, state-of-the-art for coding and agentic workflows. Very cost efficient."
  },
  "minimax/minimax-m2": {
    id: "minimax/minimax-m2",
    name: "minimax-m2",
    displayName: "MiniMax M2",
    provider: "MiniMax",
    pricing: {
      inputPerMTok: 0.2,
      outputPerMTok: 1,
      cacheReadPerMTok: 0.03
    },
    contextWindow: 196608,
    maxOutputTokens: 131072,
    supportsTools: true,
    supportsReasoning: true,
    description: "Compact model optimized for end-to-end coding and agentic workflows."
  },
  // DeepSeek models - very cheap
  "deepseek/deepseek-v3.2": {
    id: "deepseek/deepseek-v3.2",
    name: "deepseek-v3.2",
    displayName: "DeepSeek V3.2",
    provider: "DeepSeek",
    pricing: {
      inputPerMTok: 0.224,
      outputPerMTok: 0.32
    },
    contextWindow: 163840,
    supportsTools: true,
    supportsReasoning: true,
    description: "High efficiency with strong reasoning. GPT-5 class performance."
  },
  // Mistral models
  "mistralai/devstral-2512": {
    id: "mistralai/devstral-2512",
    name: "devstral-2512",
    displayName: "Devstral 2 2512",
    provider: "Mistral",
    pricing: {
      inputPerMTok: 0.05,
      outputPerMTok: 0.22
    },
    contextWindow: 262144,
    supportsTools: true,
    description: "State-of-the-art open model for agentic coding. 123B params."
  },
  "mistralai/mistral-large-2512": {
    id: "mistralai/mistral-large-2512",
    name: "mistral-large-2512",
    displayName: "Mistral Large 3",
    provider: "Mistral",
    pricing: {
      inputPerMTok: 0.5,
      outputPerMTok: 1.5
    },
    contextWindow: 262144,
    supportsTools: true,
    description: "Most capable Mistral model. 675B total params (41B active)."
  },
  // Google Gemini
  "google/gemini-3-flash-preview": {
    id: "google/gemini-3-flash-preview",
    name: "gemini-3-flash",
    displayName: "Gemini 3 Flash Preview",
    provider: "Google",
    pricing: {
      inputPerMTok: 0.5,
      outputPerMTok: 3,
      cacheReadPerMTok: 0.05
    },
    contextWindow: 1048576,
    supportsTools: true,
    supportsReasoning: true,
    description: "High speed thinking model for agentic workflows. 1M context."
  },
  "google/gemini-3-pro-preview": {
    id: "google/gemini-3-pro-preview",
    name: "gemini-3-pro",
    displayName: "Gemini 3 Pro Preview",
    provider: "Google",
    pricing: {
      inputPerMTok: 2,
      outputPerMTok: 12,
      cacheReadPerMTok: 0.2,
      cacheWritePerMTok: 2.375
    },
    contextWindow: 1048576,
    supportsTools: true,
    supportsReasoning: true,
    description: "Flagship frontier model for high-precision multimodal reasoning."
  },
  // xAI Grok
  "x-ai/grok-4.1-fast": {
    id: "x-ai/grok-4.1-fast",
    name: "grok-4.1-fast",
    displayName: "Grok 4.1 Fast",
    provider: "xAI",
    pricing: {
      inputPerMTok: 0.2,
      outputPerMTok: 0.5,
      cacheReadPerMTok: 0.05
    },
    contextWindow: 2e6,
    maxOutputTokens: 3e4,
    supportsTools: true,
    supportsReasoning: true,
    description: "Best agentic tool calling model. 2M context window."
  },
  // Anthropic via OpenRouter (for fallback/comparison)
  "anthropic/claude-opus-4.5": {
    id: "anthropic/claude-opus-4.5",
    name: "claude-opus-4.5-or",
    displayName: "Claude Opus 4.5 (OR)",
    provider: "Anthropic",
    pricing: {
      inputPerMTok: 5,
      outputPerMTok: 25,
      cacheReadPerMTok: 0.5,
      cacheWritePerMTok: 6.25
    },
    contextWindow: 2e5,
    maxOutputTokens: 32e3,
    supportsTools: true,
    supportsReasoning: true,
    description: "Anthropic Opus 4.5 via OpenRouter."
  },
  "anthropic/claude-haiku-4.5": {
    id: "anthropic/claude-haiku-4.5",
    name: "claude-haiku-4.5-or",
    displayName: "Claude Haiku 4.5 (OR)",
    provider: "Anthropic",
    pricing: {
      inputPerMTok: 1,
      outputPerMTok: 5,
      cacheReadPerMTok: 0.1,
      cacheWritePerMTok: 1.25
    },
    contextWindow: 2e5,
    maxOutputTokens: 64e3,
    supportsTools: true,
    supportsReasoning: true,
    description: "Anthropic Haiku 4.5 via OpenRouter. Fast and efficient."
  },
  // Free models (for testing/experimentation)
  "mistralai/devstral-2512:free": {
    id: "mistralai/devstral-2512:free",
    name: "devstral-free",
    displayName: "Devstral 2 (Free)",
    provider: "Mistral",
    pricing: {
      inputPerMTok: 0,
      outputPerMTok: 0
    },
    contextWindow: 262144,
    supportsTools: true,
    description: "Free tier Devstral for testing. Limited capacity."
  },
  "xiaomi/mimo-v2-flash:free": {
    id: "xiaomi/mimo-v2-flash:free",
    name: "mimo-v2-flash-free",
    displayName: "MiMo V2 Flash (Free)",
    provider: "Xiaomi",
    pricing: {
      inputPerMTok: 0,
      outputPerMTok: 0
    },
    contextWindow: 262144,
    supportsTools: true,
    supportsReasoning: true,
    description: "Free MoE model. Top open-source on SWE-bench."
  }
};
var OPENROUTER_ALIASES = {
  // Z.AI GLM
  "glm": "z-ai/glm-4.7",
  "glm-4.7": "z-ai/glm-4.7",
  // MiniMax
  "minimax": "minimax/minimax-m2.1",
  "m2": "minimax/minimax-m2",
  "m2.1": "minimax/minimax-m2.1",
  // DeepSeek  
  "deepseek": "deepseek/deepseek-v3.2",
  "ds": "deepseek/deepseek-v3.2",
  // Mistral
  "devstral": "mistralai/devstral-2512",
  "mistral": "mistralai/mistral-large-2512",
  "mistral-large": "mistralai/mistral-large-2512",
  // Google
  "gemini": "google/gemini-3-flash-preview",
  "gemini-flash": "google/gemini-3-flash-preview",
  "gemini-pro": "google/gemini-3-pro-preview",
  // xAI
  "grok": "x-ai/grok-4.1-fast",
  // Anthropic via OR
  "opus-or": "anthropic/claude-opus-4.5",
  "haiku-or": "anthropic/claude-haiku-4.5",
  // Free
  "free": "mistralai/devstral-2512:free",
  "mimo": "xiaomi/mimo-v2-flash:free"
};
function resolveOpenRouterModelId(nameOrAlias) {
  const lower = nameOrAlias.toLowerCase();
  if (OPENROUTER_MODELS2[lower]) {
    return lower;
  }
  if (OPENROUTER_ALIASES[lower]) {
    return OPENROUTER_ALIASES[lower];
  }
  for (const [id, config] of Object.entries(OPENROUTER_MODELS2)) {
    if (config.name.toLowerCase() === lower) {
      return id;
    }
  }
  if (nameOrAlias.includes("/")) {
    return nameOrAlias;
  }
  return null;
}
function getOpenRouterModelConfig(modelId) {
  return OPENROUTER_MODELS2[modelId] ?? null;
}
function convertToOpenAITools(anthropicTools) {
  return anthropicTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.input_schema
    }
  }));
}
var OpenRouterClient = class {
  apiKey;
  baseUrl;
  appName;
  appUrl;
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? OPENROUTER_BASE_URL;
    this.appName = config.appName ?? "Quantish Agent";
    this.appUrl = config.appUrl ?? "https://quantish.ai";
  }
  /**
   * Create a chat completion (non-streaming)
   */
  async createChatCompletion(options) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.appUrl,
        "X-Title": this.appName
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tool_choice ?? (options.tools ? "auto" : void 0),
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        stream: false
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }
    return response.json();
  }
  /**
   * Create a streaming chat completion
   */
  async *createStreamingChatCompletion(options) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.appUrl,
        "X-Title": this.appName
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tool_choice ?? (options.tools ? "auto" : void 0),
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        stream: true
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }
    if (!response.body) {
      throw new Error("No response body for streaming request");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            yield json;
          } catch {
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  /**
   * Get generation details including exact cost
   */
  async getGenerationDetails(generationId) {
    const response = await fetch(`${this.baseUrl}/generation?id=${generationId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }
    return response.json();
  }
  /**
   * List available models
   */
  async listModels() {
    const response = await fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }
    return response.json();
  }
};
function calculateOpenRouterCost(modelId, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  let config = getOpenRouterModelConfig(modelId);
  if (!config) {
    config = getOpenRouterModelConfig(modelId.toLowerCase());
  }
  if (!config) {
    const lower = modelId.toLowerCase();
    for (const [key, model] of Object.entries(OPENROUTER_MODELS2)) {
      if (key.toLowerCase() === lower || model.name.toLowerCase() === lower) {
        config = model;
        break;
      }
    }
    if (!config && OPENROUTER_ALIASES[lower]) {
      config = OPENROUTER_MODELS2[OPENROUTER_ALIASES[lower]];
    }
  }
  const pricing = config?.pricing ?? {
    inputPerMTok: 0.4,
    // GLM 4.7 pricing as fallback
    outputPerMTok: 1.5,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0
  };
  const inputCost = inputTokens / 1e6 * pricing.inputPerMTok;
  const outputCost = outputTokens / 1e6 * pricing.outputPerMTok;
  const cacheReadCost = cacheReadTokens / 1e6 * (pricing.cacheReadPerMTok ?? 0);
  const cacheWriteCost = cacheWriteTokens / 1e6 * (pricing.cacheWritePerMTok ?? 0);
  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost
  };
}
function listOpenRouterModels() {
  return Object.values(OPENROUTER_MODELS2);
}

// src/agent/provider.ts
var AnthropicProvider = class {
  client;
  config;
  constructor(config) {
    this.config = config;
    const headers = {};
    if (config.contextEditing && config.contextEditing.length > 0) {
      headers["anthropic-beta"] = "context-management-2025-06-27";
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      defaultHeaders: Object.keys(headers).length > 0 ? headers : void 0
    });
  }
  getModel() {
    return this.config.model;
  }
  async countTokens(messages) {
    try {
      const response = await this.client.messages.countTokens({
        model: this.config.model,
        system: this.config.systemPrompt,
        tools: this.config.tools,
        messages
      });
      return response.input_tokens;
    } catch {
      return 0;
    }
  }
  async chat(messages) {
    const systemWithCache = [
      {
        type: "text",
        text: this.config.systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ];
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemWithCache,
      tools: this.config.tools,
      messages
    });
    const usage = response.usage;
    const cost = calculateCost(
      this.config.model,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens ?? 0,
      usage.cache_read_input_tokens ?? 0
    );
    const textBlocks = response.content.filter(
      (block) => block.type === "text"
    );
    const toolUses = response.content.filter(
      (block) => block.type === "tool_use"
    );
    return {
      text: textBlocks.map((b) => b.text).join(""),
      toolCalls: toolUses.map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input
      })),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0
      },
      cost,
      stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      rawResponse: response
    };
  }
  async streamChat(messages, callbacks) {
    const systemWithCache = [
      {
        type: "text",
        text: this.config.systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ];
    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemWithCache,
      tools: this.config.tools,
      messages
    });
    let fullText = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta" && delta.text) {
          fullText += delta.text;
          callbacks.onText?.(delta.text);
        } else if (delta.type === "thinking_delta" && delta.thinking) {
          callbacks.onThinking?.(delta.thinking);
        }
      }
    }
    const response = await stream.finalMessage();
    const usage = response.usage;
    const cost = calculateCost(
      this.config.model,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens ?? 0,
      usage.cache_read_input_tokens ?? 0
    );
    const toolUses = response.content.filter(
      (block) => block.type === "tool_use"
    );
    for (const tool of toolUses) {
      callbacks.onToolCall?.(tool.id, tool.name, tool.input);
    }
    return {
      text: fullText,
      toolCalls: toolUses.map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input
      })),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0
      },
      cost,
      stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      rawResponse: response
    };
  }
};
var OpenRouterProvider = class {
  client;
  config;
  openaiTools;
  constructor(config) {
    this.config = config;
    this.client = new OpenRouterClient({
      apiKey: config.apiKey
    });
    this.openaiTools = convertToOpenAITools(config.tools);
  }
  getModel() {
    return this.config.model;
  }
  async countTokens(_messages) {
    const text = JSON.stringify(_messages);
    return Math.ceil(text.length / 4);
  }
  /**
   * Convert Anthropic message format to OpenAI format
   */
  convertMessages(messages) {
    const result = [];
    result.push({
      role: "system",
      content: this.config.systemPrompt
    });
    for (const msg of messages) {
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          result.push({ role: "user", content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const toolResults = msg.content.filter(
            (block) => block.type === "tool_result"
          );
          if (toolResults.length > 0) {
            for (const tr of toolResults) {
              const toolResult = tr;
              result.push({
                role: "tool",
                tool_call_id: toolResult.tool_use_id,
                content: typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content)
              });
            }
          } else {
            const textContent = msg.content.filter((block) => block.type === "text").map((block) => block.text).join("");
            if (textContent) {
              result.push({ role: "user", content: textContent });
            }
          }
        }
      } else if (msg.role === "assistant") {
        if (typeof msg.content === "string") {
          result.push({ role: "assistant", content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const textBlocks = msg.content.filter(
            (block) => block.type === "text"
          );
          const toolUses = msg.content.filter(
            (block) => block.type === "tool_use"
          );
          const textContent = textBlocks.map((b) => b.text).join("");
          if (toolUses.length > 0) {
            result.push({
              role: "assistant",
              content: textContent || null,
              tool_calls: toolUses.map((t) => ({
                id: t.id,
                type: "function",
                function: {
                  name: t.name,
                  arguments: JSON.stringify(t.input)
                }
              }))
            });
          } else {
            result.push({ role: "assistant", content: textContent });
          }
        }
      }
    }
    return result;
  }
  async chat(messages) {
    const openaiMessages = this.convertMessages(messages);
    const response = await this.client.createChatCompletion({
      model: this.config.model,
      messages: openaiMessages,
      tools: this.openaiTools.length > 0 ? this.openaiTools : void 0,
      max_tokens: this.config.maxTokens
    });
    const choice = response.choices[0];
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const cost = calculateOpenRouterCost(
      this.config.model,
      usage.prompt_tokens,
      usage.completion_tokens
    );
    const toolCalls = choice.message.tool_calls ?? [];
    return {
      text: choice.message.content ?? "",
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments)
      })),
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0
      },
      cost,
      stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
      rawResponse: response
    };
  }
  async streamChat(messages, callbacks) {
    const openaiMessages = this.convertMessages(messages);
    let fullText = "";
    const toolCallsInProgress = /* @__PURE__ */ new Map();
    let finishReason = null;
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const stream = this.client.createStreamingChatCompletion({
      model: this.config.model,
      messages: openaiMessages,
      tools: this.openaiTools.length > 0 ? this.openaiTools : void 0,
      max_tokens: this.config.maxTokens
    });
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.delta.content) {
        fullText += choice.delta.content;
        callbacks.onText?.(choice.delta.content);
      }
      if (choice.delta.tool_calls) {
        for (const tcDelta of choice.delta.tool_calls) {
          const existing = toolCallsInProgress.get(tcDelta.index);
          if (!existing) {
            toolCallsInProgress.set(tcDelta.index, {
              id: tcDelta.id ?? "",
              name: tcDelta.function?.name ?? "",
              arguments: tcDelta.function?.arguments ?? ""
            });
          } else {
            if (tcDelta.id) existing.id = tcDelta.id;
            if (tcDelta.function?.name) existing.name = tcDelta.function.name;
            if (tcDelta.function?.arguments) existing.arguments += tcDelta.function.arguments;
          }
        }
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
    const toolCalls = [];
    for (const [, tc] of toolCallsInProgress) {
      try {
        if (!tc || !tc.name) {
          continue;
        }
        let toolName = tc.name;
        if (toolName.includes("<")) {
          toolName = toolName.split("<")[0];
        }
        if (toolName.includes("(")) {
          toolName = toolName.split("(")[0];
        }
        toolName = toolName.trim();
        let args = tc.arguments?.trim() || "{}";
        if (args.includes("<arg_key>") || args.includes("</arg_key>")) {
          args = args.replace(/<\/?arg_key>/g, "");
          if (!args.startsWith("{")) {
            const keyValuePairs = [];
            const kvMatches = args.matchAll(/(\w+):\s*(?:"([^"]+)"|(\d+)|(\w+))/g);
            for (const match of kvMatches) {
              const key = match[1];
              const value = match[2] ?? match[3] ?? match[4];
              if (match[3]) {
                keyValuePairs.push(`"${key}": ${value}`);
              } else {
                keyValuePairs.push(`"${key}": "${value}"`);
              }
            }
            if (keyValuePairs.length > 0) {
              args = `{${keyValuePairs.join(", ")}}`;
            }
          }
        }
        if (args && !args.endsWith("}") && !args.endsWith("]")) {
          const openBraces = (args.match(/{/g) || []).length;
          const closeBraces = (args.match(/}/g) || []).length;
          if (openBraces > closeBraces) {
            args = args + "}".repeat(openBraces - closeBraces);
          }
        }
        if (!args || args === "" || args === "undefined") {
          args = "{}";
        }
        const input = JSON.parse(args);
        const toolId = tc.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        toolCalls.push({ id: toolId, name: toolName, input });
        callbacks.onToolCall?.(toolId, toolName, input);
      } catch (e) {
        const cleanToolName = tc?.name?.split("<")[0]?.split("(")[0]?.trim() || "unknown_tool";
        let parsedInput = {};
        try {
          const argsStr = tc?.arguments || "";
          const matches = argsStr.matchAll(/(\w+):\s*"([^"]+)"/g);
          for (const match of matches) {
            parsedInput[match[1]] = match[2];
          }
        } catch {
        }
        const toolId = tc?.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        toolCalls.push({ id: toolId, name: cleanToolName, input: parsedInput });
        callbacks.onToolCall?.(toolId, cleanToolName, parsedInput);
      }
    }
    const cost = calculateOpenRouterCost(
      this.config.model,
      usage.prompt_tokens,
      usage.completion_tokens
    );
    return {
      text: fullText,
      toolCalls,
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0
      },
      cost,
      stopReason: finishReason === "tool_calls" ? "tool_use" : "end_turn"
    };
  }
};
function createLLMProvider(config) {
  if (config.provider === "openrouter") {
    return new OpenRouterProvider(config);
  }
  return new AnthropicProvider(config);
}

// src/agent/loop.ts
var MAX_TOOL_RESULT_CHARS = 8e3;
function truncateToolResult(result, toolName) {
  const resultStr = JSON.stringify(result);
  if (resultStr.length <= MAX_TOOL_RESULT_CHARS) {
    return result;
  }
  if (typeof result === "object" && result !== null) {
    const obj = result;
    if (Array.isArray(obj.content) && obj.content.length > 0) {
      const firstContent = obj.content[0];
      if (firstContent?.type === "text" && typeof firstContent.text === "string") {
        try {
          const innerData = JSON.parse(firstContent.text);
          const truncatedInner = truncateDataObject(innerData);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(truncatedInner)
            }]
          };
        } catch {
          const truncatedText = firstContent.text.length > MAX_TOOL_RESULT_CHARS ? firstContent.text.substring(0, MAX_TOOL_RESULT_CHARS) + "... [truncated]" : firstContent.text;
          return {
            content: [{
              type: "text",
              text: truncatedText
            }]
          };
        }
      }
    }
  }
  if (Array.isArray(result)) {
    return truncateArray(result);
  }
  if (typeof result === "object" && result !== null) {
    return truncateDataObject(result);
  }
  if (typeof result === "string" && result.length > MAX_TOOL_RESULT_CHARS) {
    return result.substring(0, MAX_TOOL_RESULT_CHARS) + "... [truncated]";
  }
  return result;
}
function truncateArray(arr) {
  const MAX_ITEMS = 5;
  const truncated = arr.slice(0, MAX_ITEMS).map(
    (item) => typeof item === "object" && item !== null ? truncateObject(item) : item
  );
  return {
    _truncated: arr.length > MAX_ITEMS,
    _originalCount: arr.length,
    _note: arr.length > MAX_ITEMS ? `Showing ${MAX_ITEMS} of ${arr.length} items.` : void 0,
    items: truncated
  };
}
function truncateDataObject(obj) {
  const truncated = {};
  const MAX_ARRAY_ITEMS = 5;
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ITEMS) {
        truncated[key] = value.slice(0, MAX_ARRAY_ITEMS).map(
          (item) => typeof item === "object" && item !== null ? truncateObject(item) : item
        );
        truncated[`_${key}Count`] = value.length;
        truncated["_truncated"] = true;
      } else {
        truncated[key] = value.map(
          (item) => typeof item === "object" && item !== null ? truncateObject(item) : item
        );
      }
    } else if (typeof value === "object" && value !== null) {
      truncated[key] = truncateObject(value);
    } else if (typeof value === "string" && value.length > 500) {
      truncated[key] = value.substring(0, 500) + "...";
    } else {
      truncated[key] = value;
    }
  }
  return truncated;
}
var ACTIONABLE_FIELDS = /* @__PURE__ */ new Set([
  // Market identifiers (required for trading)
  "conditionId",
  "tokenId",
  "marketId",
  "id",
  "ticker",
  // Token info (required for order placement)  
  "token_id",
  "clobTokenIds",
  "tokens",
  // Pricing (required for trading decisions)
  "price",
  "probability",
  "outcomePrices",
  "bestBid",
  "bestAsk",
  // Market identity (for user understanding)
  "title",
  "question",
  "slug",
  "outcome",
  "name",
  // Status info (affects tradability)
  "active",
  "closed",
  "status",
  "endDate",
  // Platform (for multi-platform support)
  "platform"
]);
var SUMMARY_FIELDS = /* @__PURE__ */ new Set([
  "volume",
  "liquidity",
  "volume24hr"
]);
var DROP_FIELDS = /* @__PURE__ */ new Set([
  "description",
  "rules",
  "resolutionSource",
  "image",
  "icon",
  "createdAt",
  "updatedAt",
  "lastTradePrice",
  "spread",
  "acceptingOrders",
  "acceptingOrdersTimestamp",
  "minimum_tick_size",
  "minimum_order_size",
  "maker_base_fee",
  "taker_base_fee",
  "neg_risk",
  "neg_risk_market_id",
  "neg_risk_request_id",
  "notifications_enabled",
  "is_50_50_outcome",
  "game_start_time",
  "seconds_delay",
  "icon",
  "fpmm",
  "rewards",
  "competitive"
]);
function truncateObject(obj) {
  const truncated = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DROP_FIELDS.has(key)) continue;
    if (ACTIONABLE_FIELDS.has(key)) {
      if (typeof value === "string" && value.length > 150) {
        truncated[key] = value.substring(0, 150) + "...";
      } else if (Array.isArray(value)) {
        truncated[key] = value.slice(0, 10).map((item) => {
          if (typeof item === "object" && item !== null) {
            return extractTokenInfo(item);
          }
          return item;
        });
      } else {
        truncated[key] = value;
      }
      continue;
    }
    if (SUMMARY_FIELDS.has(key)) {
      if (typeof value === "number" || typeof value === "string") {
        truncated[key] = value;
      }
      continue;
    }
    if (typeof value !== "object" && JSON.stringify(truncated).length < 800) {
      truncated[key] = value;
    }
  }
  return truncated;
}
function extractTokenInfo(token) {
  return {
    token_id: token.token_id ?? token.tokenId,
    outcome: token.outcome ?? token.name,
    price: token.price ?? token.probability
  };
}
var DEFAULT_SYSTEM_PROMPT = `You are Quantish, an AI trading agent for prediction markets.

## CRITICAL: Efficient Market Searching

When user asks to find markets:
1. Call search_markets ONCE with a good query
2. Present results in a clean table
3. STOP. Wait for user to ask for more.

**DO NOT** make multiple searches or call get_market_details on every result.
search_markets already returns prices, volume, and liquidity.

## Tools Available

**Discovery MCP** (market data - prices included):
- search_markets(query, limit=10) \u2192 Markets WITH prices from Polymarket/Kalshi/Limitless
- get_market_details(platform, marketId) \u2192 Full details WITH prices for ONE market
- get_trending_markets(limit=10) \u2192 Hot markets by volume

**Polymarket Trading** (requires conditionId from Discovery results):
- place_order, cancel_order, get_orders, get_positions, get_balances
- get_price(tokenId) \u2192 Live price (only if you need real-time, Discovery already has prices)
- get_orderbook(tokenId) \u2192 Bid/ask depth

NOTE: Don't use get_market - use get_market_details from Discovery instead.

**Kalshi Trading** (via DFlow):
- kalshi_buy_yes, kalshi_buy_no, kalshi_get_positions, kalshi_get_balances

**Coding Tools** (for building apps/bots):
- read_file, write_file, edit_file, list_dir, grep, find_files
- run_command (blocking) - for npm install, build commands
- start_background_process (non-blocking) - for dev servers, watch mode
- get_process_output, list_processes, stop_process
- git operations: status, diff, add, commit

## CRITICAL: File Operations

**NEVER repeat the same operation.** If write_file or edit_file fails:
1. Stop and tell the user what went wrong
2. Do NOT retry with the same content
3. Do NOT delete and rewrite - use edit_file to fix specific issues

When writing code files:
- Write complete, valid code (not JSON-escaped strings)
- Create one file at a time, verify it works
- If you get stuck, ask the user for help

## Building Trading Bots

When user wants to build an app or bot:
1. Create files one at a time with write_file
2. The MCP servers are HTTP APIs - apps can call them directly
3. Use start_background_process for dev servers
4. API endpoints:
   - Discovery: https://discovery-mcp-production.up.railway.app (read-only, public)
   - Trading: https://quantish-mcp-production.up.railway.app (requires API key)

## Prices
- Polymarket: 0.01-0.99 (probability)
- Kalshi: percentages like 5% YES

Be concise. Present results clearly. Wait for user input.`;
var Agent = class _Agent {
  anthropic;
  llmProvider;
  mcpClient;
  mcpClientManager;
  config;
  conversationHistory = [];
  workingDirectory;
  sessionCost = 0;
  // Cumulative cost for this session
  // Loop detection: track last N tool calls to detect loops
  recentToolCalls = [];
  static MAX_RECENT_TOOL_CALLS = 5;
  static LOOP_THRESHOLD = 2;
  // Abort if same call appears this many times
  cumulativeTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
    sessionCost: 0
  };
  constructor(config) {
    this.config = {
      enableLocalTools: true,
      enableMCPTools: true,
      provider: "anthropic",
      // Default to Anthropic
      // Default context editing: clear old tool uses when context exceeds 100k tokens
      contextEditing: config.contextEditing || [
        {
          type: "clear_tool_uses_20250919",
          trigger: { type: "input_tokens", value: 1e5 },
          keep: { type: "tool_uses", value: 5 }
        }
      ],
      ...config
    };
    const headers = {};
    if (this.config.contextEditing && this.config.contextEditing.length > 0) {
      headers["anthropic-beta"] = "context-management-2025-06-27";
    }
    const anthropicKey = config.anthropicApiKey || "placeholder";
    this.anthropic = new Anthropic2({
      apiKey: anthropicKey,
      defaultHeaders: Object.keys(headers).length > 0 ? headers : void 0
    });
    this.mcpClient = config.mcpClient;
    this.mcpClientManager = config.mcpClientManager;
    this.workingDirectory = config.workingDirectory || process.cwd();
  }
  /**
   * Get the API key for the current provider
   */
  getApiKey() {
    if (this.config.provider === "openrouter") {
      return this.config.openrouterApiKey || "";
    }
    return this.config.anthropicApiKey || "";
  }
  /**
   * Check if using OpenRouter provider
   */
  isOpenRouter() {
    return this.config.provider === "openrouter";
  }
  /**
   * Get the current provider name
   */
  getProvider() {
    return this.config.provider || "anthropic";
  }
  /**
   * Set the LLM provider
   */
  setProvider(provider) {
    this.config.provider = provider;
    this.llmProvider = void 0;
  }
  /**
   * Get or create the LLM provider instance
   */
  async getOrCreateProvider() {
    if (this.llmProvider) {
      return this.llmProvider;
    }
    const allTools = await this.getAllTools();
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const defaultModel = this.config.provider === "openrouter" ? "z-ai/glm-4.7" : DEFAULT_MODEL;
    const model = this.config.model ?? defaultModel;
    const maxTokens = this.config.maxTokens ?? 8192;
    this.llmProvider = createLLMProvider({
      provider: this.config.provider || "anthropic",
      apiKey: this.getApiKey(),
      model,
      maxTokens,
      systemPrompt,
      tools: allTools,
      contextEditing: this.config.contextEditing
    });
    return this.llmProvider;
  }
  /**
   * Run the agent using the provider abstraction (for OpenRouter and future providers)
   */
  async runWithProvider(userMessage) {
    const maxIterations = this.config.maxIterations ?? 200;
    const useStreaming = this.config.streaming ?? true;
    const provider = await this.getOrCreateProvider();
    const contextMessage = `[Working directory: ${this.workingDirectory}]

${userMessage}`;
    this.conversationHistory.push({
      role: "user",
      content: contextMessage
    });
    this.clearToolCallLoopTracking();
    const toolCalls = [];
    let iterations = 0;
    let finalText = "";
    const maxTurns = this.config.maxTurns ?? maxIterations;
    while (iterations < maxTurns) {
      if (this.config.abortSignal?.aborted) {
        finalText += "\n\n[Operation cancelled by user]";
        break;
      }
      iterations++;
      this.config.onStreamStart?.();
      let response;
      if (useStreaming) {
        response = await provider.streamChat(this.conversationHistory, {
          onText: (text) => {
            finalText += text;
            this.config.onText?.(text, false);
          },
          onThinking: (text) => {
            this.config.onThinking?.(text);
          },
          onToolCall: (id, name, input) => {
            this.config.onToolCall?.(name, input);
          }
        });
        if (response.text) {
          this.config.onText?.("", true);
        }
      } else {
        response = await provider.chat(this.conversationHistory);
        if (response.text) {
          finalText += response.text;
          this.config.onText?.(response.text, true);
        }
      }
      this.config.onStreamEnd?.();
      this.updateTokenUsage({
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        cache_creation_input_tokens: response.usage.cacheCreationTokens,
        cache_read_input_tokens: response.usage.cacheReadTokens
      }, response.cost);
      const responseContent = [];
      if (response.text) {
        responseContent.push({ type: "text", text: response.text });
      }
      for (const tc of response.toolCalls) {
        responseContent.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input
        });
      }
      if (response.toolCalls.length === 0) {
        this.conversationHistory.push({
          role: "assistant",
          content: responseContent
        });
        break;
      }
      const toolResults = [];
      for (const toolCall2 of response.toolCalls) {
        await new Promise((resolve2) => setImmediate(resolve2));
        const { result, source } = await this.executeTool(
          toolCall2.name,
          toolCall2.input
        );
        const success2 = !(result && typeof result === "object" && "error" in result);
        this.config.onToolResult?.(toolCall2.name, result, success2);
        toolCalls.push({
          name: toolCall2.name,
          input: toolCall2.input,
          result,
          source
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall2.id,
          content: JSON.stringify(result)
        });
      }
      this.conversationHistory.push({
        role: "assistant",
        content: responseContent
      });
      this.conversationHistory.push({
        role: "user",
        content: toolResults
      });
      this.truncateLastToolResults();
      if (response.stopReason === "end_turn" && response.toolCalls.length === 0) {
        break;
      }
    }
    return {
      text: finalText,
      toolCalls,
      iterations,
      tokenUsage: { ...this.cumulativeTokenUsage }
    };
  }
  /**
   * Get all available tools
   */
  async getAllTools() {
    const tools = [];
    if (this.config.enableLocalTools) {
      tools.push(...localTools);
    }
    if (this.config.enableMCPTools) {
      if (this.mcpClientManager) {
        const mcpTools = await this.mcpClientManager.listAllTools();
        tools.push(...convertToClaudeTools(mcpTools));
      } else if (this.mcpClient) {
        const mcpTools = await this.mcpClient.listTools();
        tools.push(...convertToClaudeTools(mcpTools));
      }
    }
    return tools;
  }
  /**
   * Execute a tool (local or MCP)
   */
  async executeTool(name, args) {
    if (this.config.abortSignal?.aborted) {
      return {
        result: { error: "Operation cancelled by user" },
        source: "local"
      };
    }
    if (this.checkToolCallLoop(name, args)) {
      return {
        result: { error: `Loop detected: "${name}" was called multiple times with the same input. Please try a different approach.` },
        source: "local"
      };
    }
    if (isLocalTool(name)) {
      const result = await executeLocalTool(name, args);
      return {
        result: result.success ? result.data : { error: result.error },
        source: "local"
      };
    }
    if (this.mcpClientManager) {
      const result = await this.mcpClientManager.callTool(name, args);
      const source = result.source || "mcp";
      return {
        result: result.success ? result.data : { error: result.error },
        source
      };
    }
    if (this.mcpClient) {
      const result = await this.mcpClient.callTool(name, args);
      return {
        result: result.success ? result.data : { error: result.error },
        source: "mcp"
      };
    }
    return {
      result: { error: `Unknown tool: ${name}` },
      source: "local"
    };
  }
  /**
   * Set the abort signal for the current request (call before run())
   */
  setAbortSignal(signal) {
    this.config.abortSignal = signal;
  }
  /**
   * Run the agent with a user message (supports streaming)
   */
  async run(userMessage, options) {
    if (options?.abortSignal) {
      this.config.abortSignal = options.abortSignal;
    }
    if (this.config.provider === "openrouter") {
      return this.runWithProvider(userMessage);
    }
    const maxIterations = this.config.maxIterations ?? 15;
    const model = this.config.model ?? (this.config.provider === "openrouter" ? "z-ai/glm-4.7" : "claude-sonnet-4-5-20250929");
    const maxTokens = this.config.maxTokens ?? 8192;
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const useStreaming = this.config.streaming ?? true;
    const allTools = await this.getAllTools();
    const contextManagement = this.config.contextEditing && this.config.contextEditing.length > 0 ? { edits: this.config.contextEditing } : void 0;
    const contextMessage = `[Working directory: ${this.workingDirectory}]

${userMessage}`;
    this.conversationHistory.push({
      role: "user",
      content: contextMessage
    });
    this.clearToolCallLoopTracking();
    const toolCalls = [];
    let iterations = 0;
    let finalText = "";
    const maxTurns = this.config.maxTurns ?? maxIterations;
    while (iterations < maxTurns) {
      if (this.config.abortSignal?.aborted) {
        finalText += "\n\n[Operation cancelled by user]";
        break;
      }
      iterations++;
      this.config.onStreamStart?.();
      let response;
      let responseContent = [];
      let currentText = "";
      let toolUses = [];
      if (useStreaming) {
        const systemWithCache = [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" }
          }
        ];
        const streamOptions = {
          model,
          max_tokens: maxTokens,
          system: systemWithCache,
          tools: allTools,
          messages: this.conversationHistory
        };
        if (contextManagement) {
          streamOptions.context_management = contextManagement;
        }
        const stream = this.anthropic.messages.stream(streamOptions);
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta.type === "text_delta" && delta.text) {
              currentText += delta.text;
              finalText += delta.text;
              this.config.onText?.(delta.text, false);
            } else if (delta.type === "thinking_delta" && delta.thinking) {
              this.config.onThinking?.(delta.thinking);
            } else if (delta.type === "input_json_delta" && delta.partial_json) {
            }
          } else if (event.type === "content_block_stop") {
          }
        }
        response = await stream.finalMessage();
        responseContent = response.content;
        this.updateTokenUsage(response.usage);
        toolUses = response.content.filter(
          (block) => block.type === "tool_use"
        );
        if (currentText) {
          this.config.onText?.("", true);
        }
      } else {
        const systemWithCache = [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" }
          }
        ];
        const createOptions = {
          model,
          max_tokens: maxTokens,
          system: systemWithCache,
          tools: allTools,
          messages: this.conversationHistory
        };
        if (contextManagement) {
          createOptions.context_management = contextManagement;
        }
        response = await this.anthropic.messages.create(createOptions);
        responseContent = response.content;
        this.updateTokenUsage(response.usage);
        toolUses = response.content.filter(
          (block) => block.type === "tool_use"
        );
        const textBlocks = response.content.filter(
          (block) => block.type === "text"
        );
        for (const block of textBlocks) {
          finalText += block.text;
          this.config.onText?.(block.text, true);
        }
      }
      this.config.onStreamEnd?.();
      if (toolUses.length === 0) {
        this.conversationHistory.push({
          role: "assistant",
          content: responseContent
        });
        break;
      }
      const toolResults = [];
      for (const toolUse of toolUses) {
        this.config.onToolCall?.(toolUse.name, toolUse.input);
        const { result, source } = await this.executeTool(
          toolUse.name,
          toolUse.input
        );
        const success2 = !(result && typeof result === "object" && "error" in result);
        this.config.onToolResult?.(toolUse.name, result, success2);
        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input,
          result,
          source
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        });
      }
      this.conversationHistory.push({
        role: "assistant",
        content: responseContent
      });
      this.conversationHistory.push({
        role: "user",
        content: toolResults
      });
      this.truncateLastToolResults();
      if (response.stop_reason === "end_turn" && toolUses.length === 0) {
        break;
      }
    }
    return {
      text: finalText,
      toolCalls,
      iterations,
      tokenUsage: { ...this.cumulativeTokenUsage }
    };
  }
  /**
   * Clear conversation history (start fresh)
   */
  clearHistory() {
    this.conversationHistory = [];
  }
  /**
   * Get current conversation history
   */
  getHistory() {
    return [...this.conversationHistory];
  }
  /**
   * Set working directory
   */
  setWorkingDirectory(dir) {
    this.workingDirectory = dir;
  }
  /**
   * Get working directory
   */
  getWorkingDirectory() {
    return this.workingDirectory;
  }
  /**
   * Truncate tool results in the last message of conversation history.
   * 
   * This is called AFTER Claude has seen the full tool results and responded.
   * We then replace the full results with truncated versions to save context
   * on future turns. This way:
   * - Current turn: Claude sees full data, can display everything to user
   * - Future turns: Only actionable data (IDs, prices) is in context
   */
  truncateLastToolResults() {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const message = this.conversationHistory[i];
      if (message.role === "user" && Array.isArray(message.content)) {
        const toolResults = message.content.filter(
          (block) => block.type === "tool_result"
        );
        if (toolResults.length > 0) {
          const truncatedContent = message.content.map((block) => {
            if (block.type === "tool_result" && typeof block.content === "string") {
              try {
                const fullResult = JSON.parse(block.content);
                const truncatedResult = truncateToolResult(fullResult, "unknown");
                return {
                  ...block,
                  content: JSON.stringify(truncatedResult)
                };
              } catch {
                if (block.content.length > MAX_TOOL_RESULT_CHARS) {
                  return {
                    ...block,
                    content: block.content.substring(0, MAX_TOOL_RESULT_CHARS) + "... [truncated for context]"
                  };
                }
              }
            }
            return block;
          });
          this.conversationHistory[i] = {
            ...message,
            content: truncatedContent
          };
          break;
        }
      }
    }
  }
  /**
   * Update cumulative token usage from API response
   * @param usage - Token counts from the API response
   * @param preCalculatedCost - Optional pre-calculated cost (from OpenRouter provider)
   */
  /**
   * Check if a tool call would create a loop (same call repeated too many times).
   * Returns true if this call is part of a loop and should be stopped.
   */
  checkToolCallLoop(toolName, input) {
    const inputStr = JSON.stringify(input);
    const callSignature = `${toolName}:${inputStr}`;
    this.recentToolCalls.push({ name: toolName, input: inputStr });
    if (this.recentToolCalls.length > _Agent.MAX_RECENT_TOOL_CALLS) {
      this.recentToolCalls.shift();
    }
    const duplicateCount = this.recentToolCalls.filter(
      (call) => call.name === toolName && call.input === inputStr
    ).length;
    if (duplicateCount >= _Agent.LOOP_THRESHOLD) {
      console.warn(`[Loop Detection] Tool "${toolName}" called ${duplicateCount} times with identical input. Stopping loop.`);
      return true;
    }
    return false;
  }
  /**
   * Clear the tool call loop tracking (call when starting a new user message)
   */
  clearToolCallLoopTracking() {
    this.recentToolCalls = [];
  }
  updateTokenUsage(usage, preCalculatedCost) {
    const model = this.config.model ?? DEFAULT_MODEL;
    this.cumulativeTokenUsage.inputTokens = usage.input_tokens;
    this.cumulativeTokenUsage.outputTokens += usage.output_tokens;
    this.cumulativeTokenUsage.cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
    this.cumulativeTokenUsage.cacheReadInputTokens = usage.cache_read_input_tokens || 0;
    this.cumulativeTokenUsage.totalTokens = this.cumulativeTokenUsage.inputTokens + this.cumulativeTokenUsage.outputTokens;
    const callCost = preCalculatedCost ?? calculateCost(
      model,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_creation_input_tokens || 0,
      usage.cache_read_input_tokens || 0
    );
    this.sessionCost += callCost.totalCost;
    this.cumulativeTokenUsage.cost = callCost;
    this.cumulativeTokenUsage.sessionCost = this.sessionCost;
    this.config.onTokenUsage?.(this.cumulativeTokenUsage);
  }
  /**
   * Get current token usage estimate
   */
  getTokenUsage() {
    return { ...this.cumulativeTokenUsage };
  }
  /**
   * Count tokens in current conversation (uses Anthropic's token counting API)
   */
  async countTokens() {
    const model = this.config.model ?? (this.config.provider === "openrouter" ? "z-ai/glm-4.7" : "claude-sonnet-4-5-20250929");
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const allTools = await this.getAllTools();
    try {
      const response = await this.anthropic.messages.countTokens({
        model,
        system: systemPrompt,
        tools: allTools,
        messages: this.conversationHistory
      });
      return response.input_tokens;
    } catch (error2) {
      return this.cumulativeTokenUsage.inputTokens;
    }
  }
  /**
   * Reset token usage (e.g., after compaction)
   */
  resetTokenUsage() {
    this.sessionCost = 0;
    this.cumulativeTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalTokens: 0,
      cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
      sessionCost: 0
    };
  }
  /**
   * Get the current model being used
   */
  getModel() {
    return this.config.model ?? DEFAULT_MODEL;
  }
  /**
   * Set the model to use for future requests
   */
  setModel(modelIdOrAlias) {
    let resolvedId = resolveModelId(modelIdOrAlias);
    let displayName;
    if (resolvedId) {
      const modelConfig = getModelConfig(resolvedId);
      displayName = modelConfig?.displayName;
    } else {
      resolvedId = resolveOpenRouterModelId(modelIdOrAlias);
      if (resolvedId) {
        const orConfig = getOpenRouterModelConfig(resolvedId);
        displayName = orConfig?.displayName ?? resolvedId;
        if (!this.isOpenRouter() && resolvedId.includes("/")) {
          this.config.provider = "openrouter";
        }
      }
    }
    if (!resolvedId) {
      const anthropicModels = Object.values(MODELS).map((m) => m.name).join(", ");
      const orModels = Object.values(OPENROUTER_MODELS2).slice(0, 5).map((m) => m.name).join(", ");
      return {
        success: false,
        error: `Unknown model: "${modelIdOrAlias}". Anthropic: ${anthropicModels}. OpenRouter: ${orModels}, ...`
      };
    }
    this.config.model = resolvedId;
    this.llmProvider = void 0;
    return {
      success: true,
      model: displayName ?? resolvedId
    };
  }
  /**
   * Get session cost so far
   */
  getSessionCost() {
    return this.sessionCost;
  }
  /**
   * Compact the conversation history to reduce token usage.
   * 
   * This uses the current LLM to create a structured summary of the conversation,
   * then replaces the history with just the summary. This dramatically
   * reduces token count while preserving important context.
   * 
   * @returns Object with original/new token counts and the summary
   */
  async compactHistory() {
    if (this.conversationHistory.length < 2) {
      return {
        success: false,
        originalTokenCount: 0,
        newTokenCount: 0,
        error: "Conversation too short to compact"
      };
    }
    try {
      const originalContentLength = JSON.stringify(this.conversationHistory).length;
      const originalTokens = Math.ceil(originalContentLength / 4);
      const compactionPrompt = `Your context window is filling up. Create a concise summary of our conversation so far.

Include:
- User's main goals and what was accomplished
- Files created/modified (with paths)
- Key decisions and discoveries  
- Next steps still needed
- Any important context to preserve

Be thorough but concise. The goal is to capture everything needed to continue seamlessly.`;
      const compactionMessages = [
        ...this.conversationHistory,
        { role: "user", content: compactionPrompt }
      ];
      let summary;
      if (this.config.provider === "openrouter" && this.llmProvider) {
        const response = await this.llmProvider.chat(compactionMessages);
        summary = response.text;
      } else {
        const model = this.config.model ?? DEFAULT_MODEL;
        const response = await this.anthropic.messages.create({
          model,
          max_tokens: 4096,
          messages: compactionMessages
        });
        const textBlocks = response.content.filter((block) => block.type === "text");
        summary = textBlocks.map((block) => block.text).join("\n");
      }
      if (!summary || summary.trim().length === 0) {
        throw new Error("Failed to generate summary");
      }
      const newHistory = [
        { role: "assistant", content: summary.trim() }
      ];
      const newContentLength = JSON.stringify(newHistory).length;
      const newTokens = Math.ceil(newContentLength / 4);
      this.conversationHistory = newHistory;
      this.resetTokenUsage();
      this.cumulativeTokenUsage.inputTokens = newTokens;
      this.cumulativeTokenUsage.totalTokens = newTokens;
      this.config.onTokenUsage?.(this.cumulativeTokenUsage);
      return {
        success: true,
        summary: summary.trim(),
        originalTokenCount: originalTokens,
        newTokenCount: newTokens
      };
    } catch (error2) {
      return {
        success: false,
        originalTokenCount: this.cumulativeTokenUsage.inputTokens,
        newTokenCount: this.cumulativeTokenUsage.inputTokens,
        error: error2 instanceof Error ? error2.message : String(error2)
      };
    }
  }
  /**
   * Set conversation history (useful for restoring state)
   */
  setHistory(history) {
    this.conversationHistory = history;
  }
  /**
   * Get conversation history (alias for getHistory)
   */
  getConversationHistory() {
    return this.getHistory();
  }
  /**
   * Set conversation history (alias for setHistory)
   */
  setConversationHistory(history) {
    this.setHistory(history);
  }
};
function createAgent(config) {
  return new Agent(config);
}

// src/ui/output.ts
import chalk2 from "chalk";
import ora from "ora";
var BANNER = `
${chalk2.yellow("  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 ")}${chalk2.hex("#FFD700")("\u2588\u2588\u2557   \u2588\u2588\u2557")}${chalk2.hex("#FFC000")(" \u2588\u2588\u2588\u2588\u2588\u2557 ")}${chalk2.hex("#FFB000")("\u2588\u2588\u2588\u2557   \u2588\u2588\u2557")}${chalk2.hex("#FFA000")("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557")}${chalk2.hex("#FF9000")("\u2588\u2588\u2557")}${chalk2.hex("#FF8000")("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557")}${chalk2.hex("#FF7000")("\u2588\u2588\u2557  \u2588\u2588\u2557")}
${chalk2.yellow("  \u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557")}${chalk2.hex("#FFD700")("\u2588\u2588\u2551   \u2588\u2588\u2551")}${chalk2.hex("#FFC000")("\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557")}${chalk2.hex("#FFB000")("\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551")}${chalk2.hex("#FFA000")("\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D")}${chalk2.hex("#FF9000")("\u2588\u2588\u2551")}${chalk2.hex("#FF8000")("\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D")}${chalk2.hex("#FF7000")("\u2588\u2588\u2551  \u2588\u2588\u2551")}
${chalk2.yellow("  \u2588\u2588\u2551   \u2588\u2588\u2551")}${chalk2.hex("#FFD700")("\u2588\u2588\u2551   \u2588\u2588\u2551")}${chalk2.hex("#FFC000")("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551")}${chalk2.hex("#FFB000")("\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551")}${chalk2.hex("#FFA000")("   \u2588\u2588\u2551   ")}${chalk2.hex("#FF9000")("\u2588\u2588\u2551")}${chalk2.hex("#FF8000")("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557")}${chalk2.hex("#FF7000")("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551")}
${chalk2.yellow("  \u2588\u2588\u2551\u2584\u2584 \u2588\u2588\u2551")}${chalk2.hex("#FFD700")("\u2588\u2588\u2551   \u2588\u2588\u2551")}${chalk2.hex("#FFC000")("\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551")}${chalk2.hex("#FFB000")("\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551")}${chalk2.hex("#FFA000")("   \u2588\u2588\u2551   ")}${chalk2.hex("#FF9000")("\u2588\u2588\u2551")}${chalk2.hex("#FF8000")("\u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551")}${chalk2.hex("#FF7000")("\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551")}
${chalk2.yellow("  \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D")}${chalk2.hex("#FFD700")("\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D")}${chalk2.hex("#FFC000")("\u2588\u2588\u2551  \u2588\u2588\u2551")}${chalk2.hex("#FFB000")("\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551")}${chalk2.hex("#FFA000")("   \u2588\u2588\u2551   ")}${chalk2.hex("#FF9000")("\u2588\u2588\u2551")}${chalk2.hex("#FF8000")("\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551")}${chalk2.hex("#FF7000")("\u2588\u2588\u2551  \u2588\u2588\u2551")}
${chalk2.yellow("   \u255A\u2550\u2550\u2580\u2580\u2550\u255D ")}${chalk2.hex("#FFD700")(" \u255A\u2550\u2550\u2550\u2550\u2550\u255D ")}${chalk2.hex("#FFC000")("\u255A\u2550\u255D  \u255A\u2550\u255D")}${chalk2.hex("#FFB000")("\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D")}${chalk2.hex("#FFA000")("   \u255A\u2550\u255D   ")}${chalk2.hex("#FF9000")("\u255A\u2550\u255D")}${chalk2.hex("#FF8000")("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D")}${chalk2.hex("#FF7000")("\u255A\u2550\u255D  \u255A\u2550\u255D")}
`;
var TAGLINE = chalk2.dim("  AI-powered trading agent for Polymarket & Kalshi");
function printHeader() {
  console.log(BANNER);
  console.log(TAGLINE);
  console.log();
}
function printDivider() {
  console.log(chalk2.dim("\u2500".repeat(40)));
}
function success(message) {
  console.log(chalk2.green("\u2713") + " " + message);
}
function warn(message) {
  console.log(chalk2.yellow("\u26A0") + " " + message);
}
function error(message) {
  console.log(chalk2.red("\u2717") + " " + message);
}
function toolCall(name, args) {
  console.log(chalk2.yellow("\u26A1") + " " + chalk2.dim("Calling ") + chalk2.yellow.bold(name));
  if (args && Object.keys(args).length > 0) {
    console.log(chalk2.dim("   " + JSON.stringify(args)));
  }
}
function assistant(message) {
  console.log();
  console.log(chalk2.yellow("Quantish:"));
  console.log(message);
  console.log();
}
function spinner(text) {
  return ora({
    text,
    color: "yellow"
  });
}
function tableRow(label, value, width = 20) {
  const paddedLabel = label.padEnd(width);
  console.log(chalk2.dim(paddedLabel) + value);
}

// src/ui/App.tsx
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";

// src/config/sessions.ts
import { homedir as homedir2 } from "os";
import { join as join3 } from "path";
import { existsSync as existsSync2, mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from "fs";
var SESSIONS_DIR = join3(homedir2(), ".quantish", "sessions");
var INDEX_FILE = join3(SESSIONS_DIR, "index.json");
function ensureSessionsDir() {
  if (!existsSync2(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}
function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}
function loadIndex() {
  ensureSessionsDir();
  if (!existsSync2(INDEX_FILE)) {
    return { lastSessionId: null, sessions: [] };
  }
  try {
    const data = readFileSync(INDEX_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { lastSessionId: null, sessions: [] };
  }
}
function saveIndex(index) {
  ensureSessionsDir();
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}
function getSessionPath(id) {
  return join3(SESSIONS_DIR, `${id}.json`);
}
var SessionManager = class {
  /**
   * Save a new session or update an existing one
   */
  saveSession(messages, model, provider, name, existingId) {
    ensureSessionsDir();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = existingId || generateSessionId();
    const sessionName = name || `Session ${(/* @__PURE__ */ new Date()).toLocaleDateString()} ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`;
    const session = {
      id,
      name: sessionName,
      createdAt: existingId ? this.getSession(existingId)?.createdAt || now : now,
      updatedAt: now,
      messages,
      model,
      provider,
      tokenCount: this.estimateTokenCount(messages)
    };
    const sessionPath = getSessionPath(id);
    writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf-8");
    const index = loadIndex();
    index.lastSessionId = id;
    const existingIndex = index.sessions.findIndex((s) => s.id === id);
    const sessionMeta = {
      id,
      name: sessionName,
      createdAt: session.createdAt,
      updatedAt: now,
      messageCount: messages.length
    };
    if (existingIndex >= 0) {
      index.sessions[existingIndex] = sessionMeta;
    } else {
      index.sessions.unshift(sessionMeta);
    }
    if (index.sessions.length > 50) {
      const toRemove = index.sessions.splice(50);
      for (const s of toRemove) {
        try {
          unlinkSync(getSessionPath(s.id));
        } catch {
        }
      }
    }
    saveIndex(index);
    return session;
  }
  /**
   * Get a session by ID
   */
  getSession(id) {
    const sessionPath = getSessionPath(id);
    if (!existsSync2(sessionPath)) {
      return null;
    }
    try {
      const data = readFileSync(sessionPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  /**
   * Get the last session
   */
  getLastSession() {
    const index = loadIndex();
    if (!index.lastSessionId) {
      return null;
    }
    return this.getSession(index.lastSessionId);
  }
  /**
   * Get a session by name
   */
  getSessionByName(name) {
    const index = loadIndex();
    const session = index.sessions.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (!session) {
      return null;
    }
    return this.getSession(session.id);
  }
  /**
   * List all sessions
   */
  listSessions() {
    const index = loadIndex();
    return index.sessions;
  }
  /**
   * Delete a session
   */
  deleteSession(id) {
    const sessionPath = getSessionPath(id);
    if (!existsSync2(sessionPath)) {
      return false;
    }
    try {
      unlinkSync(sessionPath);
      const index = loadIndex();
      index.sessions = index.sessions.filter((s) => s.id !== id);
      if (index.lastSessionId === id) {
        index.lastSessionId = index.sessions[0]?.id || null;
      }
      saveIndex(index);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Clear all sessions
   */
  clearAllSessions() {
    ensureSessionsDir();
    try {
      const files = readdirSync(SESSIONS_DIR);
      for (const file of files) {
        try {
          unlinkSync(join3(SESSIONS_DIR, file));
        } catch {
        }
      }
    } catch {
    }
  }
  /**
   * Estimate token count from messages (rough estimate)
   */
  estimateTokenCount(messages) {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if ("text" in block && typeof block.text === "string") {
            totalChars += block.text.length;
          }
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }
};
var sessionManager = null;
function getSessionManager() {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}

// src/ui/App.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function formatTokenCount(count) {
  if (count < 1e3) return String(count);
  if (count < 1e5) return `${(count / 1e3).toFixed(1)}k`;
  return `${Math.round(count / 1e3)}k`;
}
function getTokenColor(count) {
  if (count < 5e4) return "green";
  if (count < 1e5) return "yellow";
  return "red";
}
var SLASH_COMMANDS = [
  { cmd: "/help", desc: "Show available commands" },
  { cmd: "/clear", desc: "Clear conversation history" },
  { cmd: "/compact", desc: "Summarize conversation to save tokens" },
  { cmd: "/model", desc: "Switch model (opus, sonnet, haiku, minimax, etc.)" },
  { cmd: "/provider", desc: "Switch LLM provider (anthropic, openrouter)" },
  { cmd: "/cost", desc: "Show session cost breakdown" },
  { cmd: "/tools", desc: "List available tools" },
  { cmd: "/config", desc: "Show configuration info" },
  { cmd: "/processes", desc: "List running background processes" },
  { cmd: "/stop", desc: "Stop a background process by ID" },
  { cmd: "/stopall", desc: "Stop all background processes" },
  { cmd: "/exit", desc: "Exit the CLI" }
];
function formatArgs(args) {
  const entries = Object.entries(args);
  if (entries.length === 0) return "()";
  const formatted = entries.map(([key, value]) => {
    if (typeof value === "string") {
      const str = value.length > 50 ? value.slice(0, 50) + "..." : value;
      return `${key}: "${str}"`;
    }
    if (typeof value === "object") {
      return `${key}: {...}`;
    }
    return `${key}: ${String(value)}`;
  });
  return `(${formatted.join(", ")})`;
}
function formatResult(result, maxLength = 200) {
  if (result === null || result === void 0) return "null";
  if (typeof result === "string") {
    return result.length > maxLength ? result.slice(0, maxLength) + "..." : result;
  }
  if (typeof result === "object") {
    const str = JSON.stringify(result, null, 2);
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  }
  return String(result);
}
function cleanModelOutput(text) {
  if (!text) return text;
  return text.replace(/<tool_call>/g, "").replace(/<\/tool_call>/g, "").replace(/<arg_key>/g, "").replace(/<\/arg_key>/g, "").replace(/<function_call>/g, "").replace(/<\/function_call>/g, "").trim();
}
function App({ agent, onExit }) {
  const { exit } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [error2, setError] = useState(null);
  const [thinkingText, setThinkingText] = useState(null);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
    sessionCost: 0
  });
  const completedToolCalls = useRef([]);
  const abortController = useRef(null);
  const [queuedInput, setQueuedInput] = useState("");
  const [hasQueuedMessage, setHasQueuedMessage] = useState(false);
  const sessionManager2 = useMemo(() => getSessionManager(), []);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const handleSlashCommand = useCallback((command) => {
    const cmd = command.slice(1).toLowerCase().split(" ")[0];
    const args = command.slice(cmd.length + 2).trim();
    switch (cmd) {
      case "help":
        setMessages((prev) => [...prev, {
          role: "system",
          content: `\u{1F4DA} Available Commands:
/clear      - Clear conversation history
/compact    - Summarize conversation (keeps context, saves tokens)
/model      - Switch model (opus, sonnet, haiku, minimax, etc.)
/provider   - Switch LLM provider (anthropic, openrouter)
/cost       - Show session cost breakdown
/help       - Show this help message
/tools      - List available tools
/config     - Show configuration info

\u{1F5C2}\uFE0F Session Commands:
/save [name] - Save current session
/resume      - Resume last session
/sessions    - List saved sessions
/load <id>   - Load a saved session
/forget      - Delete all saved sessions

\u{1F4CB} Process Commands:
/processes  - List running background processes
/stop <id>  - Stop a background process by ID
/stopall    - Stop all background processes

/exit       - Exit the CLI

\u2328\uFE0F Keyboard Shortcuts:
Esc         - Interrupt current generation (or send queued message)
Enter       - Queue message while agent is working
Ctrl+C      - Exit (stops all processes)

\u{1F4A1} Tip: You can type while the agent is working. Press Enter to queue
        your message. Press Esc to interrupt and send immediately.`
        }]);
        return true;
      case "clear":
        agent.clearHistory();
        agent.resetTokenUsage();
        setMessages([]);
        setCurrentToolCalls([]);
        setStreamingText("");
        setError(null);
        setTokenUsage({
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          totalTokens: 0,
          cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
          sessionCost: 0
        });
        setMessages([{ role: "system", content: "\u2728 Conversation cleared." }]);
        return true;
      case "compact":
        setMessages((prev) => [...prev, {
          role: "system",
          content: "\u{1F5DC}\uFE0F Compacting conversation..."
        }]);
        setIsProcessing(true);
        agent.compactHistory().then((result2) => {
          if (result2.success) {
            const savedTokens = result2.originalTokenCount - result2.newTokenCount;
            const savedPercent = result2.originalTokenCount > 0 ? Math.round(savedTokens / result2.originalTokenCount * 100) : 0;
            setMessages((prev) => [...prev, {
              role: "system",
              content: `\u2705 Compaction complete!
   Before: ${formatTokenCount(result2.originalTokenCount)} tokens
   After: ${formatTokenCount(result2.newTokenCount)} tokens
   Saved: ${formatTokenCount(savedTokens)} tokens (${savedPercent}%)`
            }]);
          } else {
            setMessages((prev) => [...prev, {
              role: "system",
              content: `\u274C Compaction failed: ${result2.error || "Unknown error"}`
            }]);
          }
          setIsProcessing(false);
        }).catch((err) => {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Compaction error: ${err.message || String(err)}`
          }]);
          setIsProcessing(false);
        });
        return true;
      case "tools":
        setMessages((prev) => [...prev, {
          role: "system",
          content: '\u{1F527} Run "quantish tools" in your terminal to see all available tools.'
        }]);
        return true;
      case "config":
        setMessages((prev) => [...prev, {
          role: "system",
          content: '\u2699\uFE0F Run "quantish config" to view/export your configuration.\n   "quantish config --export" exports as .env format for your bots.'
        }]);
        return true;
      case "processes":
      case "ps":
        const processes = processManager.listRunning();
        if (processes.length === 0) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: "\u{1F4CB} No background processes running."
          }]);
        } else {
          const processLines = processes.map((p) => {
            const uptime = Math.round((Date.now() - p.startedAt.getTime()) / 1e3);
            return `  [${p.id}] ${p.name} (PID: ${p.pid}) - ${uptime}s`;
          }).join("\n");
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u{1F4CB} Running processes:
${processLines}

Use /stop <id> to stop a process.`
          }]);
        }
        return true;
      case "stop":
        if (!args) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: "\u2753 Usage: /stop <process_id>\n   Use /processes to see running processes."
          }]);
          return true;
        }
        const processId = parseInt(args, 10);
        if (isNaN(processId)) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Invalid process ID: ${args}. Must be a number.`
          }]);
          return true;
        }
        const processToStop = processManager.get(processId);
        if (!processToStop) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Process ${processId} not found.`
          }]);
          return true;
        }
        if (processManager.kill(processId)) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u2705 Stopped process "${processToStop.name}" (ID: ${processId})`
          }]);
        } else {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Failed to stop process ${processId}`
          }]);
        }
        return true;
      case "stopall":
        const runningCount = processManager.runningCount();
        if (runningCount === 0) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: "\u{1F4CB} No background processes to stop."
          }]);
        } else {
          processManager.killAll();
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u2705 Stopped ${runningCount} background process${runningCount > 1 ? "es" : ""}.`
          }]);
        }
        return true;
      case "model":
        if (!args) {
          const currentModel = agent.getModel();
          const currentProvider = agent.getProvider();
          const modelConfig = getModelConfig(currentModel);
          const orModelConfig = getOpenRouterModelConfig(currentModel);
          const displayName = modelConfig?.displayName || orModelConfig?.displayName || currentModel;
          const anthropicModels = listModels();
          const anthropicList = anthropicModels.map((m) => {
            const isCurrent = m.id === currentModel ? " (current)" : "";
            return `  ${m.name}${isCurrent} - ${m.description}`;
          }).join("\n");
          const orModels = listOpenRouterModels().slice(0, 8);
          const orList = orModels.map((m) => {
            const isCurrent = m.id === currentModel ? " (current)" : "";
            return `  ${m.name}${isCurrent} - ${m.description.slice(0, 50)}...`;
          }).join("\n");
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u{1F916} Current: ${displayName} (${currentProvider})

Anthropic Models:
${anthropicList}

OpenRouter Models (selection):
${orList}
  ... and many more! Use any OpenRouter model ID like 'minimax/minimax-m2.1'

Usage: /model <name>  (e.g., /model haiku, /model minimax)
       Using an OpenRouter model auto-switches to OpenRouter provider.`
          }]);
          return true;
        }
        const result = agent.setModel(args);
        if (result.success) {
          const anthropicConfig = getModelConfig(agent.getModel());
          const orConfig = getOpenRouterModelConfig(agent.getModel());
          const description = anthropicConfig?.description || orConfig?.description || "";
          const providerInfo = agent.isOpenRouter() ? " (OpenRouter)" : " (Anthropic)";
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u2705 Switched to ${result.model}${providerInfo}
   ${description}`
          }]);
        } else {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C ${result.error}`
          }]);
        }
        return true;
      case "provider":
        if (!args) {
          const currentProvider = agent.getProvider();
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u{1F527} LLM Provider

Current: ${currentProvider}

Available providers:
  anthropic   - Claude models (Opus, Sonnet, Haiku)
  openrouter  - Multi-provider access (MiniMax, DeepSeek, Gemini, etc.)

Usage: /provider <name>  (e.g., /provider openrouter)

Note: When switching to OpenRouter, make sure OPENROUTER_API_KEY is set.
      You can also just use /model with an OpenRouter model name.`
          }]);
          return true;
        }
        const providerArg = args.toLowerCase();
        if (providerArg !== "anthropic" && providerArg !== "openrouter") {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Unknown provider: "${args}". Use: anthropic, openrouter`
          }]);
          return true;
        }
        agent.setProvider(providerArg);
        const providerModels = providerArg === "openrouter" ? "minimax, deepseek, gemini, grok, devstral" : "opus, sonnet, haiku";
        setMessages((prev) => [...prev, {
          role: "system",
          content: `\u2705 Switched to ${providerArg} provider
   Available models: ${providerModels}
   Use /model to select a model.`
        }]);
        return true;
      case "cost":
        const usage = agent.getTokenUsage();
        const sessionCost = agent.getSessionCost();
        const costBreakdown = usage.cost;
        setMessages((prev) => [...prev, {
          role: "system",
          content: `\u{1F4B0} Session Cost: ${formatCost(sessionCost)}

Token Usage (current context):
  Input:        ${formatTokenCount(usage.inputTokens)} tokens
  Output:       ${formatTokenCount(usage.outputTokens)} tokens
  Cache Write:  ${formatTokenCount(usage.cacheCreationInputTokens)} tokens
  Cache Read:   ${formatTokenCount(usage.cacheReadInputTokens)} tokens
  Total:        ${formatTokenCount(usage.totalTokens)} tokens

Last API Call Cost:
  Input:        ${formatCost(costBreakdown.inputCost)}
  Output:       ${formatCost(costBreakdown.outputCost)}
  Cache Write:  ${formatCost(costBreakdown.cacheWriteCost)}
  Cache Read:   ${formatCost(costBreakdown.cacheReadCost)}
  
\u{1F4A1} Tip: Use /model haiku for cheaper operations, /compact to reduce context.`
        }]);
        return true;
      case "save":
        try {
          const conversationHistory = agent.getConversationHistory();
          if (conversationHistory.length === 0) {
            setMessages((prev) => [...prev, {
              role: "system",
              content: "\u274C Nothing to save - conversation is empty."
            }]);
            return true;
          }
          const savedSession = sessionManager2.saveSession(
            conversationHistory,
            agent.getModel(),
            agent.getProvider(),
            args || void 0,
            currentSessionId || void 0
          );
          setCurrentSessionId(savedSession.id);
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u2705 Session saved: "${savedSession.name}"
   ID: ${savedSession.id}
   Messages: ${conversationHistory.length}`
          }]);
        } catch (err) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Failed to save session: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      case "resume":
        try {
          const lastSession = sessionManager2.getLastSession();
          if (!lastSession) {
            setMessages((prev) => [...prev, {
              role: "system",
              content: "\u274C No previous session to resume."
            }]);
            return true;
          }
          agent.setConversationHistory(lastSession.messages);
          agent.setModel(lastSession.model);
          if (lastSession.provider) {
            agent.setProvider(lastSession.provider);
          }
          setCurrentSessionId(lastSession.id);
          setMessages([{
            role: "system",
            content: `\u2705 Resumed session: "${lastSession.name}"
   ${lastSession.messages.length} messages loaded
   Model: ${lastSession.model} (${lastSession.provider})`
          }]);
        } catch (err) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Failed to resume session: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      case "sessions":
        try {
          const sessions = sessionManager2.listSessions();
          if (sessions.length === 0) {
            setMessages((prev) => [...prev, {
              role: "system",
              content: "\u{1F4CB} No saved sessions."
            }]);
            return true;
          }
          const sessionList = sessions.slice(0, 10).map((s, i) => {
            const isCurrent = s.id === currentSessionId ? " (current)" : "";
            const date = new Date(s.updatedAt).toLocaleDateString();
            return `  ${i + 1}. ${s.name}${isCurrent}
     ID: ${s.id} | ${s.messageCount} msgs | ${date}`;
          }).join("\n\n");
          const moreText = sessions.length > 10 ? `

... and ${sessions.length - 10} more` : "";
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u{1F5C2}\uFE0F Saved Sessions:

${sessionList}${moreText}

Use /load <id> to load a session.`
          }]);
        } catch (err) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      case "load":
        if (!args) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: "\u2753 Usage: /load <session_id>\n   Use /sessions to see saved sessions."
          }]);
          return true;
        }
        try {
          let loadSession = sessionManager2.getSession(args);
          if (!loadSession) {
            loadSession = sessionManager2.getSessionByName(args);
          }
          if (!loadSession) {
            setMessages((prev) => [...prev, {
              role: "system",
              content: `\u274C Session not found: "${args}"`
            }]);
            return true;
          }
          agent.setConversationHistory(loadSession.messages);
          agent.setModel(loadSession.model);
          if (loadSession.provider) {
            agent.setProvider(loadSession.provider);
          }
          setCurrentSessionId(loadSession.id);
          setMessages([{
            role: "system",
            content: `\u2705 Loaded session: "${loadSession.name}"
   ${loadSession.messages.length} messages loaded
   Model: ${loadSession.model} (${loadSession.provider})`
          }]);
        } catch (err) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Failed to load session: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      case "forget":
        try {
          sessionManager2.clearAllSessions();
          setCurrentSessionId(null);
          setMessages((prev) => [...prev, {
            role: "system",
            content: "\u2705 All sessions deleted."
          }]);
        } catch (err) {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C Failed to clear sessions: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      case "exit":
      case "quit":
        try {
          const history = agent.getConversationHistory();
          if (history.length > 0) {
            sessionManager2.saveSession(
              history,
              agent.getModel(),
              agent.getProvider(),
              void 0,
              currentSessionId || void 0
            );
          }
        } catch {
        }
        if (processManager.hasRunning()) {
          processManager.killAll();
        }
        onExit?.();
        exit();
        return true;
      default:
        setMessages((prev) => [...prev, {
          role: "system",
          content: `Unknown command: /${cmd}. Type /help for available commands.`
        }]);
        return true;
    }
  }, [agent, onExit, exit]);
  const handleSubmit = useCallback(async (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (isProcessing) {
      setQueuedInput(trimmed);
      setHasQueuedMessage(true);
      setInput("");
      setMessages((prev) => [...prev, {
        role: "system",
        content: `\u{1F4E5} Queued: "${trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed}"
   Press Esc to interrupt and send now.`
      }]);
      return;
    }
    if (trimmed.startsWith("/")) {
      setInput("");
      handleSlashCommand(trimmed);
      return;
    }
    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      onExit?.();
      exit();
      return;
    }
    if (trimmed.toLowerCase() === "clear") {
      agent.clearHistory();
      setMessages([]);
      setInput("");
      setCurrentToolCalls([]);
      setStreamingText("");
      return;
    }
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsProcessing(true);
    setIsInterrupted(false);
    setError(null);
    setCurrentToolCalls([]);
    setStreamingText("");
    setThinkingText(null);
    completedToolCalls.current = [];
    abortController.current = new AbortController();
    try {
      const result = await agent.run(trimmed, { abortSignal: abortController.current.signal });
      if (isInterrupted) {
        setMessages((prev) => [...prev, {
          role: "system",
          content: "\u26A1 Generation interrupted by user."
        }]);
      } else {
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isStreaming);
          const cleanedText = cleanModelOutput(result.text || "");
          return [...filtered, {
            role: "assistant",
            content: cleanedText || "(completed)",
            toolCalls: result.toolCalls.map((tc) => ({
              name: tc.name,
              args: tc.input,
              result: tc.result,
              success: !(tc.result && typeof tc.result === "object" && "error" in tc.result),
              pending: false
            }))
          }];
        });
      }
      setStreamingText("");
      setCurrentToolCalls([]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error occurred";
      let displayError = errorMsg;
      const msgLower = errorMsg.toLowerCase();
      if (msgLower.includes("aborted") || msgLower.includes("aborterror")) {
        setMessages((prev) => [...prev, {
          role: "system",
          content: "\u26A1 Generation interrupted by user."
        }]);
      } else if (msgLower.includes("credits exhausted")) {
        displayError = "API credits exhausted. Please add credits to your provider.";
        setError(displayError);
      } else if (msgLower.includes("invalid_api_key") || msgLower.includes("401") || msgLower.includes("unauthorized")) {
        displayError = 'Invalid API key. Run "quantish init" to reconfigure.';
        setError(displayError);
      } else if (msgLower.includes("rate_limit") || msgLower.includes("429")) {
        displayError = "Rate limited. Please wait a moment and try again.";
        setError(displayError);
      } else if (msgLower.includes("cannot read properties of undefined") || msgLower.includes("undefined")) {
        displayError = "Tool call parsing error. The model may have sent malformed output.";
        setError(displayError);
      } else {
        setError(displayError);
      }
    } finally {
      setIsProcessing(false);
      setThinkingText(null);
      abortController.current = null;
    }
  }, [agent, isProcessing, isInterrupted, exit, onExit, handleSlashCommand]);
  const wasProcessing = useRef(false);
  useEffect(() => {
    const justFinished = wasProcessing.current && !isProcessing;
    wasProcessing.current = isProcessing;
    if (justFinished && hasQueuedMessage && queuedInput) {
      const nextMessage = queuedInput;
      setQueuedInput("");
      setHasQueuedMessage(false);
      setMessages((prev) => prev.filter(
        (m) => !(m.role === "system" && m.content.startsWith("\u{1F4E5} Queued:"))
      ));
      const timer = setTimeout(() => {
        handleSubmit(nextMessage);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isProcessing, hasQueuedMessage, queuedInput, handleSubmit]);
  useEffect(() => {
    const originalConfig = agent.config;
    agent.config = {
      ...originalConfig,
      streaming: true,
      onText: (text, isComplete) => {
        if (!isComplete) {
          const cleanText = text.replace(/<tool_call>/g, "").replace(/<\/tool_call>/g, "").replace(/<arg_key>/g, "").replace(/<\/arg_key>/g, "");
          if (cleanText) {
            setStreamingText((prev) => prev + cleanText);
          }
        }
      },
      onThinking: (text) => {
        setThinkingText((prev) => (prev || "") + text);
      },
      onToolCall: (name, args) => {
        setCurrentToolCalls((prev) => [...prev, {
          name,
          args,
          pending: true
        }]);
      },
      onToolResult: (name, result, success2) => {
        setCurrentToolCalls(
          (prev) => prev.map(
            (tc) => tc.name === name && tc.pending ? { ...tc, result, success: success2, pending: false } : tc
          )
        );
      },
      onStreamStart: () => {
        setStreamingText("");
      },
      onStreamEnd: () => {
      },
      onTokenUsage: (usage) => {
        setTokenUsage(usage);
      }
    };
    return () => {
      agent.config = originalConfig;
    };
  }, [agent]);
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      if (processManager.hasRunning()) {
        const count = processManager.runningCount();
        processManager.killAll();
        console.log(`
Stopped ${count} background process${count > 1 ? "es" : ""}.`);
      }
      onExit?.();
      exit();
    }
    if (key.backspace && input === "" && hasQueuedMessage && queuedInput) {
      setInput(queuedInput);
      setQueuedInput("");
      setHasQueuedMessage(false);
      setMessages((prev) => prev.filter(
        (m) => !(m.role === "system" && m.content.startsWith("\u{1F4E5} Queued:"))
      ));
    }
    if (key.escape && isProcessing) {
      setIsInterrupted(true);
      abortController.current?.abort();
      if (hasQueuedMessage && queuedInput) {
        const messageToSend = queuedInput;
        setQueuedInput("");
        setHasQueuedMessage(false);
        setIsProcessing(false);
        setMessages((prev) => {
          const filtered = prev.filter(
            (m) => !(m.role === "system" && m.content.startsWith("\u{1F4E5} Queued:"))
          );
          return [...filtered, {
            role: "system",
            content: "\u26A1 Interrupted. Sending queued message..."
          }];
        });
        setTimeout(() => {
          handleSubmit(messageToSend);
        }, 200);
      } else {
        setMessages((prev) => [...prev, {
          role: "system",
          content: "\u26A1 Interrupting..."
        }]);
      }
    }
  });
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginBottom: 1, children: messages.map((msg, i) => /* @__PURE__ */ jsxs(Box, { marginBottom: 1, flexDirection: "column", children: [
      msg.role === "user" && /* @__PURE__ */ jsxs(Box, { children: [
        /* @__PURE__ */ jsx(Text, { color: "green", bold: true, children: "You: " }),
        /* @__PURE__ */ jsx(Text, { children: msg.content })
      ] }),
      msg.role === "assistant" && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
        msg.toolCalls && msg.toolCalls.length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginBottom: 1, children: msg.toolCalls.map((tc, j) => /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [
          /* @__PURE__ */ jsxs(Box, { children: [
            /* @__PURE__ */ jsxs(Text, { color: tc.success ? "blue" : "red", children: [
              tc.success ? "\u2713" : "\u2717",
              " ",
              tc.name
            ] }),
            /* @__PURE__ */ jsx(Text, { color: "gray", children: formatArgs(tc.args) })
          ] }),
          tc.result && /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { color: "gray", dimColor: true, children: [
            "\u2192 ",
            formatResult(tc.result, 100)
          ] }) })
        ] }, j)) }),
        msg.content && msg.content !== "(completed)" && /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { color: "magenta", bold: true, children: "Quantish: " }),
          /* @__PURE__ */ jsx(Text, { wrap: "wrap", children: msg.content })
        ] })
      ] }),
      msg.role === "system" && /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(Text, { color: "gray", italic: true, children: msg.content }) })
    ] }, i)) }),
    currentToolCalls.length > 0 && /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2, children: currentToolCalls.map((tc, i) => /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Box, { children: [
        tc.pending ? /* @__PURE__ */ jsxs(Text, { color: "cyan", children: [
          /* @__PURE__ */ jsx(Spinner, { type: "dots" }),
          " ",
          tc.name
        ] }) : /* @__PURE__ */ jsxs(Text, { color: tc.success ? "blue" : "red", children: [
          tc.success ? "\u2713" : "\u2717",
          " ",
          tc.name
        ] }),
        /* @__PURE__ */ jsx(Text, { color: "gray", children: formatArgs(tc.args) })
      ] }),
      !tc.pending && tc.result && /* @__PURE__ */ jsx(Box, { marginLeft: 2, children: /* @__PURE__ */ jsxs(Text, { color: "gray", dimColor: true, children: [
        "\u2192 ",
        formatResult(tc.result, 100)
      ] }) })
    ] }, i)) }),
    streamingText && /* @__PURE__ */ jsxs(Box, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { color: "magenta", bold: true, children: "Quantish: " }),
      /* @__PURE__ */ jsx(Text, { wrap: "wrap", children: streamingText }),
      /* @__PURE__ */ jsx(Text, { color: "cyan", children: "\u258A" })
    ] }),
    thinkingText && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "gray", italic: true, children: [
      "\u{1F4AD} ",
      thinkingText.slice(0, 100),
      thinkingText.length > 100 ? "..." : ""
    ] }) }),
    error2 && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "red", children: [
      "\u274C Error: ",
      error2
    ] }) }),
    isProcessing && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "cyan", children: [
      /* @__PURE__ */ jsx(Spinner, { type: "dots" }),
      " ",
      currentToolCalls.length > 0 ? `Working... (${currentToolCalls.filter((tc) => tc.pending).length} tool${currentToolCalls.filter((tc) => tc.pending).length !== 1 ? "s" : ""} running)` : streamingText ? "Generating..." : "Thinking..."
    ] }) }),
    input.startsWith("/") && !isProcessing && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, paddingLeft: 2, children: [
      /* @__PURE__ */ jsx(Text, { color: "gray", dimColor: true, children: "Commands:" }),
      SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.toLowerCase()) || input === "/").slice(0, 5).map((c, i) => /* @__PURE__ */ jsxs(Box, { paddingLeft: 1, children: [
        /* @__PURE__ */ jsx(Text, { color: c.cmd === input.toLowerCase() ? "yellow" : "gray", children: c.cmd }),
        /* @__PURE__ */ jsxs(Text, { color: "gray", dimColor: true, children: [
          " - ",
          c.desc
        ] })
      ] }, i))
    ] }),
    hasQueuedMessage && isProcessing && /* @__PURE__ */ jsxs(Box, { marginBottom: 1, paddingLeft: 2, children: [
      /* @__PURE__ */ jsxs(Text, { color: "blue", children: [
        "\u{1F4E5} Queued: ",
        queuedInput.length > 40 ? queuedInput.slice(0, 40) + "..." : queuedInput
      ] }),
      /* @__PURE__ */ jsx(Text, { color: "gray", dimColor: true, children: " (Esc to send now)" })
    ] }),
    /* @__PURE__ */ jsx(
      Box,
      {
        borderStyle: "round",
        borderColor: hasQueuedMessage ? "blue" : isProcessing ? "gray" : "yellow",
        paddingX: 1,
        marginTop: 1,
        children: /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { color: hasQueuedMessage ? "blue" : "yellow", bold: true, children: "\u276F " }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              value: input,
              onChange: setInput,
              onSubmit: handleSubmit,
              placeholder: hasQueuedMessage ? "Message queued. Type more or press Esc to send now." : isProcessing ? "Type to queue a message..." : "Ask anything or type / for commands"
            }
          )
        ] })
      }
    ),
    /* @__PURE__ */ jsxs(Box, { marginTop: 1, justifyContent: "space-between", children: [
      /* @__PURE__ */ jsx(Text, { color: "gray", dimColor: true, children: "\u21B5 Send \u2022 Esc interrupt \u2022 /help commands" }),
      /* @__PURE__ */ jsxs(Box, { children: [
        tokenUsage.sessionCost > 0 && /* @__PURE__ */ jsx(Text, { color: "cyan", children: formatCost(tokenUsage.sessionCost) }),
        tokenUsage.totalTokens > 0 && /* @__PURE__ */ jsxs(Text, { color: getTokenColor(tokenUsage.inputTokens), children: [
          tokenUsage.sessionCost > 0 ? " \u2022 " : "",
          "~",
          formatTokenCount(tokenUsage.inputTokens),
          " tokens",
          tokenUsage.inputTokens >= 8e4 && " (/compact)"
        ] }),
        /* @__PURE__ */ jsxs(Text, { color: "gray", dimColor: true, children: [
          tokenUsage.totalTokens > 0 ? " \u2022 " : "",
          isProcessing ? "\u23F3" : "\u2713",
          " Ready"
        ] })
      ] })
    ] })
  ] });
}

// src/index.ts
var VERSION = "0.1.43";
function cleanup() {
  if (processManager.hasRunning()) {
    const count = processManager.runningCount();
    console.log(chalk3.dim(`
Stopping ${count} background process${count > 1 ? "es" : ""}...`));
    processManager.killAll();
  }
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("exit", () => {
  processManager.killAll();
});
var program = new Command();
program.name("quantish").description("AI coding & trading agent for Polymarket").version(VERSION);
program.command("init").description("Configure Quantish CLI with your API keys").action(async () => {
  await runSetup();
});
program.command("config").description("View or edit configuration").option("-s, --show", "Show current configuration").option("-c, --clear", "Clear all configuration").option("--path", "Show config file path").option("--export", "Export configuration as .env format").option("--show-keys", "Show full API keys (use with caution)").action(async (options) => {
  const config = getConfigManager();
  if (options.path) {
    console.log(config.getConfigPath());
    return;
  }
  if (options.clear) {
    config.clear();
    success("Configuration cleared.");
    return;
  }
  if (options.export) {
    const all2 = config.getAll();
    console.log();
    console.log(chalk3.bold.yellow("# Quantish CLI Configuration"));
    console.log(chalk3.dim("# Add these to your .env file for your custom agents"));
    console.log();
    if (all2.anthropicApiKey) {
      console.log(`ANTHROPIC_API_KEY=${all2.anthropicApiKey}`);
    }
    if (all2.openrouterApiKey) {
      console.log(`OPENROUTER_API_KEY=${all2.openrouterApiKey}`);
    }
    if (all2.quantishApiKey) {
      console.log(`QUANTISH_API_KEY=${all2.quantishApiKey}`);
    }
    console.log(`QUANTISH_MCP_URL=${all2.mcpServerUrl}`);
    console.log(`QUANTISH_MODEL=${all2.model || "claude-sonnet-4-5-20250929"}`);
    console.log(`QUANTISH_PROVIDER=${all2.provider || "anthropic"}`);
    console.log();
    console.log(chalk3.dim("# Discovery MCP (public, read-only market data)"));
    console.log(`QUANTISH_DISCOVERY_URL=https://quantish.live/mcp`);
    console.log();
    console.log(chalk3.yellow("\u26A0\uFE0F  Keep these keys secure! Do not commit to git."));
    console.log();
    return;
  }
  const all = config.getAll();
  console.log();
  console.log(chalk3.bold("Quantish Configuration"));
  printDivider();
  if (options.showKeys) {
    tableRow("Anthropic API Key", all.anthropicApiKey || chalk3.dim("Not set"));
    tableRow("OpenRouter API Key", all.openrouterApiKey || chalk3.dim("Not set"));
    tableRow("Quantish API Key", all.quantishApiKey || chalk3.dim("Not set"));
  } else {
    tableRow("Anthropic API Key", all.anthropicApiKey ? `${all.anthropicApiKey.slice(0, 10)}...` : chalk3.dim("Not set"));
    tableRow("OpenRouter API Key", all.openrouterApiKey ? `${all.openrouterApiKey.slice(0, 10)}...` : chalk3.dim("Not set"));
    tableRow("Quantish API Key", all.quantishApiKey ? `${all.quantishApiKey.slice(0, 12)}...` : chalk3.dim("Not set"));
  }
  tableRow("Provider", all.provider || "anthropic");
  tableRow("MCP Server URL", all.mcpServerUrl);
  tableRow("Model", all.model || "claude-sonnet-4-5-20250929");
  printDivider();
  console.log(chalk3.dim(`Config file: ${config.getConfigPath()}`));
  console.log();
  if (all.quantishApiKey) {
    console.log(chalk3.green("\u2713 Trading enabled") + chalk3.dim(" - Your wallet credentials are stored securely on the Quantish server."));
    console.log(chalk3.dim('  Use "quantish config --export" to export keys for your own agents.'));
  } else {
    console.log(chalk3.yellow("\u26A0 Trading not enabled") + chalk3.dim(' - Run "quantish init" to set up your wallet.'));
  }
  console.log();
});
program.command("tools").description("List available tools").option("-l, --local", "Show only local tools").option("-d, --discovery", "Show only Discovery MCP tools").option("-t, --trading", "Show only Trading MCP tools").option("-k, --kalshi", "Show only Kalshi MCP tools").action(async (options) => {
  console.log();
  const showAll = !options.local && !options.discovery && !options.trading && !options.kalshi;
  if (showAll || options.local) {
    console.log(chalk3.bold.blue("\u{1F4C1} Local Tools (coding)"));
    printDivider();
    for (const tool of localTools) {
      console.log(chalk3.cyan(`  ${tool.name}`));
      const desc = tool.description || "";
      console.log(chalk3.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}`));
    }
    console.log();
  }
  if (showAll || options.discovery) {
    console.log(chalk3.bold.green("\u{1F50D} Discovery MCP Tools (market search)"));
    printDivider();
    try {
      const discoveryClient = createMCPClient(
        DISCOVERY_MCP_URL,
        DISCOVERY_MCP_PUBLIC_KEY,
        "discovery"
      );
      const discoveryTools = await discoveryClient.listTools();
      for (const tool of discoveryTools) {
        console.log(chalk3.green(`  ${tool.name}`));
        const desc = tool.description || "";
        console.log(chalk3.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}`));
      }
    } catch (error2) {
      warn("Could not fetch Discovery tools.");
    }
    console.log();
  }
  if (showAll || options.trading) {
    const config = getConfigManager();
    if (config.isTradingEnabled()) {
      console.log(chalk3.bold.magenta("\u{1F4B0} Polymarket Trading MCP Tools (wallet & orders)"));
      printDivider();
      try {
        const tradingClient = createMCPClient(
          config.getTradingMcpUrl(),
          config.getQuantishApiKey(),
          "trading"
        );
        const tradingTools = await tradingClient.listTools();
        for (const tool of tradingTools) {
          console.log(chalk3.magenta(`  ${tool.name}`));
          const desc = tool.description || "";
          console.log(chalk3.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}`));
        }
      } catch (error2) {
        warn("Could not fetch Trading tools. Check your API key.");
      }
      console.log();
    } else {
      console.log(chalk3.dim('\u{1F4B0} Polymarket Trading MCP: Not configured. Run "quantish init" to enable trading.'));
      console.log();
    }
  }
  if (showAll || options.kalshi) {
    const config = getConfigManager();
    const kalshiKey = config.getKalshiApiKey();
    if (kalshiKey) {
      console.log(chalk3.bold.yellow("\u{1F3AF} Kalshi MCP Tools (DFlow on Solana)"));
      printDivider();
      try {
        const kalshiClient = createMCPClient(
          KALSHI_MCP_URL,
          kalshiKey,
          "kalshi"
        );
        const kalshiTools = await kalshiClient.listTools();
        for (const tool of kalshiTools) {
          console.log(chalk3.yellow(`  ${tool.name}`));
          const desc = tool.description || "";
          console.log(chalk3.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}`));
        }
      } catch (error2) {
        warn("Could not fetch Kalshi tools. Check your API key.");
      }
      console.log();
    } else {
      console.log(chalk3.dim("\u{1F3AF} Kalshi MCP: Not configured. Set your Kalshi API key to enable."));
      console.log();
    }
  }
});
program.command("chat").description("Start interactive chat mode").option("--no-mcp", "Disable MCP trading tools").option("--no-local", "Disable local coding tools").action(async (options) => {
  if (!await ensureConfigured()) {
    return;
  }
  await runInteractiveChat({
    enableMCP: options.mcp !== false,
    enableLocal: options.local !== false
  });
});
program.option("-p, --prompt <message>", "Send a one-shot prompt").option("-v, --verbose", "Show tool calls and details").option("--no-mcp", "Disable MCP trading tools").option("--no-local", "Disable local coding tools").action(async (options) => {
  if (options.prompt) {
    if (!await ensureConfigured()) {
      return;
    }
    await runOneShotPrompt(options.prompt, {
      verbose: options.verbose,
      enableMCP: options.mcp !== false,
      enableLocal: options.local !== false
    });
    return;
  }
  if (!process.stdin.isTTY) {
    const input = await readStdin();
    if (input) {
      if (!await ensureConfigured()) {
        return;
      }
      await runOneShotPrompt(input, {
        verbose: options.verbose,
        enableMCP: options.mcp !== false,
        enableLocal: options.local !== false
      });
      return;
    }
  }
  if (!await ensureConfigured()) {
    return;
  }
  await runInteractiveChat({
    enableMCP: options.mcp !== false,
    enableLocal: options.local !== false
  });
});
function createMCPManager(options) {
  if (options.enableMCP === false) {
    return void 0;
  }
  const config = getConfigManager();
  return createMCPClientManager(
    DISCOVERY_MCP_URL,
    DISCOVERY_MCP_PUBLIC_KEY,
    config.isTradingEnabled() ? config.getTradingMcpUrl() : void 0,
    config.getQuantishApiKey(),
    config.getKalshiApiKey() ? KALSHI_MCP_URL : void 0,
    config.getKalshiApiKey()
  );
}
async function runInteractiveChat(options = {}) {
  const config = getConfigManager();
  const mcpClientManager = createMCPManager(options);
  const agent = createAgent({
    provider: config.getProvider(),
    anthropicApiKey: config.getAnthropicApiKey(),
    openrouterApiKey: config.getOpenRouterApiKey(),
    mcpClientManager,
    model: config.getModel(),
    enableLocalTools: options.enableLocal !== false,
    enableMCPTools: options.enableMCP !== false,
    workingDirectory: process.cwd()
  });
  const canUseInk = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";
  if (canUseInk) {
    printHeader();
    const { waitUntilExit } = render(
      React2.createElement(App, {
        agent,
        onExit: () => {
          console.log(chalk3.dim("Goodbye!"));
        }
      }),
      {
        exitOnCtrlC: false
        // We handle Ctrl+C ourselves
      }
    );
    await waitUntilExit();
  } else {
    await runReadlineChat(agent, mcpClientManager, options);
  }
}
async function runReadlineChat(agent, mcpClientManager, options) {
  const readline2 = await import("readline");
  printHeader();
  const config = getConfigManager();
  const capabilities = [];
  if (options.enableLocal !== false) capabilities.push("coding");
  if (options.enableMCP !== false) {
    capabilities.push("discovery");
    if (config.isTradingEnabled()) capabilities.push("trading");
  }
  console.log(chalk3.dim(`Capabilities: ${capabilities.join(", ")}`));
  console.log(chalk3.dim('Type "exit" to quit, "clear" to reset conversation, "tools" to list tools.'));
  console.log();
  const rl = readline2.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false
  });
  const promptUser = () => {
    rl.question(chalk3.yellow("You: "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }
      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        console.log(chalk3.dim("Goodbye!"));
        rl.close();
        return;
      }
      if (trimmed.toLowerCase() === "clear") {
        agent.clearHistory();
        console.log(chalk3.dim("Conversation cleared."));
        promptUser();
        return;
      }
      if (trimmed.toLowerCase() === "tools") {
        console.log(chalk3.dim(`
Local tools: ${localTools.map((t) => t.name).join(", ")}`));
        if (mcpClientManager) {
          try {
            const mcpTools = await mcpClientManager.listAllTools();
            const discoveryTools = mcpTools.filter((t) => t.source === "discovery");
            const tradingTools = mcpTools.filter((t) => t.source === "trading");
            console.log(chalk3.dim(`Discovery tools (${discoveryTools.length}): ${discoveryTools.map((t) => t.name).join(", ")}`));
            if (tradingTools.length > 0) {
              console.log(chalk3.dim(`Trading tools (${tradingTools.length}): ${tradingTools.map((t) => t.name).join(", ")}`));
            }
          } catch {
            console.log(chalk3.dim("MCP tools: (error fetching)"));
          }
        }
        console.log();
        promptUser();
        return;
      }
      const spin = spinner("Thinking...");
      try {
        spin.start();
        const result = await agent.run(trimmed);
        spin.stop();
        if (result.text) {
          assistant(result.text);
        } else if (result.toolCalls.length > 0) {
          console.log();
          const localCount = result.toolCalls.filter((t) => t.source === "local").length;
          const discoveryCount = result.toolCalls.filter((t) => t.source === "discovery").length;
          const tradingCount = result.toolCalls.filter((t) => t.source === "trading").length;
          const summary = [];
          if (localCount > 0) summary.push(`${localCount} local`);
          if (discoveryCount > 0) summary.push(`${discoveryCount} discovery`);
          if (tradingCount > 0) summary.push(`${tradingCount} trading`);
          console.log(chalk3.cyan("Done.") + chalk3.dim(` (${summary.join(", ")} tool calls)`));
          console.log();
        }
      } catch (error2) {
        spin.stop();
        const errorMsg = error2 instanceof Error ? error2.message : String(error2);
        if (errorMsg.includes("credit balance is too low")) {
          error("Anthropic API credits exhausted. Please add credits at console.anthropic.com");
        } else if (errorMsg.includes("invalid_api_key") || errorMsg.includes("401")) {
          error('Invalid Anthropic API key. Run "quantish init" to reconfigure.');
        } else if (errorMsg.includes("rate_limit")) {
          error("Rate limited by Anthropic API. Please wait a moment and try again.");
        } else {
          error(`Error: ${errorMsg}`);
        }
        console.log();
      }
      promptUser();
    });
  };
  rl.on("close", () => {
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log(chalk3.dim("\nGoodbye!"));
    rl.close();
    process.exit(0);
  });
  promptUser();
}
async function runOneShotPrompt(message, options = {}) {
  const config = getConfigManager();
  const mcpClientManager = createMCPManager(options);
  const agent = createAgent({
    provider: config.getProvider(),
    anthropicApiKey: config.getAnthropicApiKey(),
    openrouterApiKey: config.getOpenRouterApiKey(),
    mcpClientManager,
    model: config.getModel(),
    enableLocalTools: options.enableLocal !== false,
    enableMCPTools: options.enableMCP !== false,
    workingDirectory: process.cwd(),
    onToolCall: options.verbose ? (name, args) => {
      toolCall(name, args);
    } : void 0
  });
  const spin = options.verbose ? null : spinner("Processing...");
  try {
    spin?.start();
    const result = await agent.run(message);
    spin?.stop();
    if (result.text) {
      console.log(result.text);
    }
  } catch (error2) {
    spin?.stop();
    const errorMsg = error2 instanceof Error ? error2.message : String(error2);
    if (errorMsg.includes("credit balance is too low")) {
      error("Anthropic API credits exhausted. Please add credits at console.anthropic.com");
    } else if (errorMsg.includes("invalid_api_key") || errorMsg.includes("401")) {
      error('Invalid Anthropic API key. Run "quantish init" to reconfigure.');
    } else if (errorMsg.includes("rate_limit")) {
      error("Rate limited by Anthropic API. Please wait a moment and try again.");
    } else {
      error(`Error: ${errorMsg}`);
    }
    process.exit(1);
  }
}
async function readStdin() {
  return new Promise((resolve2) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve2(data.trim());
    });
    setTimeout(() => {
      resolve2(data.trim());
    }, 100);
  });
}
program.parse();
