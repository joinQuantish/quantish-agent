# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.45] - 2024-12-30

### Fixed
- **Agent now displays prices in market tables**: Updated system prompt to explicitly instruct agent to include outcome prices (Yes/No probabilities) when presenting search results
- Response data includes prices but agent wasn't showing them - now fixed via prompt guidance

## [0.1.44] - 2024-12-30

### Added
- **AbortSignal Support**: Escape key now properly cancels agent execution mid-loop
  - New `abortSignal` option in `agent.run()` for programmatic cancellation
  - Checks abort status at each iteration and during tool execution
  
- **Tool Call Loop Detection**: Prevents agent from getting stuck in loops
  - Detects when the same tool is called 3+ times with identical input
  - Automatically stops loop and returns helpful error message
  
- **maxTurns Config Option**: Limit total agent turns per request (defaults to 15/200)

### Fixed
- Escape key interrupt now works immediately during agent processing
- Agent no longer repeats failed tool calls indefinitely

## [0.1.42] - 2024-12-30

### Fixed
- **Reduced Excessive Tool Calls**: Rewrote system prompt to prevent agent from making dozens of redundant tool calls
  - Agent now makes ONE search call and immediately presents results
  - No longer calls `get_market_details` on every single search result
  - No longer makes parallel searches with slight query variations

### Added
- **Preserved App/Bot Building**: Re-added detailed coding tools documentation
  - Background process management (start_background_process, get_process_output, stop_process)
  - Git operations (status, diff, add, commit)
  - API endpoint documentation for building standalone apps
  - Clear guidance for when user wants to build trading bots

## [0.1.40] - 2024-12-30

### Fixed
- **Discovery MCP Search Priority**: Fixed `search_markets` returning limited results by ensuring Discovery MCP's cross-platform semantic search tools take precedence over Trading MCP's Polymarket-only search
  - `search_markets`, `get_trending_markets`, `get_market_details`, `get_categories`, `get_market_stats`, `get_search_status`, and `find_arbitrage` now always use Discovery MCP
  - This enables searching across Polymarket, Kalshi, and Limitless with semantic/hybrid search
  - Trading MCP search tools are no longer accidentally overwriting Discovery tools

## [0.1.15] - 2024-12-29

### Added
- **`edit_lines` Tool**: New line-targeted editing tool that uses line numbers instead of full string matching
  - Much more token-efficient: sends `start_line`, `end_line`, `new_content` instead of full `old_string`
  - Agent guided to prefer `edit_lines` over `edit_file` when line numbers are known

### Changed
- Tool descriptions updated to guide agent toward more efficient editing patterns

## [0.1.14] - 2024-12-29

### Changed
- **Unlimited Tool Calling Loop**: Removed arbitrary 15-iteration limit; agent now runs until LLM stops (safety cap at 200)
- **Clearer API Response Docs**: System prompt now includes detailed field paths for both `search_markets` and `get_market_details` responses
- **Streamlined System Prompt**: Further reduced prompt size while adding critical response structure documentation

### Fixed
- Agent no longer stops mid-task due to iteration limit
- Agent now correctly maps response fields (id, marketId, outcomes, clobTokenIds, conditionId)

## [0.1.7] - 2024-12-28

### Added
- **Self-Hosting Support**
  - `quantish config --server <url>` command to set custom Trading MCP server URL
  - `MCP_SERVER_URL` environment variable support (takes precedence)
  - New self-hosting documentation page

- **Application Building Improvements**
  - Enhanced system prompt with complete MCP HTTP API documentation
  - Separate instructions for Trading API (JSON-RPC 2.0) vs Discovery API (simple format)
  - `setup_env` tool for managing `.env` files in generated applications
  - Strict code generation rules preventing hardcoded values
  - Explicit warning against using MCP SDK in standalone apps

- **UI Improvements**
  - Better real-time feedback during tool execution (spinner + "Running...")
  - Escape key now properly interrupts ongoing agent operations

- **Documentation**
  - Updated README with correct `@quantish/agent` package name
  - Complete MCP HTTP API documentation with code examples
  - Self-hosting guide with deployment options
  - Fixed navigation links throughout docs site

### Fixed
- Discovery API now uses correct simple `{name, arguments}` format instead of JSON-RPC
- AbortSignal properly passed to Anthropic API calls for interrupt handling
- Tool call UI now shows pending state before execution completes

## [0.1.0] - 2024-12-28

### Added
- **AI Agent Core**
  - Claude-powered agent with streaming responses
  - Extended thinking support
  - Multi-turn conversation with context management
  
- **Model Selection**
  - Support for Claude Opus 4.5, Sonnet 4.5, and Haiku 4.5
  - `/model` command to switch models on the fly
  - Real-time cost tracking with actual Anthropic pricing

- **Local Tools (Coding)**
  - File system operations: read, write, delete, list
  - Shell command execution with background process support
  - Git integration: status, diff, add, commit, log, checkout
  - Web search via Exa AI with DuckDuckGo fallback
  - URL fetching and content extraction

- **MCP Tools (Trading)**
  - Polymarket trading via Quantish MCP server
  - Wallet management: balances, deposits, transfers
  - Order management: place, cancel, list orders
  - Position tracking and P&L monitoring
  - Market discovery via Quantish Discovery MCP

- **Interactive UI**
  - Terminal UI built with Ink (React for CLI)
  - Real-time streaming of responses
  - Tool call visualization with results
  - Token usage display with cost tracking
  - Slash commands for quick actions

- **Context Management**
  - Smart truncation of tool results (preserves actionable data)
  - Conversation compaction via `/compact`
  - Prompt caching for cost optimization
  - Token counting and usage display

- **Process Management**
  - Background process execution
  - Process tracking and output capture
  - `/processes`, `/stop`, `/stopall` commands
  - Clean shutdown on Ctrl+C

- **Configuration**
  - Interactive setup via `quantish init`
  - Wallet creation with Quantish Signing Server
  - Environment variable support
  - Config export for bot integration

### Platform Support
- ✅ macOS (full support)
- ✅ Linux (full support)
- ⚠️ Windows (requires WSL)

## [Unreleased]

### Planned
- Memory persistence across sessions
- Custom tool definitions
- Multi-agent orchestration
- Automated trading strategies

