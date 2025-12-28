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
var DEFAULT_MCP_URL = DEFAULT_TRADING_MCP_URL;
var schema = {
  anthropicApiKey: {
    type: "string"
  },
  quantishApiKey: {
    type: "string"
  },
  mcpServerUrl: {
    type: "string",
    default: DEFAULT_MCP_URL
  },
  model: {
    type: "string",
    default: "claude-sonnet-4-5-20250929"
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
   * Get the model to use
   */
  getModel() {
    return this.conf.get("model") ?? "claude-sonnet-4-5-20250929";
  }
  /**
   * Set the model to use
   */
  setModel(model) {
    this.conf.set("model", model);
  }
  /**
   * Check if the CLI is configured (has at least Anthropic key)
   * Discovery MCP works without any user key (embedded public key)
   * Trading MCP requires a user key
   */
  isConfigured() {
    return !!this.getAnthropicApiKey();
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
      quantishApiKey: this.getQuantishApiKey(),
      mcpServerUrl: this.getMcpServerUrl(),
      model: this.getModel()
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
    if (this.source === "discovery") {
      const response2 = await fetch(`${this.baseUrl}/tools`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        }
      });
      if (!response2.ok) {
        throw new Error(`MCP server error: ${response2.status} ${response2.statusText}`);
      }
      const data2 = await response2.json();
      this.toolsCache = data2.tools || [];
      return this.toolsCache;
    }
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey
      },
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
   * Discovery MCP uses REST endpoints, Trading MCP uses JSON-RPC
   */
  async callTool(name, args) {
    if (this.source === "discovery") {
      const response2 = await fetch(`${this.baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        body: JSON.stringify({
          name,
          arguments: args
        })
      });
      if (!response2.ok) {
        return {
          success: false,
          error: `MCP server error: ${response2.status} ${response2.statusText}`
        };
      }
      const data2 = await response2.json();
      if (data2.error) {
        return {
          success: false,
          error: typeof data2.error === "string" ? data2.error : JSON.stringify(data2.error)
        };
      }
      return {
        success: true,
        data: data2.data ?? data2.result ?? data2
      };
    }
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey
      },
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
  toolSourceMap = /* @__PURE__ */ new Map();
  allToolsCache = null;
  constructor(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey) {
    this.discoveryClient = new MCPClient(discoveryUrl, discoveryApiKey, "discovery");
    this.tradingClient = tradingUrl && tradingApiKey ? new MCPClient(tradingUrl, tradingApiKey, "trading") : null;
  }
  /**
   * Check if trading is enabled
   */
  isTradingEnabled() {
    return this.tradingClient !== null;
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
    if (this.tradingClient) {
      try {
        const tradingTools = await this.tradingClient.listTools();
        for (const tool of tradingTools) {
          allTools.push({ ...tool, source: "trading" });
          this.toolSourceMap.set(tool.name, "trading");
        }
      } catch (error2) {
        console.warn("Failed to fetch Trading MCP tools:", error2);
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
          error: `Trading not enabled. Run 'quantish init' to set up trading.`
        };
      }
      const result = await this.tradingClient.callTool(name, args);
      return { ...result, source: "trading" };
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
function createMCPClientManager(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey) {
  return new MCPClientManager(discoveryUrl, discoveryApiKey, tradingUrl, tradingApiKey);
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
  console.log(chalk.bold("Two Capabilities:"));
  console.log();
  console.log(chalk.cyan("\u{1F50D} Market Discovery") + chalk.dim(" (Free, always available)"));
  console.log(chalk.dim("   Search markets across Polymarket, Kalshi, and more"));
  console.log(chalk.dim("   Uses our Discovery MCP with embedded public key"));
  console.log();
  console.log(chalk.magenta("\u{1F4B0} Polymarket Trading") + chalk.dim(" (Optional, your own wallet)"));
  console.log(chalk.dim("   Trade on Polymarket with a managed wallet"));
  console.log(chalk.dim("   Uses the Quantish Signing Server"));
  console.log();
  console.log(chalk.bold("How Trading Works:"));
  console.log(chalk.dim("  1. We create a wallet for you on the Quantish Signing Server"));
  console.log(chalk.dim("  2. Orders are signed and relayed through Polymarket's system"));
  console.log(chalk.dim("  3. Gas fees are covered by Polymarket's relayer - FREE!"));
  console.log(chalk.dim("  4. You control your wallet via your personal API key\n"));
  console.log(chalk.bold("Security:"));
  console.log(chalk.dim("  \u2022 Your wallet is non-custodial - only you can authorize trades"));
  console.log(chalk.dim("  \u2022 Export your private key anytime with: ") + chalk.cyan("export_private_key"));
  console.log(chalk.dim("  \u2022 Discovery is read-only - it can't access your wallet"));
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
  console.log(chalk.bold("Step 1: Anthropic API Key"));
  console.log(chalk.dim("Powers the AI agent. Get yours at https://console.anthropic.com/"));
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
  console.log(chalk.bold("Step 2: Polymarket Trading (Optional)"));
  console.log(chalk.dim("Enable trading on Polymarket with your own managed wallet."));
  console.log(chalk.dim("Skip this if you only want to search/discover markets.\n"));
  let quantishKey = config.getQuantishApiKey();
  let skipTrading = false;
  if (quantishKey) {
    console.log(chalk.dim(`Current trading key: ${quantishKey.slice(0, 12)}...`));
    const action = await prompt("Keep current key (Enter), enter new key (n), or disable trading (d): ");
    if (action.toLowerCase() === "n") {
      quantishKey = await prompt("Enter your Quantish Trading API key: ", true);
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
  console.log(chalk.bold("Step 3: Exa API Key (Optional)"));
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
  console.log(chalk.bold("Step 4: Verifying connections..."));
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
        console.log(chalk.green("\u2713 Trading MCP connected"));
        console.log(chalk.dim(`  Safe Address: ${data.safeAddress || "Not yet deployed"}`));
        console.log(chalk.dim(`  Status: ${data.status}`));
        console.log(chalk.dim(`  Ready to trade: ${data.isReady ? "Yes" : "Run setup_wallet first"}`));
      } else {
        console.log(chalk.yellow("\u26A0 Trading MCP: " + (result.error || "Unknown error")));
      }
    } catch (error2) {
      console.log(chalk.yellow("\u26A0 Could not verify Trading MCP connection."));
      console.log(chalk.dim(String(error2)));
    }
  } else {
    console.log(chalk.dim("\u23ED Trading MCP skipped (no API key)"));
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
    console.log(chalk.yellow("Quantish CLI is not configured yet."));
    console.log("Run " + chalk.yellow("quantish init") + " to set up.\n");
    return false;
  }
  return true;
}

// src/agent/loop.ts
import Anthropic from "@anthropic-ai/sdk";

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
  },
  {
    name: "setup_env",
    description: "Setup or update environment variables in a .env file for an application. Creates .env if it doesn't exist. Optionally creates a .env.example template. Use this when building any application that needs API keys or configuration.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Path to the .env file (default: ".env" in current directory)'
        },
        variables: {
          type: "object",
          description: 'Object with environment variable names as keys and values. Example: { "QUANTISH_API_KEY": "abc123", "TOKEN_ID": "xyz" }',
          additionalProperties: { type: "string" }
        },
        overwrite: {
          type: "boolean",
          description: "If true, overwrite existing variables. Default false (skip existing)."
        },
        create_example: {
          type: "boolean",
          description: "If true, also create a .env.example template file with placeholder values."
        }
      },
      required: ["variables"]
    }
  }
];
async function setupEnv(envPath = ".env", variables, options) {
  try {
    const resolvedPath = path.resolve(envPath);
    let content = "";
    const existingVars = {};
    if (existsSync(resolvedPath)) {
      content = await fs.readFile(resolvedPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex);
            const value = trimmed.slice(eqIndex + 1);
            existingVars[key] = value;
          }
        }
      }
    }
    const updatedVars = [];
    const addedVars = [];
    const skippedVars = [];
    for (const [key, value] of Object.entries(variables)) {
      if (existingVars[key] !== void 0) {
        if (options?.overwrite) {
          const regex = new RegExp(`^${key}=.*$`, "m");
          content = content.replace(regex, `${key}=${value}`);
          updatedVars.push(key);
        } else {
          skippedVars.push(key);
        }
      } else {
        if (content && !content.endsWith("\n")) {
          content += "\n";
        }
        content += `${key}=${value}
`;
        addedVars.push(key);
      }
    }
    await fs.writeFile(resolvedPath, content, "utf-8");
    if (options?.createExample) {
      const examplePath = resolvedPath.replace(/\.env$/, ".env.example");
      let exampleContent = "# Environment variables for this application\n";
      exampleContent += "# Copy this file to .env and fill in your values\n\n";
      for (const key of Object.keys({ ...existingVars, ...variables })) {
        if (key === "QUANTISH_API_KEY") {
          exampleContent += `# Get your API key at https://quantish.live
`;
          exampleContent += `${key}=your_api_key_here

`;
        } else {
          exampleContent += `${key}=
`;
        }
      }
      await fs.writeFile(examplePath, exampleContent, "utf-8");
    }
    return {
      success: true,
      data: {
        path: resolvedPath,
        added: addedVars,
        updated: updatedVars,
        skipped: skippedVars,
        exampleCreated: options?.createExample || false
      }
    };
  } catch (error2) {
    return {
      success: false,
      error: `Failed to setup env: ${error2 instanceof Error ? error2.message : String(error2)}`
    };
  }
}
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
    case "setup_env":
      return setupEnv(
        args.path || ".env",
        args.variables,
        {
          overwrite: args.overwrite,
          createExample: args.create_example
        }
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

// src/agent/compaction.ts
var COMPACTION_PROMPT = `Your context window is filling up. Please create a concise summary of our conversation so far that will allow you to continue working effectively.

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
function parseCompactedSummary(response) {
  const match = response.match(/<summary>([\s\S]*?)<\/summary>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return response.trim() || null;
}
async function createCompactedSummary(anthropic, history, model = "claude-sonnet-4-5-20250929", customPrompt) {
  const prompt2 = customPrompt || COMPACTION_PROMPT;
  const compactionMessages = [
    ...history,
    {
      role: "user",
      content: prompt2
    }
  ];
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: compactionMessages
  });
  const textBlocks = response.content.filter((block) => block.type === "text");
  const fullText = textBlocks.map((block) => block.text).join("\n");
  const summary = parseCompactedSummary(fullText);
  if (!summary) {
    throw new Error("Failed to parse compacted summary from response");
  }
  return summary;
}
function historyFromSummary(summary) {
  return [
    {
      role: "assistant",
      content: summary
    }
  ];
}
async function compactConversation(anthropic, history, model, systemPrompt, tools) {
  let originalTokens = 0;
  try {
    const countResult = await anthropic.messages.countTokens({
      model,
      system: systemPrompt,
      tools,
      messages: history
    });
    originalTokens = countResult.input_tokens;
  } catch (e) {
    const contentLength = JSON.stringify(history).length;
    originalTokens = Math.ceil(contentLength / 4);
  }
  const summaryModel = "claude-sonnet-4-5-20250929";
  const summary = await createCompactedSummary(anthropic, history, summaryModel);
  const newHistory = historyFromSummary(summary);
  let newTokens = 0;
  try {
    const countResult = await anthropic.messages.countTokens({
      model,
      system: systemPrompt,
      tools,
      messages: newHistory
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
    newTokens
  };
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
  return null;
}
function getModelPricing(modelId) {
  const model = MODELS[modelId];
  return model?.pricing ?? null;
}
function getModelConfig(modelId) {
  return MODELS[modelId] ?? null;
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
    return `$${(cost * 100).toFixed(3)}\xA2`;
  }
  return `$${cost.toFixed(4)}`;
}
function listModels() {
  return Object.values(MODELS);
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
var DEFAULT_SYSTEM_PROMPT = `You are Quantish, an AI coding and trading agent.

You have two sets of capabilities:

## Trading Tools (via MCP)
You can interact with Polymarket prediction markets:
- Check wallet balances and positions
- Place, cancel, and manage orders  
- Transfer funds and claim winnings
- Get market prices and orderbook data

## Coding Tools (local)
You can work with the local filesystem:
- Read and write files
- List directories and search with grep
- Run shell commands
- Use git for version control

## Guidelines
- Be concise and helpful
- When making trades, always confirm details before proceeding
- Prices on Polymarket are between 0.01 and 0.99 (probabilities)
- Minimum order value is $1
- When writing code, follow existing patterns and conventions
- For dangerous operations (rm, sudo), explain what you're doing

You help users build ANY application that interacts with prediction markets - trading bots, web apps, mobile backends, dashboards, notification systems, analytics tools, Discord bots, Telegram bots, and more.

## Building Applications with Quantish MCP

When users ask you to create ANY application that uses prediction market data or trading (bots, APIs, web apps, scripts, etc.), you MUST use the Quantish MCP HTTP API. This is the ONLY way to access market data and trading functionality in standalone applications.

### \u26A0\uFE0F CRITICAL: DO NOT USE MCP SDK DIRECTLY
NEVER import or use these packages in standalone apps:
- \u274C @modelcontextprotocol/sdk
- \u274C StdioClientTransport
- \u274C Client from MCP SDK

These only work within the Quantish CLI itself. Standalone apps MUST use the HTTP API with fetch().

### MCP HTTP API Endpoint
\`\`\`
POST https://quantish-sdk-production.up.railway.app/mcp/execute
\`\`\`

### Authentication
\`\`\`
Header: x-api-key: <QUANTISH_API_KEY>
\`\`\`
The API key is stored in the user's environment as QUANTISH_API_KEY. Always read from env vars, never hardcode.

### Request Format (JSON-RPC 2.0)
\`\`\`javascript
const response = await fetch('https://quantish-sdk-production.up.railway.app/mcp/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.QUANTISH_API_KEY
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { 
      name: 'tool_name', 
      arguments: { /* tool args */ } 
    },
    id: Date.now()
  })
});
\`\`\`

### Response Format
\`\`\`javascript
// Success response structure:
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{ 
      "type": "text", 
      "text": "{\\"key\\": \\"value\\"}"  // JSON string - parse this!
    }]
  },
  "id": 123
}

// Parse the inner JSON:
const data = await response.json();
const result = JSON.parse(data.result.content[0].text);
\`\`\`

### Key Trading Tools (require QUANTISH_API_KEY)
- \`get_balances\`: Returns { usdc, nativeUsdc, matic } for EOA and Safe wallets
- \`get_positions\`: Returns array of current share holdings with market info
- \`place_order\`: Place order. Args: { conditionId, tokenId, side: "BUY"|"SELL", price: 0.01-0.99, size: number }
- \`cancel_order\`: Cancel order. Args: { orderId }
- \`get_orders\`: List orders. Args: { status?: "LIVE"|"FILLED"|"CANCELLED" }
- \`get_orderbook\`: Get bids/asks. Args: { tokenId }
- \`get_price\`: Get midpoint price. Args: { tokenId }
- \`get_deposit_addresses\`: Get addresses to fund wallet
- \`transfer_usdc\`: Send USDC. Args: { toAddress, amount }

### Key Discovery Tools (free, no auth required)
Discovery uses a SIMPLER request format (not full JSON-RPC):
\`\`\`javascript
// Discovery API - uses simple { name, arguments } format
const response = await fetch('https://quantish.live/mcp/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8'
  },
  body: JSON.stringify({
    name: 'search_markets',        // Tool name at top level
    arguments: { query: 'bitcoin', limit: 5 }  // Arguments at top level
  })
});

// Response is still JSON-RPC wrapped:
const data = await response.json();
const result = JSON.parse(data.result.content[0].text);
\`\`\`

Available Discovery Tools:
- \`search_markets\`: Find markets. Args: { query, limit?, platform?: "polymarket"|"kalshi"|"all" }
- \`get_market_details\`: Get market info. Args: { platform, marketId }
- \`get_trending_markets\`: Popular markets. Args: { limit?, platform? }
- \`find_arbitrage\`: Find arb opportunities. Args: { minProfitPercent?, type? }

### Important: Token IDs and Condition IDs
When placing orders, you need:
- \`conditionId\`: The market's condition ID (from market details)
- \`tokenId\`: The specific outcome's token ID (YES or NO token from market.tokens array)

Example flow:
1. search_markets({ query: "bitcoin" }) \u2192 get market list
2. get_market_details({ platform: "polymarket", marketId: "..." }) \u2192 get tokens array
3. Extract tokenId for YES/NO outcome you want
4. place_order({ conditionId, tokenId, side: "BUY", price: 0.55, size: 100 })

### Bot Code Template (Node.js)
\`\`\`javascript
#!/usr/bin/env node
require('dotenv').config();

const MCP_URL = 'https://quantish-sdk-production.up.railway.app/mcp/execute';
const API_KEY = process.env.QUANTISH_API_KEY;

async function callTool(name, args = {}) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id: Date.now()
    })
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  
  try {
    return JSON.parse(data.result.content[0].text);
  } catch {
    return data.result.content[0].text;
  }
}

// Example: Monitor price and alert
async function monitorPrice(tokenId, threshold) {
  const result = await callTool('get_price', { tokenId });
  console.log(\`Price: \${result.mid}\`);
  if (parseFloat(result.mid) > threshold) {
    console.log('ALERT: Price crossed threshold!');
  }
}

// Run every 60 seconds
setInterval(() => monitorPrice(process.env.TOKEN_ID, 0.5), 60000);
\`\`\`

### Best Practices
1. **Environment Variables**: Always use process.env for API keys
2. **Error Handling**: Wrap all API calls in try/catch
3. **Rate Limiting**: Poll at 30-60 second intervals minimum
4. **Logging**: Log all trades with timestamps for debugging
5. **Testing**: Test with small amounts first
6. **Graceful Shutdown**: Handle SIGINT to clean up
7. **.env.example**: Always create a template for required env vars

## CRITICAL: Code Generation Rules (MUST FOLLOW)

When generating ANY code that uses Quantish/MCP (bots, apps, scripts, APIs, etc.):

### MANDATORY Requirements

1. **ALWAYS include the callTool() helper function** - Copy it EXACTLY from the template above
2. **ALWAYS use callTool() for ALL MCP operations** - Never use direct API calls to Polymarket
3. **NEVER hardcode prices, market data, or API responses** - Always fetch live data via callTool()
4. **NEVER comment out MCP calls** - All API calls must be real, working, executable code
5. **ALWAYS create .env.example** - Document all required environment variables
6. **ALWAYS validate QUANTISH_API_KEY exists** - Fail fast with clear error if missing
7. **ALWAYS use dotenv** - \`require('dotenv').config()\` at the top of every file

### File Structure for ANY Application

When creating an application, ALWAYS create these files:
1. Main application file (e.g., \`app.js\`, \`bot.js\`, \`server.js\`)
2. \`.env.example\` with all required variables documented
3. \`package.json\` with dependencies (dotenv, etc.)
4. \`README.md\` with setup instructions

### Example .env.example (ALWAYS CREATE THIS)
\`\`\`
# Quantish MCP API Key (required for trading)
# Get yours at: https://quantish.live
QUANTISH_API_KEY=your_api_key_here

# Market Configuration (customize for your use case)
TOKEN_ID=your_token_id_here
CONDITION_ID=your_condition_id_here
\`\`\`

### WRONG vs CORRECT Code Examples

WRONG - Hardcoded data (NEVER DO THIS):
\`\`\`javascript
const prices = { YES: 0.55, NO: 0.45 }; // WRONG: hardcoded
const mockResult = { mid: "0.50" }; // WRONG: mock data
// await callTool('place_order', {...}); // WRONG: commented out
\`\`\`

CORRECT - Live MCP calls (ALWAYS DO THIS):
\`\`\`javascript
const priceResult = await callTool('get_price', { tokenId });
const price = parseFloat(priceResult.mid);
const orderResult = await callTool('place_order', { 
  conditionId, tokenId, side: 'BUY', price, size 
});
console.log('Order placed:', orderResult.orderId);
\`\`\`

### SIMPLE EXAMPLE - Copy This Pattern Exactly

\`\`\`javascript
// Simple bot that searches markets using Discovery API (free, no auth)
require('dotenv').config();

// Discovery API uses SIMPLE format: { name, arguments }
async function callDiscovery(name, args = {}) {
  const res = await fetch('https://quantish.live/mcp/execute', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-API-Key': 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8'  // Public key
    },
    body: JSON.stringify({ name, arguments: args })  // Simple format!
  });
  const data = await res.json();
  return JSON.parse(data.result.content[0].text);
}

// Use it!
const markets = await callDiscovery('search_markets', { query: 'bitcoin', limit: 5 });
console.log(markets);
\`\`\`

### Complete Production-Ready Template

Use this as the starting point for ANY application:

\`\`\`javascript
#!/usr/bin/env node
/**
 * Quantish Application Template
 * Replace this with your application description
 */

require('dotenv').config();

// ============================================
// MCP Configuration - DO NOT MODIFY
// ============================================
const TRADING_MCP_URL = 'https://quantish-sdk-production.up.railway.app/mcp/execute';
const DISCOVERY_MCP_URL = 'https://quantish.live/mcp/execute';
const DISCOVERY_API_KEY = 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8'; // Public key for discovery

// Validate required environment variables
if (!process.env.QUANTISH_API_KEY) {
  console.error('ERROR: QUANTISH_API_KEY environment variable is required');
  console.error('Get your API key at: https://quantish.live');
  console.error('Then create a .env file with: QUANTISH_API_KEY=your_key_here');
  process.exit(1);
}

// ============================================
// MCP Helper Functions - COPY THESE EXACTLY
// ============================================

/**
 * Call a trading tool (requires QUANTISH_API_KEY)
 * Tools: get_balances, get_positions, place_order, cancel_order, get_orders, 
 *        get_orderbook, get_price, get_deposit_addresses, transfer_usdc
 */
async function callTradingTool(name, args = {}) {
  const response = await fetch(TRADING_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.QUANTISH_API_KEY
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id: Date.now()
    })
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  
  try {
    return JSON.parse(data.result.content[0].text);
  } catch {
    return data.result.content[0].text;
  }
}

/**
 * Call a discovery tool (no auth required)
 * Uses SIMPLE format: { name, arguments } - NOT full JSON-RPC
 * Tools: search_markets, get_market_details, get_trending_markets, find_arbitrage
 */
async function callDiscoveryTool(name, args = {}) {
  const response = await fetch(DISCOVERY_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': DISCOVERY_API_KEY
    },
    body: JSON.stringify({ name, arguments: args })  // Simple format for Discovery!
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  
  try {
    return JSON.parse(data.result.content[0].text);
  } catch {
    return data.result.content[0].text;
  }
}

// Shorthand for common operations
const callTool = callTradingTool; // Default to trading tools

// ============================================
// Your Application Code Goes Here
// ============================================

async function main() {
  console.log('Starting application...');
  
  try {
    // Example: Get wallet balances
    const balances = await callTool('get_balances');
    console.log('Wallet balances:', balances);
    
    // Example: Search for markets
    const markets = await callDiscoveryTool('search_markets', { 
      query: 'Bitcoin', 
      limit: 5 
    });
    console.log('Found markets:', markets.found);
    
    // Example: Get price for a token
    if (process.env.TOKEN_ID) {
      const price = await callTool('get_price', { 
        tokenId: process.env.TOKEN_ID 
      });
      console.log('Current price:', price.mid);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\nShutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\\nShutting down...');
  process.exit(0);
});

// Run the application
main().catch(console.error);
\`\`\`

### Application Types You Can Build

- **Trading Bots**: Automated trading based on price thresholds, trends, or signals
- **Price Monitors**: Alert systems for price movements via email, SMS, Discord, Telegram
- **Web Dashboards**: React/Next.js apps displaying market data and portfolio
- **API Backends**: Express/Fastify servers exposing market data to frontends
- **Analytics Tools**: Scripts that analyze historical prices and trends
- **Arbitrage Scanners**: Tools that find and execute arbitrage opportunities
- **Portfolio Trackers**: Apps that track positions across multiple markets
- **Notification Services**: Webhooks that trigger on market events
- **Discord/Telegram Bots**: Chat bots that provide market info and execute trades

For ALL of these, use the MCP helper functions above. Never make direct API calls to Polymarket or other services.`;
var Agent = class {
  anthropic;
  mcpClient;
  mcpClientManager;
  config;
  conversationHistory = [];
  workingDirectory;
  sessionCost = 0;
  // Cumulative cost for this session
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
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
      defaultHeaders: Object.keys(headers).length > 0 ? headers : void 0
    });
    this.mcpClient = config.mcpClient;
    this.mcpClientManager = config.mcpClientManager;
    this.workingDirectory = config.workingDirectory || process.cwd();
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
   * Run the agent with a user message (supports streaming)
   * @param userMessage - The user's input message
   * @param options - Optional configuration including abort signal
   */
  async run(userMessage, options) {
    const maxIterations = this.config.maxIterations ?? 15;
    const model = this.config.model ?? "claude-sonnet-4-5-20250929";
    const maxTokens = this.config.maxTokens ?? 8192;
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const useStreaming = this.config.streaming ?? true;
    const signal = options?.signal;
    const allTools = await this.getAllTools();
    const contextManagement = this.config.contextEditing && this.config.contextEditing.length > 0 ? { edits: this.config.contextEditing } : void 0;
    const contextMessage = `[Working directory: ${this.workingDirectory}]

${userMessage}`;
    this.conversationHistory.push({
      role: "user",
      content: contextMessage
    });
    const toolCalls = [];
    let iterations = 0;
    let finalText = "";
    while (iterations < maxIterations) {
      if (signal?.aborted) {
        throw new Error("Operation aborted by user");
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
        const stream = this.anthropic.messages.stream(streamOptions, { signal });
        for await (const event of stream) {
          if (signal?.aborted) {
            stream.controller.abort();
            throw new Error("Operation aborted by user");
          }
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
        if (signal?.aborted) {
          throw new Error("Operation aborted by user");
        }
        this.config.onToolCall?.(toolUse.name, toolUse.input);
        await new Promise((resolve2) => setImmediate(resolve2));
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
   */
  updateTokenUsage(usage) {
    const model = this.config.model ?? DEFAULT_MODEL;
    this.cumulativeTokenUsage.inputTokens = usage.input_tokens;
    this.cumulativeTokenUsage.outputTokens += usage.output_tokens;
    this.cumulativeTokenUsage.cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
    this.cumulativeTokenUsage.cacheReadInputTokens = usage.cache_read_input_tokens || 0;
    this.cumulativeTokenUsage.totalTokens = this.cumulativeTokenUsage.inputTokens + this.cumulativeTokenUsage.outputTokens;
    const callCost = calculateCost(
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
    const model = this.config.model ?? "claude-sonnet-4-5-20250929";
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
    const resolvedId = resolveModelId(modelIdOrAlias);
    if (!resolvedId) {
      const availableModels = Object.values(MODELS).map((m) => m.name).join(", ");
      return {
        success: false,
        error: `Unknown model: "${modelIdOrAlias}". Available: ${availableModels}`
      };
    }
    this.config.model = resolvedId;
    const modelConfig = getModelConfig(resolvedId);
    return {
      success: true,
      model: modelConfig?.displayName ?? resolvedId
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
   * This uses Claude to create a structured summary of the conversation,
   * then replaces the history with just the summary. This dramatically
   * reduces token count while preserving important context.
   * 
   * @returns Object with original/new token counts and the summary
   */
  async compactHistory() {
    const model = this.config.model ?? "claude-sonnet-4-5-20250929";
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const allTools = await this.getAllTools();
    if (this.conversationHistory.length < 2) {
      return {
        success: false,
        originalTokenCount: 0,
        newTokenCount: 0,
        error: "Conversation too short to compact"
      };
    }
    try {
      const result = await compactConversation(
        this.anthropic,
        this.conversationHistory,
        model,
        systemPrompt,
        allTools
      );
      this.conversationHistory = result.newHistory;
      this.resetTokenUsage();
      this.cumulativeTokenUsage.inputTokens = result.newTokens;
      this.cumulativeTokenUsage.totalTokens = result.newTokens;
      this.config.onTokenUsage?.(this.cumulativeTokenUsage);
      return {
        success: true,
        summary: result.summary,
        originalTokenCount: result.originalTokens,
        newTokenCount: result.newTokens
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
var TAGLINE = chalk2.dim("  AI-powered trading agent for Polymarket");
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
import { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
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
  { cmd: "/model", desc: "Switch model (opus, sonnet, haiku)" },
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
/model      - Switch model (opus, sonnet, haiku) 
/cost       - Show session cost breakdown
/help       - Show this help message
/tools      - List available tools
/config     - Show configuration info
/processes  - List running background processes
/stop <id>  - Stop a background process by ID
/stopall    - Stop all background processes
/exit       - Exit the CLI

\u2328\uFE0F Keyboard Shortcuts:
Esc         - Interrupt current generation
Ctrl+C      - Exit (stops all processes)`
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
          const modelConfig = getModelConfig(currentModel);
          const models = listModels();
          const modelList = models.map((m) => {
            const isCurrent = m.id === currentModel ? " (current)" : "";
            return `  ${m.name}${isCurrent} - ${m.description}`;
          }).join("\n");
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u{1F916} Current model: ${modelConfig?.displayName || currentModel}

Available models:
${modelList}

Usage: /model <name>  (e.g., /model haiku, /model opus)`
          }]);
          return true;
        }
        const result = agent.setModel(args);
        if (result.success) {
          const newConfig = getModelConfig(agent.getModel());
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u2705 Switched to ${result.model}
   ${newConfig?.description || ""}`
          }]);
        } else {
          setMessages((prev) => [...prev, {
            role: "system",
            content: `\u274C ${result.error}`
          }]);
        }
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
      case "exit":
      case "quit":
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
    if (!trimmed || isProcessing) return;
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
      const result = await agent.run(trimmed, { signal: abortController.current?.signal });
      if (isInterrupted) {
        setMessages((prev) => [...prev, {
          role: "system",
          content: "\u26A1 Generation interrupted by user."
        }]);
      } else {
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isStreaming);
          return [...filtered, {
            role: "assistant",
            content: result.text || "(completed)",
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
      const errorMsg = err.message || String(err);
      let displayError = errorMsg;
      if (errorMsg.includes("aborted") || errorMsg.includes("AbortError")) {
        setMessages((prev) => [...prev, {
          role: "system",
          content: "\u26A1 Generation interrupted by user."
        }]);
      } else if (errorMsg.includes("credits exhausted")) {
        displayError = "Anthropic API credits exhausted. Please add credits at console.anthropic.com";
        setError(displayError);
      } else if (errorMsg.includes("invalid_api_key") || errorMsg.includes("401")) {
        displayError = 'Invalid Anthropic API key. Run "quantish init" to reconfigure.';
        setError(displayError);
      } else if (errorMsg.includes("rate_limit")) {
        displayError = "Rate limited by Anthropic API. Please wait a moment and try again.";
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
  useEffect(() => {
    const originalConfig = agent.config;
    agent.config = {
      ...originalConfig,
      streaming: true,
      onText: (text, isComplete) => {
        if (!isComplete) {
          setStreamingText((prev) => prev + text);
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
    if (key.escape && isProcessing) {
      setIsInterrupted(true);
      abortController.current?.abort();
      setMessages((prev) => [...prev, {
        role: "system",
        content: "\u26A1 Interrupting..."
      }]);
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
      /* @__PURE__ */ jsx(Box, { children: tc.pending ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Text, { color: "yellow", children: /* @__PURE__ */ jsx(Spinner, { type: "dots" }) }),
        /* @__PURE__ */ jsxs(Text, { color: "cyan", bold: true, children: [
          " ",
          tc.name
        ] }),
        /* @__PURE__ */ jsx(Text, { color: "gray", children: formatArgs(tc.args) }),
        /* @__PURE__ */ jsx(Text, { color: "yellow", dimColor: true, children: " Running..." })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Text, { color: tc.success ? "green" : "red", children: [
          tc.success ? "\u2713" : "\u2717",
          " ",
          tc.name
        ] }),
        /* @__PURE__ */ jsx(Text, { color: "gray", children: formatArgs(tc.args) })
      ] }) }),
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
    isProcessing && !streamingText && currentToolCalls.length === 0 && /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsxs(Text, { color: "cyan", children: [
      /* @__PURE__ */ jsx(Spinner, { type: "dots" }),
      " Thinking..."
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
    /* @__PURE__ */ jsx(
      Box,
      {
        borderStyle: "round",
        borderColor: isProcessing ? "gray" : "yellow",
        paddingX: 1,
        marginTop: 1,
        children: /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsx(Text, { color: "yellow", bold: true, children: "\u276F " }),
          /* @__PURE__ */ jsx(
            TextInput,
            {
              value: input,
              onChange: setInput,
              onSubmit: handleSubmit,
              placeholder: isProcessing ? "Processing..." : "Ask anything or type / for commands"
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
var VERSION = "0.1.0";
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
    if (all2.quantishApiKey) {
      console.log(`QUANTISH_API_KEY=${all2.quantishApiKey}`);
    }
    console.log(`QUANTISH_MCP_URL=${all2.mcpServerUrl}`);
    console.log(`QUANTISH_MODEL=${all2.model || "claude-sonnet-4-5-20250929"}`);
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
    tableRow("Quantish API Key", all.quantishApiKey || chalk3.dim("Not set"));
  } else {
    tableRow("Anthropic API Key", all.anthropicApiKey ? `${all.anthropicApiKey.slice(0, 10)}...` : chalk3.dim("Not set"));
    tableRow("Quantish API Key", all.quantishApiKey ? `${all.quantishApiKey.slice(0, 12)}...` : chalk3.dim("Not set"));
  }
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
program.command("tools").description("List available tools").option("-l, --local", "Show only local tools").option("-d, --discovery", "Show only Discovery MCP tools").option("-t, --trading", "Show only Trading MCP tools").action(async (options) => {
  console.log();
  const showAll = !options.local && !options.discovery && !options.trading;
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
      console.log(chalk3.bold.magenta("\u{1F4B0} Trading MCP Tools (wallet & orders)"));
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
      console.log(chalk3.dim('\u{1F4B0} Trading MCP: Not configured. Run "quantish init" to enable trading.'));
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
    config.getQuantishApiKey()
  );
}
async function runInteractiveChat(options = {}) {
  const config = getConfigManager();
  const mcpClientManager = createMCPManager(options);
  const agent = createAgent({
    anthropicApiKey: config.getAnthropicApiKey(),
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
    anthropicApiKey: config.getAnthropicApiKey(),
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
