# @quantish/agent

AI-powered coding & trading agent for Polymarket. Build trading bots, analyze markets, and execute trades using natural language.

## ✨ Features

- **🤖 Multi-Provider AI** - Use Anthropic Claude or 100+ OpenRouter models (GLM-4.7, MiniMax, DeepSeek, etc.)
- **💹 Live Trading** - Place orders, manage positions, check balances on Polymarket
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

The agent connects to two MCP (Model Context Protocol) servers:

1. **Discovery MCP** (Public) - Market search, trending markets, market details
2. **Trading MCP** (Your API Key) - Wallet, orders, positions, trades

Your wallet is created and managed through our signing server, which:
- ✅ Handles gasless transactions (Polymarket covers fees)
- ✅ Signs orders using Polymarket's required format  
- ✅ Works globally (no geo-restrictions)
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

### MCP Tools (Trading)

| Tool | Server | Description |
|------|--------|-------------|
| `search_markets` | Discovery | Search markets by query |
| `get_trending_markets` | Discovery | Get trending/popular markets |
| `get_market_details` | Discovery | Get market info and prices |
| `get_balances` | Trading | Check wallet balances |
| `get_positions` | Trading | View current positions |
| `place_order` | Trading | Place buy/sell orders |
| `cancel_order` | Trading | Cancel open orders |
| `get_orders` | Trading | List orders |
| `get_orderbook` | Trading | Get market orderbook |
| `get_price` | Trading | Get current price |
| `transfer_usdc` | Trading | Transfer USDC |
| `claim_winnings` | Trading | Claim from resolved markets |
| `export_private_key` | Trading | Export wallet private key |

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
| `QUANTISH_API_KEY` | Quantish trading API key |
| `EXA_API_KEY` | Exa AI search key (optional) |
| `MCP_SERVER_URL` | Custom Trading MCP server URL |

### Export Configuration

```bash
quantish config --export > .env
```

## Building Applications

The agent can build standalone applications that use the Quantish MCP API. When building apps, ensure:

1. **Use HTTP API** - Don't use MCP SDK directly
2. **Environment Variables** - Store API keys in `.env`
3. **Two Endpoints**:
   - Discovery: `https://quantish.live/mcp/execute` (public)
   - Trading: `https://quantish-sdk-production.up.railway.app/mcp/execute` (requires API key)

Example API call:

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

// Trading MCP (JSON-RPC format)
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
    params: {
      name: 'get_positions',
      arguments: {}
    }
  })
});
```

## Self-Hosting

You can self-host your own Trading MCP server for full control over your wallet keys.

### Install the Server

```bash
npm install @quantish/server
```

### Configure the CLI

```bash
# Set custom server URL
quantish config --server https://your-server.com/mcp

# Or use environment variable
export MCP_SERVER_URL=https://your-server.com/mcp
```

### Resources

- **NPM Package**: [@quantish/server](https://www.npmjs.com/package/@quantish/server)
- **GitHub**: [joinQuantish/quantish-server](https://github.com/joinQuantish/quantish-server)
- **Polymarket API**: [docs.polymarket.com](https://docs.polymarket.com)

See the [Self-Hosting Guide](https://docs.quantish.live/self-hosting.html) for full deployment instructions.

## Platform Support

| Platform | Support |
|----------|---------|
| macOS | ✅ Full support |
| Linux | ✅ Full support |
| Windows | ⚠️ Requires WSL |

## Examples

```bash
# Search for markets
quantish -p "find markets about bitcoin"

# Check positions
quantish -p "show my positions with P&L"

# Build a trading bot
quantish
> Create a bot that monitors Trump markets and alerts me when prices change more than 5%

# Start a dev server
quantish
> Start my React app on port 3001

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
