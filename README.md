# @quantish/cli

AI-powered CLI agent for building trading bots on Polymarket.

Combines **coding tools** (file system, shell, git) with **trading tools** (Polymarket orders, positions, wallet) powered by Claude AI.

## How It Works

Quantish CLI connects to the **Quantish Signing Server** to execute trades on Polymarket. Here's why:

### Why We Use a Signing Server

Polymarket uses a **gasless relayer system** - this means:
- ✅ **Free wallet creation** - No MATIC needed to set up
- ✅ **Free trading** - Polymarket covers gas fees on all transactions
- ✅ **Simplified signing** - Our server handles the complex signature formats

To make this work reliably, the Quantish Signing Server:
1. **Handles wallet creation** - Your wallet is created and managed through our server
2. **Signs transactions** - Orders are signed using Polymarket's required format
3. **Relays to Polymarket** - Transactions go through Polymarket's official relayer
4. **Bypasses geo-restrictions** - Our server is hosted in a compatible region

### What This Means for You

- **Your funds are secure** - Only you can authorize transactions via your API key
- **Wallets are non-custodial** - You can export your private key anytime with `export_private_key`
- **Trading is free** - No gas fees, ever
- **It just works** - No VPN or complex setup needed

> 🔒 **Security Note**: Your private keys are stored encrypted. You can export them and migrate to a self-hosted solution in the future if needed.

## Installation

```bash
npm install -g @quantish/cli
```

Or run directly with npx:

```bash
npx @quantish/cli
```

## Quick Start

### 1. Initialize

Set up your API keys:

```bash
quantish init
```

You'll need:
- **Anthropic API Key** - Get one at https://console.anthropic.com/
- **Quantish API Key** - Created automatically during setup

### 2. Start Building

**Interactive mode:**

```bash
quantish
```

Example conversations:

```
You: Create a trading bot that monitors my positions and sells when profit > 20%
Assistant: I'll create that for you. Let me first check your current positions...
[Calling get_positions...]
[Writing bot.ts...]

You: What's my current balance?
Assistant: Your Safe wallet has 0.68 USDC available for trading.

You: Place a $5 YES order on Trump winning at 55 cents
Assistant: Order placed! Order ID: abc123...
```

**One-shot mode:**

```bash
quantish -p "check my open orders"
```

**Piped input:**

```bash
echo "show my positions" | quantish
```

## Commands

| Command | Description |
|---------|-------------|
| `quantish` | Start interactive chat |
| `quantish init` | Configure API keys |
| `quantish config` | View configuration |
| `quantish tools` | List available tools |
| `quantish -p "..."` | Run one-shot prompt |

## Options

| Option | Description |
|--------|-------------|
| `-p, --prompt <message>` | Run a single prompt |
| `-v, --verbose` | Show tool calls |
| `--no-mcp` | Disable trading tools |
| `--no-local` | Disable coding tools |
| `--version` | Show version |
| `--help` | Show help |

## Available Tools

### Local Tools (Coding)

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `list_dir` | List directory contents |
| `delete_file` | Delete files |
| `file_exists` | Check if file exists |
| `run_command` | Execute shell commands |
| `grep` | Search file contents |
| `find_files` | Find files by pattern |
| `git_status` | Get git status |
| `git_diff` | Show git diff |
| `git_add` | Stage files |
| `git_commit` | Create commits |
| `git_log` | Show commit history |
| `git_checkout` | Switch branches |
| `web_search` | Search the web (Exa/DuckDuckGo) |
| `web_answer` | AI-powered Q&A (Exa) |
| `fetch_url` | Fetch URL content |

### MCP Tools (Trading)

| Tool | Description |
|------|-------------|
| `get_balances` | Check wallet balances |
| `get_positions` | View current positions |
| `place_order` | Place buy/sell orders |
| `cancel_order` | Cancel open orders |
| `get_orders` | List orders |
| `get_orderbook` | Get market orderbook |
| `get_price` | Get current price |
| `transfer_usdc` | Transfer USDC |
| `swap_tokens` | Swap tokens |
| `claim_winnings` | Claim from resolved markets |

## Configuration

Configuration is stored in `~/.quantish/config.json`:

```json
{
  "anthropicApiKey": "sk-ant-...",
  "quantishApiKey": "pk_live_...",
  "mcpServerUrl": "https://quantish-sdk-production.up.railway.app/mcp"
}
```

Environment variables take precedence:
- `ANTHROPIC_API_KEY`
- `QUANTISH_API_KEY`

## Examples

### Build a Trading Bot

```bash
quantish
> Create a Python script that monitors the Trump market and alerts me when price drops below 40 cents
```

### Manage Positions

```bash
quantish -p "show me my positions with unrealized P&L"
```

### Market Making

```bash
quantish
> Help me set up a basic market making strategy. I want to place both bid and ask orders around the current mid price.
```

### Code Review

```bash
quantish
> Read my trading bot code in bot.ts and suggest improvements
```

## Development

```bash
# Clone the repo
git clone https://github.com/quantish/cli

# Install dependencies
cd packages/quantish-cli
npm install

# Build
npm run build

# Run locally
npm start

# Development mode (watch)
npm run dev
```

## Architecture

```
quantish (CLI)
    │
    ├── Local Tools (filesystem, shell, git)
    │   └── Runs directly on your machine
    │
    └── MCP Tools (trading)
        └── Calls Quantish MCP Server
            └── Executes on Polymarket
```

The agent uses Claude to understand your requests and decide which tools to use. It can combine coding and trading tools in a single conversation.

## Platform Support

| Platform | Support |
|----------|---------|
| macOS | ✅ Full support |
| Linux | ✅ Full support |
| Windows | ⚠️ Requires WSL |

**Windows users:** Install [WSL (Windows Subsystem for Linux)](https://learn.microsoft.com/en-us/windows/wsl/install) and run Quantish from within WSL. Native Windows (PowerShell/cmd.exe) is not supported.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required) |
| `QUANTISH_API_KEY` | Your Quantish trading API key |
| `EXA_API_KEY` | Optional: Exa AI search key for powerful web search |

### Web Search

Web search works without API keys (using DuckDuckGo fallback), but **Exa is strongly recommended** for AI-quality search results.

Get your Exa API key at: https://dashboard.exa.ai

Exa is the same search engine used by Cursor, Notion, Vercel, and other leading AI products.

## License

MIT
