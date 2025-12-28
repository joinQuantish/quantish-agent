/**
 * First-run Setup Wizard
 * 
 * Interactive prompts to configure API keys on first run.
 * 
 * The CLI connects to two MCP servers:
 * - Discovery MCP (quantish.live/mcp) - Free, read-only market search with embedded public key
 * - Trading MCP (quantish-sdk-production.up.railway.app/mcp) - Requires user's own API key
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { getConfigManager, DISCOVERY_MCP_URL, DISCOVERY_MCP_PUBLIC_KEY } from './manager.js';
import { createMCPClient } from '../mcp/index.js';

/**
 * Prompt for user input
 */
async function prompt(question: string, isSecret = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // For secrets, we can't easily hide input in Node.js without external deps
    // Just warn the user
    if (isSecret) {
      console.log(chalk.dim('(Input will be visible)'));
    }
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Print the architecture explanation
 */
function printArchitectureInfo(): void {
  console.log(chalk.bold.yellow('\n📋 How Quantish Works\n'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  
  console.log(chalk.bold('Two Capabilities:'));
  console.log();
  console.log(chalk.cyan('🔍 Market Discovery') + chalk.dim(' (Free, always available)'));
  console.log(chalk.dim('   Search markets across Polymarket, Kalshi, and more'));
  console.log(chalk.dim('   Uses our Discovery MCP with embedded public key'));
  console.log();
  console.log(chalk.magenta('💰 Polymarket Trading') + chalk.dim(' (Optional, your own wallet)'));
  console.log(chalk.dim('   Trade on Polymarket with a managed wallet'));
  console.log(chalk.dim('   Uses the Quantish Signing Server'));
  console.log();

  console.log(chalk.bold('How Trading Works:'));
  console.log(chalk.dim('  1. We create a wallet for you on the Quantish Signing Server'));
  console.log(chalk.dim('  2. Orders are signed and relayed through Polymarket\'s system'));
  console.log(chalk.dim('  3. Gas fees are covered by Polymarket\'s relayer - FREE!'));
  console.log(chalk.dim('  4. You control your wallet via your personal API key\n'));

  console.log(chalk.bold('Security:'));
  console.log(chalk.dim('  • Your wallet is non-custodial - only you can authorize trades'));
  console.log(chalk.dim('  • Export your private key anytime with: ') + chalk.cyan('export_private_key'));
  console.log(chalk.dim('  • Discovery is read-only - it can\'t access your wallet'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
}

/**
 * Run the setup wizard
 */
export async function runSetup(): Promise<boolean> {
  const config = getConfigManager();

  console.log();
  console.log(chalk.bold.yellow('🚀 Welcome to Quantish CLI'));
  console.log(chalk.dim('AI-powered trading agent for Polymarket\n'));

  // Check for existing config
  if (config.isConfigured()) {
    console.log(chalk.yellow('You already have a configuration.'));
    const overwrite = await prompt('Do you want to reconfigure? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log(chalk.dim('Setup cancelled.'));
      return false;
    }
    console.log();
  }

  // Show architecture explanation for new users
  printArchitectureInfo();

  const proceed = await prompt('Press Enter to continue with setup (or "q" to quit): ');
  if (proceed.toLowerCase() === 'q') {
    console.log(chalk.dim('Setup cancelled.'));
    return false;
  }
  console.log();

  // Step 1: Anthropic API Key
  console.log(chalk.bold('Step 1: Anthropic API Key'));
  console.log(chalk.dim('Powers the AI agent. Get yours at https://console.anthropic.com/'));
  
  let anthropicKey = config.getAnthropicApiKey();
  if (anthropicKey) {
    console.log(chalk.dim(`Current: ${anthropicKey.slice(0, 10)}...`));
    const newKey = await prompt('Enter new key (or press Enter to keep current): ', true);
    if (newKey) {
      anthropicKey = newKey;
    }
  } else {
    anthropicKey = await prompt('Enter your Anthropic API key: ', true);
  }

  if (!anthropicKey) {
    console.log(chalk.red('Anthropic API key is required.'));
    return false;
  }

  if (!anthropicKey.startsWith('sk-ant-')) {
    console.log(chalk.yellow('Warning: Key doesn\'t look like an Anthropic key (should start with sk-ant-)'));
  }

  config.setAnthropicApiKey(anthropicKey);
  console.log(chalk.green('✓ Anthropic API key saved\n'));

  // Step 2: Quantish Trading API Key (Optional)
  console.log(chalk.bold('Step 2: Polymarket Trading (Optional)'));
  console.log(chalk.dim('Enable trading on Polymarket with your own managed wallet.'));
  console.log(chalk.dim('Skip this if you only want to search/discover markets.\n'));
  
  let quantishKey = config.getQuantishApiKey();
  let skipTrading = false;
  
  if (quantishKey) {
    console.log(chalk.dim(`Current trading key: ${quantishKey.slice(0, 12)}...`));
    const action = await prompt('Keep current key (Enter), enter new key (n), or disable trading (d): ');
    if (action.toLowerCase() === 'n') {
      quantishKey = await prompt('Enter your Quantish Trading API key: ', true);
    } else if (action.toLowerCase() === 'd') {
      quantishKey = undefined;
      skipTrading = true;
    }
  } else {
    console.log('Options:');
    console.log(chalk.dim('  1. Enter an existing API key'));
    console.log(chalk.dim('  2. Create a new wallet (recommended for new users)'));
    console.log(chalk.dim('  3. Skip trading for now\n'));
    
    const choice = await prompt('Choose (1/2/3): ');
    
    if (choice === '1') {
      quantishKey = await prompt('Enter your Quantish Trading API key: ', true);
    } else if (choice === '2') {
      console.log(chalk.dim('\nCreating a new wallet on Quantish Signing Server...'));
      
      const externalId = await prompt('Enter a unique identifier (e.g., email or username): ');
      if (!externalId) {
        console.log(chalk.red('Identifier is required to create an account.'));
        return false;
      }

      try {
        // Use a temporary MCP client without auth to request an API key
        // The Trading MCP's request_api_key tool is public - no auth required
        const mcpClient = createMCPClient(config.getTradingMcpUrl(), '');
        const result = await mcpClient.callTool('request_api_key', { externalId });
        
        if (result.success && typeof result.data === 'object' && result.data !== null) {
          const data = result.data as Record<string, unknown>;
          quantishKey = data.apiKey as string;
          console.log(chalk.green('\n✓ Wallet created on Quantish Signing Server!'));
          console.log(chalk.dim(`  EOA Address: ${data.eoaAddress}`));
          console.log(chalk.dim('  (Your Safe wallet will be deployed on first trade)\n'));
          
          if (data.apiSecret) {
            console.log(chalk.yellow('⚠️  Save your API secret (shown only once):'));
            console.log(chalk.bold.yellow(`   ${String(data.apiSecret)}`));
            console.log();
          }
        } else {
          console.log(chalk.red('Failed to create account: ' + (result.error || 'Unknown error')));
          console.log(chalk.dim('You can continue without trading - run "quantish init" later to set up.'));
          skipTrading = true;
        }
      } catch (error) {
        console.log(chalk.red('Failed to connect to Quantish Trading Server.'));
        console.log(chalk.dim(String(error)));
        console.log(chalk.dim('You can continue without trading - run "quantish init" later to set up.'));
        skipTrading = true;
      }
    } else {
      skipTrading = true;
    }
  }

  if (quantishKey) {
    config.setQuantishApiKey(quantishKey);
    console.log(chalk.green('✓ Trading API key saved\n'));
  } else if (skipTrading) {
    console.log(chalk.dim('✓ Trading disabled - you can still search markets via Discovery\n'));
  } else {
    console.log(chalk.dim('✓ No trading key - you can still search markets via Discovery\n'));
  }

  // Step 3: Optional Exa API Key
  console.log(chalk.bold('Step 3: Exa API Key (Optional)'));
  console.log(chalk.dim('Powers web search. Get one free at https://dashboard.exa.ai'));
  console.log(chalk.dim('Without this, web search will use DuckDuckGo as fallback.\n'));
  
  const exaKey = await prompt('Enter your Exa API key (or press Enter to skip): ', true);
  if (exaKey) {
    // We don't store this in our config, just tell them to set it as env var
    console.log(chalk.green('✓ Great! Add this to your shell profile:'));
    console.log(chalk.cyan(`   export EXA_API_KEY="${exaKey}"`));
    console.log();
  } else {
    console.log(chalk.dim('Skipped. Web search will use DuckDuckGo.\n'));
  }

  // Step 4: Verify connections
  console.log(chalk.bold('Step 4: Verifying connections...'));
  
  // Always verify Discovery MCP (free, embedded key)
  try {
    const discoveryClient = createMCPClient(DISCOVERY_MCP_URL, DISCOVERY_MCP_PUBLIC_KEY, 'discovery');
    const discoveryResult = await discoveryClient.callTool('get_market_stats', {});
    if (discoveryResult.success) {
      console.log(chalk.green('✓ Discovery MCP connected'));
    } else {
      console.log(chalk.yellow('⚠ Discovery MCP: ' + (discoveryResult.error || 'Unknown error')));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠ Could not verify Discovery MCP'));
    console.log(chalk.dim(String(error)));
  }
  
  // Verify Trading MCP if enabled
  if (quantishKey) {
    try {
      const tradingClient = createMCPClient(config.getTradingMcpUrl(), quantishKey, 'trading');
      const result = await tradingClient.callTool('get_wallet_status', {});
      
      if (result.success && typeof result.data === 'object' && result.data !== null) {
        const data = result.data as Record<string, unknown>;
        console.log(chalk.green('✓ Trading MCP connected'));
        console.log(chalk.dim(`  Safe Address: ${data.safeAddress || 'Not yet deployed'}`));
        console.log(chalk.dim(`  Status: ${data.status}`));
        console.log(chalk.dim(`  Ready to trade: ${data.isReady ? 'Yes' : 'Run setup_wallet first'}`));
      } else {
        console.log(chalk.yellow('⚠ Trading MCP: ' + (result.error || 'Unknown error')));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠ Could not verify Trading MCP connection.'));
      console.log(chalk.dim(String(error)));
    }
  } else {
    console.log(chalk.dim('⏭ Trading MCP skipped (no API key)'));
  }

  // Done!
  console.log();
  console.log(chalk.bold.green('🎉 Setup complete!'));
  console.log();
  
  // Show where credentials are saved
  console.log(chalk.bold('📁 Your credentials are saved:'));
  console.log(chalk.dim(`   Local config: ${config.getConfigPath()}`));
  console.log(chalk.dim('   Wallet keys:  Encrypted on Quantish server (accessible via your API key)'));
  console.log();
  
  console.log('You can now use Quantish CLI:');
  console.log(chalk.yellow('  quantish') + ' - Start interactive chat');
  console.log(chalk.yellow('  quantish -p "check my balance"') + ' - One-shot command');
  console.log(chalk.yellow('  quantish tools') + ' - List available tools');
  console.log(chalk.yellow('  quantish config') + ' - View configuration');
  console.log(chalk.yellow('  quantish config --export') + ' - Export keys for your own agents');
  console.log();
  console.log(chalk.dim('Your wallet is managed by the Quantish Signing Server.'));
  console.log(chalk.dim('The CLOB signing credentials are stored encrypted on the server.'));
  console.log(chalk.dim('To export your private key: quantish -p "export my private key"'));
  console.log();

  return true;
}

/**
 * Check if setup is needed and run if so
 */
export async function ensureConfigured(): Promise<boolean> {
  const config = getConfigManager();
  
  if (!config.isConfigured()) {
    console.log(chalk.yellow('Quantish CLI is not configured yet.'));
    console.log('Run ' + chalk.yellow('quantish init') + ' to set up.\n');
    return false;
  }
  
  return true;
}
