# @quantish/agent

AI-powered CLI agent for building trading bots and applications on Polymarket.

Combines **coding tools** (file system, shell, git) with **trading tools** (Polymarket orders, positions, wallet) powered by Claude AI.

## Installation

```bash
npm install -g @quantish/agent
```

Or run directly with npx:

```bash
npx @quantish/agent
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
You: Create a trading bot that monitors Bitcoin markets and alerts on price changes
Assistant: I'll create that for you. Let me first search for Bitcoin markets...
[Calling search_markets...]
[Writing bitcoin-monitor.js...]

You: What's my current balance?
Assistant: Your Safe wallet has 125.50 USDC available for trading.

You: Place a $10 YES order on Trump winning at 55 cents
Assistant: Order placed! Order ID: abc123...
```

**One-shot mode:**

```bash
quantish -p "check my open orders"
```

## Commands

| Command | Description |
|---------|-------------|
| `quantish` | Start interactive chat |
| `quantish init` | Configure API keys |
| `quantish config` | View configuration |
| `quantish config --server <url>` | Set custom MCP server URL |
| `quantish config --export` | Export keys for standalone apps |
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

## Building Standalone Applications

The real power of Quantish is building standalone applications that interact with prediction markets. The agent can create trading bots, web dashboards, notification systems, and more.

### MCP API Overview

There are two MCP endpoints:

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| Trading API | Wallet, orders, positions | Yes (QUANTISH_API_KEY) |
| Discovery API | Search markets, prices | No (public key) |

### Trading API (Requires Your API Key)

```javascript
const response = await fetch('https://quantish-sdk-production.up.railway.app/mcp/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.QUANTISH_API_KEY
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: 'get_balances', arguments: {} },
    id: Date.now()
  })
});

const data = await response.json();
const result = JSON.parse(data.result.content[0].text);
```

**Trading Tools:** `get_balances`, `get_positions`, `place_order`, `cancel_order`, `get_orders`, `get_orderbook`, `get_price`, `transfer_usdc`

### Discovery API (Free, No Auth)

```javascript
const response = await fetch('https://quantish.live/mcp/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8'  // Public key
  },
  body: JSON.stringify({
    name: 'search_markets',           // Simple format for Discovery
    arguments: { query: 'bitcoin', limit: 5 }
  })
});

const data = await response.json();
const result = JSON.parse(data.result.content[0].text);
```

**Discovery Tools:** `search_markets`, `get_market_details`, `get_trending_markets`, `find_arbitrage`

### Example: Ask the Agent to Build an App

```bash
quantish
> Create a Node.js script that monitors Bitcoin markets and sends a Discord notification when prices move more than 10%
```

The agent will create all necessary files:
- Main application code with MCP helper functions
- `package.json` with dependencies
- `.env.example` with required environment variables
- `README.md` with setup instructions

## Architecture

```
quantish (CLI)
    │
    ├── Local Tools (filesystem, shell, git)
    │   └── Runs directly on your machine
    │
    └── MCP Tools (trading + discovery)
        ├── Trading MCP (your wallet, orders)
        │   └── https://quantish-sdk-production.up.railway.app/mcp
        │
        └── Discovery MCP (public market data)
            └── https://quantish.live/mcp
```

## Self-Hosting

You can run your own Trading MCP server for full control over your wallet keys.

### Configure Custom Server

```bash
# Set via CLI
quantish config --server https://your-server.com/mcp

# Or via environment variable
export MCP_SERVER_URL=https://your-server.com/mcp
```

### What You Need

1. **Server**: Deploy the `quantish-server` to Railway, Render, or your own VPS
2. **Database**: PostgreSQL for user data and encrypted keys
3. **Polymarket Builder Credentials**: Apply at https://polymarket.com/builder

See [Self-Hosting Guide](https://quantish.live/docs/self-hosting.html) for full instructions.

## Configuration

Configuration is stored in `~/.quantish/config.json`:

```json
{
  "anthropicApiKey": "sk-ant-...",
  "quantishApiKey": "qtsh_...",
  "mcpServerUrl": "https://quantish-sdk-production.up.railway.app/mcp",
  "model": "claude-sonnet-4-5-20250929"
}
```

Environment variables take precedence:
- `ANTHROPIC_API_KEY`
- `QUANTISH_API_KEY`
- `MCP_SERVER_URL`

## Available Tools

### Local Tools (Coding)

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `edit_file` | Search and replace in files |
| `list_dir` | List directory contents |
| `delete_file` | Delete files |
| `setup_env` | Create/update .env files |
| `run_command` | Execute shell commands |
| `grep` | Search file contents |
| `find_files` | Find files by pattern |
| `git_status` | Get git status |
| `git_diff` | Show git diff |
| `git_add` | Stage files |
| `git_commit` | Create commits |

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

### MCP Tools (Discovery)

| Tool | Description |
|------|-------------|
| `search_markets` | Search markets by keyword |
| `get_market_details` | Get full market info |
| `get_trending_markets` | Popular markets |
| `find_arbitrage` | Find price discrepancies |

## Platform Support

| Platform | Support |
|----------|---------|
| macOS | ✅ Full support |
| Linux | ✅ Full support |
| Windows | ⚠️ Requires WSL |

**Windows users:** Install [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) and run Quantish from within WSL.

## How It Works

Quantish CLI connects to the **Quantish Signing Server** to execute trades on Polymarket:

- **Your funds are secure** - Only you can authorize transactions via your API key
- **Wallets are non-custodial** - Export your private key anytime with `export_private_key`
- **Trading is free** - No gas fees (Polymarket covers them)
- **Self-hosting available** - Run your own server for full control

## License

MIT
