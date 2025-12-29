# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.16] - 2024-12-29

### Added
- **OpenRouter Integration**
  - Full support for OpenRouter as an alternative LLM provider
  - Access to 100+ models including MiniMax M2.1, DeepSeek V3.2, Gemini 3, Grok 4.1, and more
  - New `/provider` command to switch between Anthropic and OpenRouter
  - Automatic provider switching when using OpenRouter model names
  - Token and cost tracking for OpenRouter models
  - OpenAI-compatible tool calling via OpenRouter API

- **New Models Available**
  - MiniMax M2.1 - Ultra cost-effective ($0.30/MTok input) with strong coding/agentic capabilities
  - DeepSeek V3.2 - GPT-5 class reasoning at $0.22/MTok
  - Mistral Devstral 2 - Free tier available for testing
  - Google Gemini 3 Flash/Pro - 1M context window
  - xAI Grok 4.1 Fast - 2M context, best for tool calling
  - Many more via OpenRouter

- **Configuration Updates**
  - `OPENROUTER_API_KEY` environment variable support
  - `/provider anthropic|openrouter` command
  - Enhanced `/model` command shows both Anthropic and OpenRouter models
  - `quantish config` displays provider and OpenRouter key status

### Changed
- Agent loop now uses provider abstraction for cleaner multi-provider support
- `/model` command auto-switches provider when using OpenRouter model IDs
- Config export now includes provider setting

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



