# @quantish/agent

AI-powered coding & trading agent for Polymarket and Kalshi. Build trading bots, analyze markets, and execute trades using natural language.

## ✨ Features

- **🤖 Multi-Provider AI** - Use Anthropic Claude or 100+ OpenRouter models (GLM-4.7, MiniMax, DeepSeek, etc.)
- **💹 Live Trading** - Trade on Polymarket (Polygon) and Kalshi (Solana via DFlow)
- **🔧 Full Coding Tools** - Read/write files, run commands, git operations
- **🌐 Web Search** - Search the web with Exa AI or DuckDuckGo fallback
- **💾 Session Persistence** - Save and resume conversations across sessions
- **⚡ Queued Input** - Type while the agent is working, queue messages
- **📊 Cost Tracking** - Real-time token usage and cost display

## Installation

```bash
npm install -g @quantish/agent
```

## Quick Start

```bash
# First-time setup
quantish init

# Start interactive chat
quantish
```

## How It Works

The agent connects to three MCP (Model Context Protocol) servers:

| MCP | URL | Auth | Purpose |
|-----|-----|------|---------|
| Discovery | `quantish.live/mcp` | Public (embedded key) | Search markets across all platforms |
| Polymarket | `quantish-sdk-production.up.railway.app/mcp` | `QUANTISH_API_KEY` | Trade on Polymarket (Polygon) |
| Kalshi | `kalshi-mcp-production-7c2c.up.railway.app/mcp` | `KALSHI_API_KEY` | Trade on Kalshi (Solana via DFlow) |

**Polymarket** - Managed Polygon wallet:
- ✅ Gasless transactions (Polymarket covers fees)
- ✅ Signs orders using Polymarket's required format  
- ✅ Works globally (no geo-restrictions)
- 🔒 Non-custodial - export your private key anytime

**Kalshi** - Managed Solana wallet via DFlow:
- ✅ Trade on CFTC-regulated Kalshi markets
- ✅ Uses DFlow protocol for on-chain settlement
- ⚡ Small SOL fees (~0.01 SOL per trade)
- 🔒 Non-custodial - export your private key anytime

## Interactive Commands

### Chat Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/clear` | Clear conversation history |
| `/compact` | Summarize conversation to save tokens |
| `/model <name>` | Switch model (opus, sonnet, haiku, glm, minimax, etc.) |
| `/provider <name>` | Switch LLM provider (anthropic, openrouter) |
| `/cost` | Show session cost breakdown |
| `/tools` | List available tools |
| `/config` | Show configuration info |

### Session Commands

| Command | Description |
|---------|-------------|
| `/save [name]` | Save current session |
| `/resume` | Resume last session |
| `/sessions` | List all saved sessions |
| `/load <id>` | Load a session by ID |
| `/forget` | Delete all saved sessions |

### Process Commands

| Command | Description |
|---------|-------------|
| `/processes` | List running background processes |
| `/stop <id>` | Stop a background process |
| `/stopall` | Stop all background processes |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message (or queue if agent is working) |
| `Esc` | Interrupt current generation |
| `Ctrl+C` | Exit CLI |

## CLI Options

```bash
quantish                    # Interactive mode
quantish init               # First-time setup wizard
quantish config             # View configuration
quantish config --export    # Export as .env format
quantish tools              # List all available tools
quantish -p "message"       # One-shot mode
quantish --version          # Show version
```

| Option | Description |
|--------|-------------|
| `-p, --prompt <message>` | Run a single prompt |
| `-v, --verbose` | Show detailed tool calls |
| `--no-mcp` | Disable trading tools |
| `--no-local` | Disable coding tools |

## Available Tools

### Local Tools (Coding)

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line numbers |
| `write_file` | Create or overwrite files |
| `edit_file` | Search and replace in files |
| `edit_lines` | Edit specific line ranges (efficient) |
| `list_dir` | List directory contents |
| `delete_file` | Delete files |
| `file_exists` | Check if file exists |
| `run_command` | Execute shell commands (blocking) |
| `start_background_process` | Run long-running processes |
| `get_process_output` | Get output from background process |
| `stop_process` | Stop a background process |
| `grep` | Search file contents |
| `find_files` | Find files by pattern |
| `setup_env` | Create/update .env files |

### Git Tools

| Tool | Description |
|------|-------------|
| `git_status` | Get repository status |
| `git_diff` | Show changes |
| `git_add` | Stage files |
| `git_commit` | Create commits |
| `git_log` | Show commit history |
| `git_checkout` | Switch branches |

### Web Tools

| Tool | Description |
|------|-------------|
| `web_search` | Search the web (Exa/DuckDuckGo) |
| `web_answer` | AI-powered Q&A (requires Exa API key) |
| `fetch_url` | Fetch URL content |

### MCP Tools - Discovery

| Tool | Description |
|------|-------------|
| `search_markets` | Search markets across Polymarket, Kalshi, Limitless |
| `get_trending_markets` | Get trending/popular markets |
| `get_market_details` | Get market info and prices |
| `get_categories` | List available categories |
| `get_market_stats` | Get platform statistics |

### MCP Tools - Polymarket Trading

| Tool | Description |
|------|-------------|
| `get_balances` | Check USDC and position balances |
| `get_positions` | View current positions |
| `place_order` | Place buy/sell orders |
| `cancel_order` | Cancel open orders |
| `get_orders` | List orders |
| `get_orderbook` | Get market orderbook |
| `get_price` | Get current price |
| `transfer_usdc` | Transfer USDC |
| `claim_winnings` | Claim from resolved markets |
| `export_private_key` | Export wallet private key |

### MCP Tools - Kalshi Trading

| Tool | Description |
|------|-------------|
| `kalshi_signup` | Create new account with Solana wallet |
| `kalshi_search_markets` | Search Kalshi markets |
| `kalshi_get_market` | Get market details by ticker |
| `kalshi_get_events` | Browse market categories |
| `kalshi_get_live_data` | Get live market data |
| `kalshi_get_quote` | Get quote for buy/sell order |
| `kalshi_place_order` | Execute a trade on Solana |
| `kalshi_get_wallet_info` | Get wallet address and balances |
| `kalshi_get_positions` | View Kalshi positions |
| `kalshi_check_market_initialization` | Check if market is tokenized |
| `kalshi_initialize_market` | Initialize market on-chain |
| `kalshi_check_redemption_status` | Check if market can be redeemed |
| `kalshi_export_private_key` | Export Solana private key |

## LLM Providers

### Anthropic (Default for new installs)

Uses Claude models directly via Anthropic API.

```bash
/model opus    # Claude Opus 4.5 - Most capable
/model sonnet  # Claude Sonnet 4.5 - Balanced (default)
/model haiku   # Claude Haiku 4.5 - Fastest/cheapest
```

### OpenRouter

Access 100+ models from various providers.

```bash
/provider openrouter  # Switch to OpenRouter

/model glm      # GLM-4.7 (default for OpenRouter) - Best for coding
/model minimax  # MiniMax M2.1 - Fast and cheap
/model deepseek # DeepSeek V3.2 - Great reasoning
/model gemini   # Gemini 2.0 Flash - Google's latest
/model grok     # Grok 3 Mini Beta - xAI
```

Or use any OpenRouter model ID:
```bash
/model anthropic/claude-3.5-sonnet
/model meta-llama/llama-3.3-70b-instruct
```

## Configuration

Configuration is stored in `~/.quantish/config.json`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `QUANTISH_API_KEY` | Polymarket trading API key |
| `KALSHI_API_KEY` | Kalshi trading API key |
| `EXA_API_KEY` | Exa AI search key (optional) |
| `MCP_SERVER_URL` | Custom Polymarket MCP server URL |
| `KALSHI_MCP_URL` | Custom Kalshi MCP server URL |

### Export Configuration

```bash
quantish config --export > .env
```

## Building Applications

The agent can build standalone applications that use the Quantish MCP API. When building apps, ensure:

1. **Use HTTP API** - Don't use MCP SDK directly
2. **Environment Variables** - Store API keys in `.env`
3. **Three Endpoints**:
   - Discovery: `https://quantish.live/mcp/execute` (public)
   - Polymarket: `https://quantish-sdk-production.up.railway.app/mcp/execute` (requires `QUANTISH_API_KEY`)
   - Kalshi: `https://kalshi-mcp-production-7c2c.up.railway.app/mcp` (requires `KALSHI_API_KEY`)

Example API calls:

```javascript
// Discovery MCP (simple format)
const response = await fetch('https://quantish.live/mcp/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'qm_ueQeqrmvZyHtR1zuVbLYkhx0fKyVAuV8'
  },
  body: JSON.stringify({
    name: 'search_markets',
    arguments: { query: 'bitcoin', limit: 5 }
  })
});

// Polymarket Trading MCP (JSON-RPC format)
const response = await fetch('https://quantish-sdk-production.up.railway.app/mcp/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.QUANTISH_API_KEY
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get_positions', arguments: {} }
  })
});

// Kalshi Trading MCP (JSON-RPC format)
const response = await fetch('https://kalshi-mcp-production-7c2c.up.railway.app/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.KALSHI_API_KEY
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'kalshi_get_positions', arguments: {} }
  })
});
```

## Self-Hosting

You can self-host your own Trading MCP servers for full control over your wallet keys.

### Polymarket Server

```bash
npm install @quantish/server
```

```bash
# Configure CLI to use your server
export MCP_SERVER_URL=https://your-server.com/mcp
```

Resources:
- **NPM**: [@quantish/server](https://www.npmjs.com/package/@quantish/server)
- **GitHub**: [joinQuantish/quantish-server](https://github.com/joinQuantish/quantish-server)
- **Polymarket API**: [docs.polymarket.com](https://docs.polymarket.com)

### Kalshi Server

```bash
npm install @quantish/kalshi-server
```

```bash
# Configure CLI to use your server
export KALSHI_MCP_URL=https://your-kalshi-server.com/mcp
```

Required environment variables for Kalshi server:
- `DATABASE_URL` - PostgreSQL connection string
- `ENCRYPTION_KEY` - 64-char hex string for wallet encryption
- `DFLOW_API_KEY` - DFlow API key
- `SOLANA_RPC_URL` - Solana RPC endpoint

Resources:
- **NPM**: [@quantish/kalshi-server](https://www.npmjs.com/package/@quantish/kalshi-server)
- **GitHub**: [joinQuantish/kalshi-mcp](https://github.com/joinQuantish/kalshi-mcp)
- **DFlow Docs**: [docs.dflow.net](https://docs.dflow.net)

See the [Self-Hosting Guide](https://docs.quantish.live/self-hosting.html) for full deployment instructions.

## Platform Support

| Platform | Support |
|----------|---------|
| macOS | ✅ Full support |
| Linux | ✅ Full support |
| Windows | ⚠️ Requires WSL |

## Examples

```bash
# Search for markets (both Polymarket and Kalshi)
quantish -p "find markets about bitcoin"

# Check Polymarket positions
quantish -p "show my Polymarket positions with P&L"

# Check Kalshi positions
quantish -p "show my Kalshi positions"

# Create a Kalshi account
quantish
> Create a Kalshi account for me

# Trade on Kalshi
quantish
> Buy $10 of YES on the next Fed rate decision market on Kalshi

# Build a trading bot
quantish
> Create a bot that monitors Trump markets and alerts me when prices change more than 5%

# Code review
quantish
> Review my trading bot code and suggest improvements
```

## Troubleshooting

### Tool calls failing with malformed arguments

Some OpenRouter models (like GLM-4.7) occasionally emit malformed tool calls. The CLI includes robust parsing to handle these, but if issues persist:

```bash
/model sonnet  # Switch to Claude Sonnet
```

### Session not resuming

Sessions are stored in `~/.quantish/sessions/`. To reset:

```bash
rm -rf ~/.quantish/sessions
```

### High token usage

```bash
/compact       # Summarize conversation
/model haiku   # Switch to cheaper model
/clear         # Start fresh
```

## Development

```bash
git clone https://github.com/joinQuantish/quantish-agent
cd quantish-agent
npm install
npm run build
npm link  # Install locally
```

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).

**Free for personal use, research, and non-commercial purposes.** Commercial use requires explicit permission from Quantish Inc. Contact hello@quantish.live for commercial licensing.

## Links

- [Agent Website](https://agent.quantish.live)
- [GitHub](https://github.com/joinQuantish/quantish-agent)
- [NPM](https://www.npmjs.com/package/@quantish/agent)
- [Documentation](https://docs.quantish.live)
- [Quantish Platform](https://quantish.live)
