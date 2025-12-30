/**
 * Session Manager
 * 
 * Manages chat session persistence for the Quantish CLI.
 * Sessions are stored in ~/.quantish/sessions/
 */

import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

export interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: MessageParam[];
  model: string;
  provider: 'anthropic' | 'openrouter';
  tokenCount?: number;
}

interface SessionIndex {
  lastSessionId: string | null;
  sessions: Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }>;
}

const SESSIONS_DIR = join(homedir(), '.quantish', 'sessions');
const INDEX_FILE = join(SESSIONS_DIR, 'index.json');

/**
 * Ensure the sessions directory exists
 */
function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Load the session index
 */
function loadIndex(): SessionIndex {
  ensureSessionsDir();
  if (!existsSync(INDEX_FILE)) {
    return { lastSessionId: null, sessions: [] };
  }
  try {
    const data = readFileSync(INDEX_FILE, 'utf-8');
    return JSON.parse(data) as SessionIndex;
  } catch {
    return { lastSessionId: null, sessions: [] };
  }
}

/**
 * Save the session index
 */
function saveIndex(index: SessionIndex): void {
  ensureSessionsDir();
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Get the path to a session file
 */
function getSessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

/**
 * Session Manager class
 */
class SessionManager {
  /**
   * Save a new session or update an existing one
   */
  saveSession(
    messages: MessageParam[],
    model: string,
    provider: 'anthropic' | 'openrouter',
    name?: string,
    existingId?: string
  ): ChatSession {
    ensureSessionsDir();
    
    const now = new Date().toISOString();
    const id = existingId || generateSessionId();
    const sessionName = name || `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    
    const session: ChatSession = {
      id,
      name: sessionName,
      createdAt: existingId ? this.getSession(existingId)?.createdAt || now : now,
      updatedAt: now,
      messages,
      model,
      provider,
      tokenCount: this.estimateTokenCount(messages),
    };
    
    // Save session file
    const sessionPath = getSessionPath(id);
    writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    
    // Update index
    const index = loadIndex();
    index.lastSessionId = id;
    
    // Update or add session to index
    const existingIndex = index.sessions.findIndex(s => s.id === id);
    const sessionMeta = {
      id,
      name: sessionName,
      createdAt: session.createdAt,
      updatedAt: now,
      messageCount: messages.length,
    };
    
    if (existingIndex >= 0) {
      index.sessions[existingIndex] = sessionMeta;
    } else {
      index.sessions.unshift(sessionMeta);
    }
    
    // Keep only the last 50 sessions
    if (index.sessions.length > 50) {
      const toRemove = index.sessions.splice(50);
      for (const s of toRemove) {
        try {
          unlinkSync(getSessionPath(s.id));
        } catch {
          // Ignore errors
        }
      }
    }
    
    saveIndex(index);
    return session;
  }
  
  /**
   * Get a session by ID
   */
  getSession(id: string): ChatSession | null {
    const sessionPath = getSessionPath(id);
    if (!existsSync(sessionPath)) {
      return null;
    }
    try {
      const data = readFileSync(sessionPath, 'utf-8');
      return JSON.parse(data) as ChatSession;
    } catch {
      return null;
    }
  }
  
  /**
   * Get the last session
   */
  getLastSession(): ChatSession | null {
    const index = loadIndex();
    if (!index.lastSessionId) {
      return null;
    }
    return this.getSession(index.lastSessionId);
  }
  
  /**
   * Get a session by name
   */
  getSessionByName(name: string): ChatSession | null {
    const index = loadIndex();
    const session = index.sessions.find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );
    if (!session) {
      return null;
    }
    return this.getSession(session.id);
  }
  
  /**
   * List all sessions
   */
  listSessions(): Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }> {
    const index = loadIndex();
    return index.sessions;
  }
  
  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    const sessionPath = getSessionPath(id);
    if (!existsSync(sessionPath)) {
      return false;
    }
    
    try {
      unlinkSync(sessionPath);
      
      // Update index
      const index = loadIndex();
      index.sessions = index.sessions.filter(s => s.id !== id);
      if (index.lastSessionId === id) {
        index.lastSessionId = index.sessions[0]?.id || null;
      }
      saveIndex(index);
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    ensureSessionsDir();
    
    try {
      const files = readdirSync(SESSIONS_DIR);
      for (const file of files) {
        try {
          unlinkSync(join(SESSIONS_DIR, file));
        } catch {
          // Ignore errors
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  /**
   * Estimate token count from messages (rough estimate)
   */
  private estimateTokenCount(messages: MessageParam[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if ('text' in block && typeof block.text === 'string') {
            totalChars += block.text.length;
          }
        }
      }
    }
    // Rough estimate: 4 chars per token
    return Math.ceil(totalChars / 4);
  }
}

// Singleton instance
let sessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}



