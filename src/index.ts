#!/usr/bin/env node
/**
 * Quantish CLI - AI Coding & Trading Agent for Polymarket
 * 
 * A command-line agent that uses Claude to help you:
 * - Build trading bots and agents
 * - Trade on Polymarket via natural language
 * - Work with files, run commands, and use git
 */

import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import chalk from 'chalk';
import { getConfigManager, runSetup, ensureConfigured, DISCOVERY_MCP_URL, DISCOVERY_MCP_PUBLIC_KEY } from './config/index.js';
import { createMCPClient, createMCPClientManager, MCPClientManager } from './mcp/index.js';
import { createAgent } from './agent/index.js';
import { localTools, processManager } from './tools/index.js';
import * as ui from './ui/index.js';
import { App } from './ui/App.js';

const VERSION = '0.1.25';

/**
 * Cleanup function to kill all background processes on exit
 */
function cleanup(): void {
  if (processManager.hasRunning()) {
    const count = processManager.runningCount();
    console.log(chalk.dim(`\nStopping ${count} background process${count > 1 ? 'es' : ''}...`));
    processManager.killAll();
  }
}

// Register cleanup handlers for graceful shutdown
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  // Synchronous cleanup - just make sure processes are killed
  processManager.killAll();
});

const program = new Command();

program
  .name('quantish')
  .description('AI coding & trading agent for Polymarket')
  .version(VERSION);

/**
 * Init command - setup wizard
 */
program
  .command('init')
  .description('Configure Quantish CLI with your API keys')
  .action(async () => {
    await runSetup();
  });

/**
 * Config command - view/edit configuration
 */
program
  .command('config')
  .description('View or edit configuration')
  .option('-s, --show', 'Show current configuration')
  .option('-c, --clear', 'Clear all configuration')
  .option('--path', 'Show config file path')
  .option('--export', 'Export configuration as .env format')
  .option('--show-keys', 'Show full API keys (use with caution)')
  .action(async (options) => {
    const config = getConfigManager();

    if (options.path) {
      console.log(config.getConfigPath());
      return;
    }

    if (options.clear) {
      config.clear();
      ui.success('Configuration cleared.');
      return;
    }

    if (options.export) {
      // Export as .env format for users building their own agents
      const all = config.getAll();
      console.log();
      console.log(chalk.bold.yellow('# Quantish CLI Configuration'));
      console.log(chalk.dim('# Add these to your .env file for your custom agents'));
      console.log();
      if (all.anthropicApiKey) {
        console.log(`ANTHROPIC_API_KEY=${all.anthropicApiKey}`);
      }
      if (all.openrouterApiKey) {
        console.log(`OPENROUTER_API_KEY=${all.openrouterApiKey}`);
      }
      if (all.quantishApiKey) {
        console.log(`QUANTISH_API_KEY=${all.quantishApiKey}`);
      }
      console.log(`QUANTISH_MCP_URL=${all.mcpServerUrl}`);
      console.log(`QUANTISH_MODEL=${all.model || 'claude-sonnet-4-5-20250929'}`);
      console.log(`QUANTISH_PROVIDER=${all.provider || 'anthropic'}`);
      console.log();
      console.log(chalk.dim('# Discovery MCP (public, read-only market data)'));
      console.log(`QUANTISH_DISCOVERY_URL=https://quantish.live/mcp`);
      console.log();
      console.log(chalk.yellow('⚠️  Keep these keys secure! Do not commit to git.'));
      console.log();
      return;
    }

    // Default: show config
    const all = config.getAll();
    console.log();
    console.log(chalk.bold('Quantish Configuration'));
    ui.printDivider();
    
    if (options.showKeys) {
      // Show full keys
      ui.tableRow('Anthropic API Key', all.anthropicApiKey || chalk.dim('Not set'));
      ui.tableRow('OpenRouter API Key', all.openrouterApiKey || chalk.dim('Not set'));
      ui.tableRow('Quantish API Key', all.quantishApiKey || chalk.dim('Not set'));
    } else {
      // Show truncated keys
      ui.tableRow('Anthropic API Key', all.anthropicApiKey ? `${all.anthropicApiKey.slice(0, 10)}...` : chalk.dim('Not set'));
      ui.tableRow('OpenRouter API Key', all.openrouterApiKey ? `${all.openrouterApiKey.slice(0, 10)}...` : chalk.dim('Not set'));
      ui.tableRow('Quantish API Key', all.quantishApiKey ? `${all.quantishApiKey.slice(0, 12)}...` : chalk.dim('Not set'));
    }
    
    ui.tableRow('Provider', all.provider || 'anthropic');
    ui.tableRow('MCP Server URL', all.mcpServerUrl);
    ui.tableRow('Model', all.model || 'claude-sonnet-4-5-20250929');
    ui.printDivider();
    console.log(chalk.dim(`Config file: ${config.getConfigPath()}`));
    console.log();
    
    if (all.quantishApiKey) {
      console.log(chalk.green('✓ Trading enabled') + chalk.dim(' - Your wallet credentials are stored securely on the Quantish server.'));
      console.log(chalk.dim('  Use "quantish config --export" to export keys for your own agents.'));
    } else {
      console.log(chalk.yellow('⚠ Trading not enabled') + chalk.dim(' - Run "quantish init" to set up your wallet.'));
    }
    console.log();
  });

/**
 * Tools command - list available tools
 */
program
  .command('tools')
  .description('List available tools')
  .option('-l, --local', 'Show only local tools')
  .option('-d, --discovery', 'Show only Discovery MCP tools')
  .option('-t, --trading', 'Show only Trading MCP tools')
  .action(async (options) => {
    console.log();
    const showAll = !options.local && !options.discovery && !options.trading;
    
    // Local tools
    if (showAll || options.local) {
      console.log(chalk.bold.blue('📁 Local Tools (coding)'));
      ui.printDivider();
      for (const tool of localTools) {
        console.log(chalk.cyan(`  ${tool.name}`));
        const desc = tool.description || '';
        console.log(chalk.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}`));
      }
      console.log();
    }

    // Discovery MCP tools (always available)
    if (showAll || options.discovery) {
      console.log(chalk.bold.green('🔍 Discovery MCP Tools (market search)'));
      ui.printDivider();
      
      try {
        const discoveryClient = createMCPClient(
          DISCOVERY_MCP_URL,
          DISCOVERY_MCP_PUBLIC_KEY,
          'discovery'
        );
        const discoveryTools = await discoveryClient.listTools();
        
        for (const tool of discoveryTools) {
          console.log(chalk.green(`  ${tool.name}`));
          const desc = tool.description || '';
          console.log(chalk.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}`));
        }
      } catch (error) {
        ui.warn('Could not fetch Discovery tools.');
      }
      console.log();
    }

    // Trading MCP tools (requires API key)
    if (showAll || options.trading) {
      const config = getConfigManager();
      if (config.isTradingEnabled()) {
        console.log(chalk.bold.magenta('💰 Trading MCP Tools (wallet & orders)'));
        ui.printDivider();
        
        try {
          const tradingClient = createMCPClient(
            config.getTradingMcpUrl(),
            config.getQuantishApiKey()!,
            'trading'
          );
          const tradingTools = await tradingClient.listTools();
          
          for (const tool of tradingTools) {
            console.log(chalk.magenta(`  ${tool.name}`));
            const desc = tool.description || '';
            console.log(chalk.dim(`    ${desc.slice(0, 80)}${desc.length > 80 ? '...' : ''}`));
          }
        } catch (error) {
          ui.warn('Could not fetch Trading tools. Check your API key.');
        }
        console.log();
      } else {
        console.log(chalk.dim('💰 Trading MCP: Not configured. Run "quantish init" to enable trading.'));
        console.log();
      }
    }
  });

/**
 * Chat command - interactive mode
 */
program
  .command('chat')
  .description('Start interactive chat mode')
  .option('--no-mcp', 'Disable MCP trading tools')
  .option('--no-local', 'Disable local coding tools')
  .action(async (options) => {
    if (!await ensureConfigured()) {
      return;
    }

    await runInteractiveChat({
      enableMCP: options.mcp !== false,
      enableLocal: options.local !== false,
    });
  });

/**
 * Default command (no subcommand) - chat or one-shot
 */
program
  .option('-p, --prompt <message>', 'Send a one-shot prompt')
  .option('-v, --verbose', 'Show tool calls and details')
  .option('--no-mcp', 'Disable MCP trading tools')
  .option('--no-local', 'Disable local coding tools')
  .action(async (options) => {
    // If we have a prompt, run one-shot mode
    if (options.prompt) {
      if (!await ensureConfigured()) {
        return;
      }
      await runOneShotPrompt(options.prompt, {
        verbose: options.verbose,
        enableMCP: options.mcp !== false,
        enableLocal: options.local !== false,
      });
      return;
    }

    // Check if there's piped input
    if (!process.stdin.isTTY) {
      const input = await readStdin();
      if (input) {
        if (!await ensureConfigured()) {
          return;
        }
        await runOneShotPrompt(input, {
          verbose: options.verbose,
          enableMCP: options.mcp !== false,
          enableLocal: options.local !== false,
        });
        return;
      }
    }

    // No prompt and no piped input - start interactive mode
    if (!await ensureConfigured()) {
      return;
    }
    await runInteractiveChat({
      enableMCP: options.mcp !== false,
      enableLocal: options.local !== false,
    });
  });

interface ChatOptions {
  enableMCP?: boolean;
  enableLocal?: boolean;
}

/**
 * Create the MCPClientManager with Discovery (always) and Trading (if configured)
 */
function createMCPManager(options: ChatOptions): MCPClientManager | undefined {
  if (options.enableMCP === false) {
    return undefined;
  }

  const config = getConfigManager();
  
  // Always connect to Discovery MCP (free, embedded key)
  // Optionally connect to Trading MCP if user has a key
  return createMCPClientManager(
    DISCOVERY_MCP_URL,
    DISCOVERY_MCP_PUBLIC_KEY,
    config.isTradingEnabled() ? config.getTradingMcpUrl() : undefined,
    config.getQuantishApiKey()
  );
}

/**
 * Run interactive chat mode using Ink for a persistent UI
 */
async function runInteractiveChat(options: ChatOptions = {}): Promise<void> {
  const config = getConfigManager();

  // Use MCPClientManager for dual MCP support (Discovery + Trading)
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
  });

  // Check if we can use Ink (requires TTY with raw mode support)
  const canUseInk = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

  if (canUseInk) {
    // Print ASCII banner before Ink takes over the terminal
    ui.printHeader();
    
    // Use Ink to render the interactive UI
    const { waitUntilExit } = render(
      React.createElement(App, {
        agent,
        onExit: () => {
          console.log(chalk.dim('Goodbye!'));
        },
      }),
      {
        exitOnCtrlC: false, // We handle Ctrl+C ourselves
      }
    );

    // Wait for the app to exit
    await waitUntilExit();
  } else {
    // Fallback to readline-based approach for non-TTY environments
    await runReadlineChat(agent, mcpClientManager, options);
  }
}

/**
 * Fallback readline-based chat for non-TTY environments
 */
async function runReadlineChat(
  agent: ReturnType<typeof createAgent>,
  mcpClientManager: MCPClientManager | undefined,
  options: ChatOptions
): Promise<void> {
  const readline = await import('readline');
  
  ui.printHeader();
  
  // Show what capabilities are enabled
  const config = getConfigManager();
  const capabilities: string[] = [];
  if (options.enableLocal !== false) capabilities.push('coding');
  if (options.enableMCP !== false) {
    capabilities.push('discovery'); // Always available with embedded key
    if (config.isTradingEnabled()) capabilities.push('trading');
  }
  console.log(chalk.dim(`Capabilities: ${capabilities.join(', ')}`));
  console.log(chalk.dim('Type "exit" to quit, "clear" to reset conversation, "tools" to list tools.'));
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });

  const promptUser = (): void => {
    rl.question(chalk.yellow('You: '), async (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        promptUser();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log(chalk.dim('Goodbye!'));
        rl.close();
        return;
      }

      if (trimmed.toLowerCase() === 'clear') {
        agent.clearHistory();
        console.log(chalk.dim('Conversation cleared.'));
        promptUser();
        return;
      }

      if (trimmed.toLowerCase() === 'tools') {
        console.log(chalk.dim(`\nLocal tools: ${localTools.map(t => t.name).join(', ')}`));
        if (mcpClientManager) {
          try {
            const mcpTools = await mcpClientManager.listAllTools();
            const discoveryTools = mcpTools.filter(t => t.source === 'discovery');
            const tradingTools = mcpTools.filter(t => t.source === 'trading');
            console.log(chalk.dim(`Discovery tools (${discoveryTools.length}): ${discoveryTools.map(t => t.name).join(', ')}`));
            if (tradingTools.length > 0) {
              console.log(chalk.dim(`Trading tools (${tradingTools.length}): ${tradingTools.map(t => t.name).join(', ')}`));
            }
          } catch {
            console.log(chalk.dim('MCP tools: (error fetching)'));
          }
        }
        console.log();
        promptUser();
        return;
      }

      const spin = ui.spinner('Thinking...');
      try {
        spin.start();

        const result = await agent.run(trimmed);

        spin.stop();

        if (result.text) {
          ui.assistant(result.text);
        } else if (result.toolCalls.length > 0) {
          console.log();
          const localCount = result.toolCalls.filter(t => t.source === 'local').length;
          const discoveryCount = result.toolCalls.filter(t => t.source === 'discovery').length;
          const tradingCount = result.toolCalls.filter(t => t.source === 'trading').length;
          const summary = [];
          if (localCount > 0) summary.push(`${localCount} local`);
          if (discoveryCount > 0) summary.push(`${discoveryCount} discovery`);
          if (tradingCount > 0) summary.push(`${tradingCount} trading`);
          console.log(chalk.cyan('Done.') + chalk.dim(` (${summary.join(', ')} tool calls)`));
          console.log();
        }
      } catch (error) {
        spin.stop();
        
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (errorMsg.includes('credit balance is too low')) {
          ui.error('Anthropic API credits exhausted. Please add credits at console.anthropic.com');
        } else if (errorMsg.includes('invalid_api_key') || errorMsg.includes('401')) {
          ui.error('Invalid Anthropic API key. Run "quantish init" to reconfigure.');
        } else if (errorMsg.includes('rate_limit')) {
          ui.error('Rate limited by Anthropic API. Please wait a moment and try again.');
        } else {
          ui.error(`Error: ${errorMsg}`);
        }
        console.log();
      }

      promptUser();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(chalk.dim('\nGoodbye!'));
    rl.close();
    process.exit(0);
  });

  promptUser();
}

interface OneShotOptions {
  verbose?: boolean;
  enableMCP?: boolean;
  enableLocal?: boolean;
}

/**
 * Run a one-shot prompt
 */
async function runOneShotPrompt(message: string, options: OneShotOptions = {}): Promise<void> {
  const config = getConfigManager();

  // Use MCPClientManager for dual MCP support
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
      ui.toolCall(name, args);
    } : undefined,
  });

  const spin = options.verbose ? null : ui.spinner('Processing...');
  try {
    spin?.start();

    const result = await agent.run(message);

    spin?.stop();

    if (result.text) {
      console.log(result.text);
    }
  } catch (error) {
    spin?.stop(); // Stop spinner on error!
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('credit balance is too low')) {
      ui.error('Anthropic API credits exhausted. Please add credits at console.anthropic.com');
    } else if (errorMsg.includes('invalid_api_key') || errorMsg.includes('401')) {
      ui.error('Invalid Anthropic API key. Run "quantish init" to reconfigure.');
    } else if (errorMsg.includes('rate_limit')) {
      ui.error('Rate limited by Anthropic API. Please wait a moment and try again.');
    } else {
      ui.error(`Error: ${errorMsg}`);
    }
    process.exit(1);
  }
}

/**
 * Read from stdin (for piped input)
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
    // Set a timeout in case stdin never ends
    setTimeout(() => {
      resolve(data.trim());
    }, 100);
  });
}

// Run the CLI
program.parse();
