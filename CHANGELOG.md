# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

