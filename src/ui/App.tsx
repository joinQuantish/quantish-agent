import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { Agent, ToolCall, TokenUsage } from '../agent/loop.js';
import { processManager, ProcessInfo } from '../tools/index.js';
import { listModels, getModelConfig, formatCost } from '../agent/pricing.js';
import { listOpenRouterModels, getOpenRouterModelConfig } from '../agent/openrouter.js';
import { getSessionManager } from '../config/sessions.js';

// Format token count for display (e.g., 12345 -> "12.3k")
function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 100000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

// Get color for token count based on thresholds
function getTokenColor(count: number): string {
  if (count < 50000) return 'green';
  if (count < 100000) return 'yellow';
  return 'red';
}

interface ToolCallDisplay {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  pending: boolean;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCallDisplay[];
  isStreaming?: boolean;
}

interface AppProps {
  agent: Agent;
  onExit?: () => void;
}

// Slash commands with descriptions for preview
const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/compact', desc: 'Summarize conversation to save tokens' },
  { cmd: '/model', desc: 'Switch model (opus, sonnet, haiku, minimax, etc.)' },
  { cmd: '/provider', desc: 'Switch LLM provider (anthropic, openrouter)' },
  { cmd: '/cost', desc: 'Show session cost breakdown' },
  { cmd: '/tools', desc: 'List available tools' },
  { cmd: '/config', desc: 'Show configuration info' },
  { cmd: '/processes', desc: 'List running background processes' },
  { cmd: '/stop', desc: 'Stop a background process by ID' },
  { cmd: '/stopall', desc: 'Stop all background processes' },
  { cmd: '/exit', desc: 'Exit the CLI' },
];

// Format tool arguments for display
function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '()';
  
  const formatted = entries.map(([key, value]) => {
    if (typeof value === 'string') {
      // Truncate long strings
      const str = value.length > 50 ? value.slice(0, 50) + '...' : value;
      return `${key}: "${str}"`;
    }
    if (typeof value === 'object') {
      return `${key}: {...}`;
    }
    return `${key}: ${String(value)}`;
  });
  
  return `(${formatted.join(', ')})`;
}

// Format tool result for display
function formatResult(result: unknown, maxLength = 200): string {
  if (result === null || result === undefined) return 'null';
  
  if (typeof result === 'string') {
    return result.length > maxLength ? result.slice(0, maxLength) + '...' : result;
  }
  
  if (typeof result === 'object') {
    const str = JSON.stringify(result, null, 2);
    return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
  }
  
  return String(result);
}

// Filter out model-specific markers from text (GLM 4.7, etc.)
function cleanModelOutput(text: string): string {
  if (!text) return text;
  return text
    .replace(/<tool_call>/g, '')
    .replace(/<\/tool_call>/g, '')
    .replace(/<arg_key>/g, '')
    .replace(/<\/arg_key>/g, '')
    .replace(/<function_call>/g, '')
    .replace(/<\/function_call>/g, '')
    .trim();
}

export function App({ agent, onExit }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallDisplay[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
    sessionCost: 0,
  });
  
  // Track completed tool calls for final message
  const completedToolCalls = useRef<ToolCall[]>([]);
  
  // AbortController for interrupting requests
  const abortController = useRef<AbortController | null>(null);
  
  // Queued input - allows user to type while agent is processing
  const [queuedInput, setQueuedInput] = useState<string>('');
  const [hasQueuedMessage, setHasQueuedMessage] = useState(false);
  
  // Session manager for persistence
  const sessionManager = useMemo(() => getSessionManager(), []);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Handle slash commands
  const handleSlashCommand = useCallback((command: string): boolean => {
    const cmd = command.slice(1).toLowerCase().split(' ')[0];
    const args = command.slice(cmd.length + 2).trim();
    
    switch (cmd) {
      case 'help':
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `📚 Available Commands:
/clear      - Clear conversation history
/compact    - Summarize conversation (keeps context, saves tokens)
/model      - Switch model (opus, sonnet, haiku, minimax, etc.)
/provider   - Switch LLM provider (anthropic, openrouter)
/cost       - Show session cost breakdown
/help       - Show this help message
/tools      - List available tools
/config     - Show configuration info

🗂️ Session Commands:
/save [name] - Save current session
/resume      - Resume last session
/sessions    - List saved sessions
/load <id>   - Load a saved session
/forget      - Delete all saved sessions

📋 Process Commands:
/processes  - List running background processes
/stop <id>  - Stop a background process by ID
/stopall    - Stop all background processes

/exit       - Exit the CLI

⌨️ Keyboard Shortcuts:
Esc         - Interrupt current generation (or send queued message)
Enter       - Queue message while agent is working
Ctrl+C      - Exit (stops all processes)

💡 Tip: You can type while the agent is working. Press Enter to queue
        your message. Press Esc to interrupt and send immediately.`
        }]);
        return true;
        
      case 'clear':
        agent.clearHistory();
        agent.resetTokenUsage();
        setMessages([]);
        setCurrentToolCalls([]);
        setStreamingText('');
        setError(null);
        setTokenUsage({ 
          inputTokens: 0, 
          outputTokens: 0, 
          cacheCreationInputTokens: 0, 
          cacheReadInputTokens: 0, 
          totalTokens: 0,
          cost: { inputCost: 0, outputCost: 0, cacheWriteCost: 0, cacheReadCost: 0, totalCost: 0 },
          sessionCost: 0,
        });
        setMessages([{ role: 'system', content: '✨ Conversation cleared.' }]);
        return true;
        
      case 'compact':
        // Start compaction asynchronously
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: '🗜️ Compacting conversation...'
        }]);
        setIsProcessing(true);
        
        agent.compactHistory().then(result => {
          if (result.success) {
            const savedTokens = result.originalTokenCount - result.newTokenCount;
            const savedPercent = result.originalTokenCount > 0 
              ? Math.round((savedTokens / result.originalTokenCount) * 100) 
              : 0;
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: `✅ Compaction complete!\n   Before: ${formatTokenCount(result.originalTokenCount)} tokens\n   After: ${formatTokenCount(result.newTokenCount)} tokens\n   Saved: ${formatTokenCount(savedTokens)} tokens (${savedPercent}%)`
            }]);
          } else {
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: `❌ Compaction failed: ${result.error || 'Unknown error'}`
            }]);
          }
          setIsProcessing(false);
        }).catch(err => {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Compaction error: ${err.message || String(err)}`
          }]);
          setIsProcessing(false);
        });
        return true;
        
      case 'tools':
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: '🔧 Run "quantish tools" in your terminal to see all available tools.'
        }]);
        return true;
        
      case 'config':
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: '⚙️ Run "quantish config" to view/export your configuration.\n   "quantish config --export" exports as .env format for your bots.'
        }]);
        return true;
      
      case 'processes':
      case 'ps':
        const processes = processManager.listRunning();
        if (processes.length === 0) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: '📋 No background processes running.'
          }]);
        } else {
          const processLines = processes.map(p => {
            const uptime = Math.round((Date.now() - p.startedAt.getTime()) / 1000);
            return `  [${p.id}] ${p.name} (PID: ${p.pid}) - ${uptime}s`;
          }).join('\n');
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `📋 Running processes:\n${processLines}\n\nUse /stop <id> to stop a process.`
          }]);
        }
        return true;
      
      case 'stop':
        if (!args) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: '❓ Usage: /stop <process_id>\n   Use /processes to see running processes.'
          }]);
          return true;
        }
        const processId = parseInt(args, 10);
        if (isNaN(processId)) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Invalid process ID: ${args}. Must be a number.`
          }]);
          return true;
        }
        const processToStop = processManager.get(processId);
        if (!processToStop) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Process ${processId} not found.`
          }]);
          return true;
        }
        if (processManager.kill(processId)) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `✅ Stopped process "${processToStop.name}" (ID: ${processId})`
          }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Failed to stop process ${processId}`
          }]);
        }
        return true;
      
      case 'stopall':
        const runningCount = processManager.runningCount();
        if (runningCount === 0) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: '📋 No background processes to stop.'
          }]);
        } else {
          processManager.killAll();
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `✅ Stopped ${runningCount} background process${runningCount > 1 ? 'es' : ''}.`
          }]);
        }
        return true;
        
      case 'model':
        if (!args) {
          // Show current model and available options
          const currentModel = agent.getModel();
          const currentProvider = agent.getProvider();
          const modelConfig = getModelConfig(currentModel);
          const orModelConfig = getOpenRouterModelConfig(currentModel);
          const displayName = modelConfig?.displayName || orModelConfig?.displayName || currentModel;
          
          // Anthropic models
          const anthropicModels = listModels();
          const anthropicList = anthropicModels.map(m => {
            const isCurrent = m.id === currentModel ? ' (current)' : '';
            return `  ${m.name}${isCurrent} - ${m.description}`;
          }).join('\n');
          
          // OpenRouter models (show a selection)
          const orModels = listOpenRouterModels().slice(0, 8);
          const orList = orModels.map(m => {
            const isCurrent = m.id === currentModel ? ' (current)' : '';
            return `  ${m.name}${isCurrent} - ${m.description.slice(0, 50)}...`;
          }).join('\n');
          
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `🤖 Current: ${displayName} (${currentProvider})

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
          // Check both Anthropic and OpenRouter configs for description
          const anthropicConfig = getModelConfig(agent.getModel());
          const orConfig = getOpenRouterModelConfig(agent.getModel());
          const description = anthropicConfig?.description || orConfig?.description || '';
          const providerInfo = agent.isOpenRouter() ? ' (OpenRouter)' : ' (Anthropic)';
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `✅ Switched to ${result.model}${providerInfo}\n   ${description}`
          }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ ${result.error}`
          }]);
        }
        return true;

      case 'provider':
        if (!args) {
          const currentProvider = agent.getProvider();
          setMessages(prev => [...prev, {
            role: 'system',
            content: `🔧 LLM Provider

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
        if (providerArg !== 'anthropic' && providerArg !== 'openrouter') {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Unknown provider: "${args}". Use: anthropic, openrouter`
          }]);
          return true;
        }
        
        agent.setProvider(providerArg as 'anthropic' | 'openrouter');
        const providerModels = providerArg === 'openrouter' 
          ? 'minimax, deepseek, gemini, grok, devstral'
          : 'opus, sonnet, haiku';
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `✅ Switched to ${providerArg} provider\n   Available models: ${providerModels}\n   Use /model to select a model.`
        }]);
        return true;

      case 'cost':
        const usage = agent.getTokenUsage();
        const sessionCost = agent.getSessionCost();
        const costBreakdown = usage.cost;
        
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `💰 Session Cost: ${formatCost(sessionCost)}

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
  
💡 Tip: Use /model haiku for cheaper operations, /compact to reduce context.`
        }]);
        return true;

      case 'save':
        // Save current session
        try {
          const conversationHistory = agent.getConversationHistory();
          if (conversationHistory.length === 0) {
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: '❌ Nothing to save - conversation is empty.'
            }]);
            return true;
          }
          const savedSession = sessionManager.saveSession(
            conversationHistory,
            agent.getModel(),
            agent.getProvider(),
            args || undefined,
            currentSessionId || undefined
          );
          setCurrentSessionId(savedSession.id);
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `✅ Session saved: "${savedSession.name}"\n   ID: ${savedSession.id}\n   Messages: ${conversationHistory.length}`
          }]);
        } catch (err) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Failed to save session: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      
      case 'resume':
        // Resume last session
        try {
          const lastSession = sessionManager.getLastSession();
          if (!lastSession) {
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: '❌ No previous session to resume.'
            }]);
            return true;
          }
          // Restore conversation
          agent.setConversationHistory(lastSession.messages);
          agent.setModel(lastSession.model);
          if (lastSession.provider) {
            agent.setProvider(lastSession.provider);
          }
          setCurrentSessionId(lastSession.id);
          setMessages([{ 
            role: 'system', 
            content: `✅ Resumed session: "${lastSession.name}"\n   ${lastSession.messages.length} messages loaded\n   Model: ${lastSession.model} (${lastSession.provider})`
          }]);
        } catch (err) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Failed to resume session: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      
      case 'sessions':
        // List all sessions
        try {
          const sessions = sessionManager.listSessions();
          if (sessions.length === 0) {
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: '📋 No saved sessions.'
            }]);
            return true;
          }
          const sessionList = sessions.slice(0, 10).map((s, i) => {
            const isCurrent = s.id === currentSessionId ? ' (current)' : '';
            const date = new Date(s.updatedAt).toLocaleDateString();
            return `  ${i + 1}. ${s.name}${isCurrent}\n     ID: ${s.id} | ${s.messageCount} msgs | ${date}`;
          }).join('\n\n');
          
          const moreText = sessions.length > 10 ? `\n\n... and ${sessions.length - 10} more` : '';
          
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `🗂️ Saved Sessions:\n\n${sessionList}${moreText}\n\nUse /load <id> to load a session.`
          }]);
        } catch (err) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      
      case 'load':
        // Load a session by ID or name
        if (!args) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: '❓ Usage: /load <session_id>\n   Use /sessions to see saved sessions.'
          }]);
          return true;
        }
        try {
          let loadSession = sessionManager.getSession(args);
          if (!loadSession) {
            // Try by name
            loadSession = sessionManager.getSessionByName(args);
          }
          if (!loadSession) {
            setMessages(prev => [...prev, { 
              role: 'system', 
              content: `❌ Session not found: "${args}"`
            }]);
            return true;
          }
          // Restore conversation
          agent.setConversationHistory(loadSession.messages);
          agent.setModel(loadSession.model);
          if (loadSession.provider) {
            agent.setProvider(loadSession.provider);
          }
          setCurrentSessionId(loadSession.id);
          setMessages([{ 
            role: 'system', 
            content: `✅ Loaded session: "${loadSession.name}"\n   ${loadSession.messages.length} messages loaded\n   Model: ${loadSession.model} (${loadSession.provider})`
          }]);
        } catch (err) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Failed to load session: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;
      
      case 'forget':
        // Delete all sessions
        try {
          sessionManager.clearAllSessions();
          setCurrentSessionId(null);
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: '✅ All sessions deleted.'
          }]);
        } catch (err) {
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `❌ Failed to clear sessions: ${err instanceof Error ? err.message : String(err)}`
          }]);
        }
        return true;

      case 'exit':
      case 'quit':
        // Auto-save session before exiting (if there's conversation)
        try {
          const history = agent.getConversationHistory();
          if (history.length > 0) {
            sessionManager.saveSession(
              history,
              agent.getModel(),
              agent.getProvider(),
              undefined,
              currentSessionId || undefined
            );
          }
        } catch {
          // Ignore save errors on exit
        }
        // Kill all processes before exiting
        if (processManager.hasRunning()) {
          processManager.killAll();
        }
        onExit?.();
        exit();
        return true;
        
      default:
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `Unknown command: /${cmd}. Type /help for available commands.`
        }]);
        return true;
    }
  }, [agent, onExit, exit]);

  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    
    // If currently processing, queue the message for later
    if (isProcessing) {
      setQueuedInput(trimmed);
      setHasQueuedMessage(true);
      setInput('');
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `📥 Queued: "${trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed}"\n   Press Esc to interrupt and send now.`
      }]);
      return;
    }

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      setInput('');
      handleSlashCommand(trimmed);
      return;
    }

    // Handle special text commands (legacy support)
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      onExit?.();
      exit();
      return;
    }

    if (trimmed.toLowerCase() === 'clear') {
      agent.clearHistory();
      setMessages([]);
      setInput('');
      setCurrentToolCalls([]);
      setStreamingText('');
      return;
    }

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setIsProcessing(true);
    setIsInterrupted(false);
    setError(null);
    setCurrentToolCalls([]);
    setStreamingText('');
    setThinkingText(null);
    completedToolCalls.current = [];
    
    // Create abort controller for this request
    abortController.current = new AbortController();

    try {
      const result = await agent.run(trimmed, { abortSignal: abortController.current.signal });
      
      // Check if we were interrupted
      if (isInterrupted) {
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: '⚡ Generation interrupted by user.'
        }]);
      } else {
        // Add final assistant message
        setMessages(prev => {
          // Remove any streaming message
          const filtered = prev.filter(m => !m.isStreaming);
          // Clean the response text of any model-specific markers
          const cleanedText = cleanModelOutput(result.text || '');
          return [...filtered, {
            role: 'assistant',
            content: cleanedText || '(completed)',
            toolCalls: result.toolCalls.map(tc => ({
              name: tc.name,
              args: tc.input,
              result: tc.result,
              success: !(tc.result && typeof tc.result === 'object' && 'error' in tc.result),
              pending: false,
            })),
          }];
        });
      }
      
      setStreamingText('');
      setCurrentToolCalls([]);
    } catch (err: unknown) {
      // Defensive error handling - ensure errorMsg is always a string
      const errorMsg = err instanceof Error 
        ? err.message 
        : (typeof err === 'string' ? err : 'Unknown error occurred');
      let displayError = errorMsg;
      
      // Safe includes checks with fallback
      const msgLower = errorMsg.toLowerCase();
      
      if (msgLower.includes('aborted') || msgLower.includes('aborterror')) {
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: '⚡ Generation interrupted by user.'
        }]);
      } else if (msgLower.includes('credits exhausted')) {
        displayError = 'API credits exhausted. Please add credits to your provider.';
        setError(displayError);
      } else if (msgLower.includes('invalid_api_key') || msgLower.includes('401') || msgLower.includes('unauthorized')) {
        displayError = 'Invalid API key. Run "quantish init" to reconfigure.';
        setError(displayError);
      } else if (msgLower.includes('rate_limit') || msgLower.includes('429')) {
        displayError = 'Rate limited. Please wait a moment and try again.';
        setError(displayError);
      } else if (msgLower.includes('cannot read properties of undefined') || msgLower.includes('undefined')) {
        displayError = 'Tool call parsing error. The model may have sent malformed output.';
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
  
  // Track previous processing state to detect transitions
  const wasProcessing = useRef(false);
  
  // Effect to process queued messages after processing completes naturally
  useEffect(() => {
    // Only process when transitioning from processing to not processing
    const justFinished = wasProcessing.current && !isProcessing;
    wasProcessing.current = isProcessing;
    
    if (justFinished && hasQueuedMessage && queuedInput) {
      const nextMessage = queuedInput;
      setQueuedInput('');
      setHasQueuedMessage(false);
      
      // Remove the "Queued:" system message
      setMessages(prev => prev.filter(m => 
        !(m.role === 'system' && m.content.startsWith('📥 Queued:'))
      ));
      
      // Delay slightly to let UI settle, then send the queued message
      const timer = setTimeout(() => {
        handleSubmit(nextMessage);
      }, 150);
      
      return () => clearTimeout(timer);
    }
  }, [isProcessing, hasQueuedMessage, queuedInput, handleSubmit]);

  // Set up agent callbacks
  useEffect(() => {
    // Override agent config with our callbacks
    const originalConfig = (agent as any).config;
    
    (agent as any).config = {
      ...originalConfig,
      streaming: true,
      onText: (text: string, isComplete: boolean) => {
        if (!isComplete) {
          // Filter out <tool_call> markers that some models (GLM 4.7, etc.) emit in streaming
          const cleanText = text
            .replace(/<tool_call>/g, '')
            .replace(/<\/tool_call>/g, '')
            .replace(/<arg_key>/g, '')
            .replace(/<\/arg_key>/g, '');
          if (cleanText) {
            setStreamingText(prev => prev + cleanText);
          }
        }
      },
      onThinking: (text: string) => {
        setThinkingText(prev => (prev || '') + text);
      },
      onToolCall: (name: string, args: Record<string, unknown>) => {
        setCurrentToolCalls(prev => [...prev, {
          name,
          args,
          pending: true,
        }]);
      },
      onToolResult: (name: string, result: unknown, success: boolean) => {
        setCurrentToolCalls(prev => 
          prev.map(tc => 
            tc.name === name && tc.pending 
              ? { ...tc, result, success, pending: false }
              : tc
          )
        );
      },
      onStreamStart: () => {
        setStreamingText('');
      },
      onStreamEnd: () => {
        // Stream ended for this turn
      },
      onTokenUsage: (usage: TokenUsage) => {
        setTokenUsage(usage);
      },
    };

    return () => {
      (agent as any).config = originalConfig;
    };
  }, [agent]);

  // Listen for Ctrl+C, Escape, and Backspace
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      // Kill all background processes before exiting
      if (processManager.hasRunning()) {
        const count = processManager.runningCount();
        processManager.killAll();
        console.log(`\nStopped ${count} background process${count > 1 ? 'es' : ''}.`);
      }
      onExit?.();
      exit();
    }
    
    // Backspace with empty input and queued message - un-queue it back to input
    if (key.backspace && input === '' && hasQueuedMessage && queuedInput) {
      setInput(queuedInput);
      setQueuedInput('');
      setHasQueuedMessage(false);
      // Remove the "Queued:" system message
      setMessages(prev => prev.filter(m => 
        !(m.role === 'system' && m.content.startsWith('📥 Queued:'))
      ));
    }
    
    // Escape key to interrupt generation and optionally send queued message
    if (key.escape && isProcessing) {
      setIsInterrupted(true);
      abortController.current?.abort();
      
      // If there's a queued message, interrupt and send it immediately
      if (hasQueuedMessage && queuedInput) {
        const messageToSend = queuedInput;
        
        // Clear the queue
        setQueuedInput('');
        setHasQueuedMessage(false);
        
        // Force stop processing and send the queued message
        setIsProcessing(false);
        
        setMessages(prev => {
          // Remove the queued indicator
          const filtered = prev.filter(m => 
            !(m.role === 'system' && m.content.startsWith('📥 Queued:'))
          );
          return [...filtered, { 
            role: 'system', 
            content: '⚡ Interrupted. Sending queued message...'
          }];
        });
        
        // Send the queued message after a short delay
        setTimeout(() => {
          handleSubmit(messageToSend);
        }, 200);
      } else {
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: '⚡ Interrupting...'
        }]);
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Note: ASCII banner is printed before Ink starts, in index.ts */}

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1} flexDirection="column">
            {msg.role === 'user' && (
              <Box>
                <Text color="green" bold>You: </Text>
                <Text>{msg.content}</Text>
              </Box>
            )}
            {msg.role === 'assistant' && (
              <Box flexDirection="column">
                {/* Show tool calls with details */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <Box flexDirection="column" marginBottom={1}>
                    {msg.toolCalls.map((tc, j) => (
                      <Box key={j} flexDirection="column" marginLeft={2}>
                        <Box>
                          <Text color={tc.success ? 'blue' : 'red'}>
                            {tc.success ? '✓' : '✗'} {tc.name}
                          </Text>
                          <Text color="gray">{formatArgs(tc.args)}</Text>
                        </Box>
                        {tc.result && (
                          <Box marginLeft={2}>
                            <Text color="gray" dimColor>
                              → {formatResult(tc.result, 100)}
                            </Text>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
                {/* Show response text */}
                {msg.content && msg.content !== '(completed)' && (
                  <Box>
                    <Text color="magenta" bold>Quantish: </Text>
                    <Text wrap="wrap">{msg.content}</Text>
                  </Box>
                )}
              </Box>
            )}
            {msg.role === 'system' && (
              <Box>
                <Text color="gray" italic>{msg.content}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Currently executing tool calls */}
      {currentToolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={1} marginLeft={2}>
          {currentToolCalls.map((tc, i) => (
            <Box key={i} flexDirection="column">
              <Box>
                {tc.pending ? (
                  <Text color="cyan">
                    <Spinner type="dots" /> {tc.name}
                  </Text>
                ) : (
                  <Text color={tc.success ? 'blue' : 'red'}>
                    {tc.success ? '✓' : '✗'} {tc.name}
                  </Text>
                )}
                <Text color="gray">{formatArgs(tc.args)}</Text>
              </Box>
              {!tc.pending && tc.result && (
                <Box marginLeft={2}>
                  <Text color="gray" dimColor>
                    → {formatResult(tc.result, 100)}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Streaming text */}
      {streamingText && (
        <Box marginBottom={1}>
          <Text color="magenta" bold>Quantish: </Text>
          <Text wrap="wrap">{streamingText}</Text>
          <Text color="cyan">▊</Text>
        </Box>
      )}

      {/* Thinking indicator */}
      {thinkingText && (
        <Box marginBottom={1}>
          <Text color="gray" italic>
            💭 {thinkingText.slice(0, 100)}{thinkingText.length > 100 ? '...' : ''}
          </Text>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">❌ Error: {error}</Text>
        </Box>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <Box marginBottom={1}>
          <Text color="cyan">
            <Spinner type="dots" />{' '}
            {currentToolCalls.length > 0 
              ? `Working... (${currentToolCalls.filter(tc => tc.pending).length} tool${currentToolCalls.filter(tc => tc.pending).length !== 1 ? 's' : ''} running)`
              : streamingText 
                ? 'Generating...'
                : 'Thinking...'}
          </Text>
        </Box>
      )}

      {/* Slash command preview */}
      {input.startsWith('/') && !isProcessing && (
        <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
          <Text color="gray" dimColor>Commands:</Text>
          {SLASH_COMMANDS
            .filter(c => c.cmd.startsWith(input.toLowerCase()) || input === '/')
            .slice(0, 5)
            .map((c, i) => (
              <Box key={i} paddingLeft={1}>
                <Text color={c.cmd === input.toLowerCase() ? 'yellow' : 'gray'}>
                  {c.cmd}
                </Text>
                <Text color="gray" dimColor> - {c.desc}</Text>
              </Box>
            ))}
        </Box>
      )}

      {/* Queued message indicator */}
      {hasQueuedMessage && isProcessing && (
        <Box marginBottom={1} paddingLeft={2}>
          <Text color="blue">
            📥 Queued: {queuedInput.length > 40 ? queuedInput.slice(0, 40) + '...' : queuedInput}
          </Text>
          <Text color="gray" dimColor> (Esc to send now)</Text>
        </Box>
      )}

      {/* Nice input box with border */}
      <Box 
        borderStyle="round" 
        borderColor={hasQueuedMessage ? 'blue' : (isProcessing ? 'gray' : 'yellow')} 
        paddingX={1}
        marginTop={1}
      >
        <Box>
          <Text color={hasQueuedMessage ? 'blue' : 'yellow'} bold>❯ </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder={
              hasQueuedMessage 
                ? 'Message queued. Type more or press Esc to send now.' 
                : (isProcessing 
                  ? 'Type to queue a message...' 
                  : 'Ask anything or type / for commands')
            }
          />
        </Box>
      </Box>

      {/* Status bar */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray" dimColor>
          ↵ Send • Esc interrupt • /help commands
        </Text>
        <Box>
          {tokenUsage.sessionCost > 0 && (
            <Text color="cyan">
              {formatCost(tokenUsage.sessionCost)}
            </Text>
          )}
          {tokenUsage.totalTokens > 0 && (
            <Text color={getTokenColor(tokenUsage.inputTokens)}>
              {tokenUsage.sessionCost > 0 ? ' • ' : ''}
              ~{formatTokenCount(tokenUsage.inputTokens)} tokens
              {tokenUsage.inputTokens >= 80000 && ' (/compact)'}
            </Text>
          )}
          <Text color="gray" dimColor>
            {tokenUsage.totalTokens > 0 ? ' • ' : ''}
            {isProcessing ? '⏳' : '✓'} Ready
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
