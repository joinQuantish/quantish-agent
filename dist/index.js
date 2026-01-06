#!/usr/bin/env node
import {
  createAgent,
  createMCPClient,
  createMCPClientManager,
  formatCost,
  getModelConfig,
  getOpenRouterModelConfig,
  listModels,
  listOpenRouterModels,
  localTools,
  processManager
} from "./chunk-LQQUSD7H.js";

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
var DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-4.5";
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
async function prompt(question, isSecret = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    if (isSecret) {
      console.log(chalk.dim("(Input will be visible)"));
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
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
    console.log(chalk.dim("  Using model: Claude Haiku 4.5\n"));
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
import { join as join2 } from "path";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from "fs";
var SESSIONS_DIR = join2(homedir2(), ".quantish", "sessions");
var INDEX_FILE = join2(SESSIONS_DIR, "index.json");
function ensureSessionsDir() {
  if (!existsSync(SESSIONS_DIR)) {
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
  if (!existsSync(INDEX_FILE)) {
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
  return join2(SESSIONS_DIR, `${id}.json`);
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
    if (!existsSync(sessionPath)) {
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
    if (!existsSync(sessionPath)) {
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
          unlinkSync(join2(SESSIONS_DIR, file));
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
  const [prevInputTokens, setPrevInputTokens] = useState(0);
  const [contextStatus, setContextStatus] = useState(null);
  const [turnCount, setTurnCount] = useState(0);
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
        setTokenUsage((prev) => {
          if (prev.inputTokens > 0 && usage.inputTokens < prev.inputTokens * 0.5) {
            setContextStatus(`\u2193${formatTokenCount(prev.inputTokens - usage.inputTokens)} saved`);
            setTimeout(() => setContextStatus(null), 5e3);
          } else if (usage.inputTokens > prev.inputTokens * 1.5 && prev.inputTokens > 1e4) {
            setContextStatus("tool results (ephemeral)");
            setTimeout(() => setContextStatus(null), 8e3);
          }
          setPrevInputTokens(prev.inputTokens);
          return usage;
        });
      },
      onCompression: (toolName, originalSize, compressedSize) => {
        const savedPercent = Math.round((1 - compressedSize / originalSize) * 100);
        setContextStatus(`${toolName}: compressed ${savedPercent}%`);
        setTimeout(() => setContextStatus(null), 5e3);
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
          " ctx",
          contextStatus && /* @__PURE__ */ jsxs(Text, { color: "cyan", children: [
            " (",
            contextStatus,
            ")"
          ] }),
          !contextStatus && tokenUsage.inputTokens >= 8e4 && " (/compact)"
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
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var packageJson = require2("../package.json");
var VERSION = packageJson.version;
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
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data.trim());
    });
    setTimeout(() => {
      resolve(data.trim());
    }, 100);
  });
}
program.parse();
