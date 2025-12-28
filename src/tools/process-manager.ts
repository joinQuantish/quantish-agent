/**
 * Process Manager
 * 
 * Manages background processes spawned by the agent, allowing:
 * - Starting processes in the background with streaming output
 * - Tracking running processes
 * - Stopping individual processes or all at once
 * - Auto-cleanup on CLI exit
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ProcessInfo {
  id: number;
  pid: number;
  command: string;
  name: string;
  cwd: string;
  startedAt: Date;
  status: 'running' | 'stopped' | 'error';
  lastOutput: string[];
}

export interface SpawnedProcess extends ProcessInfo {
  child: ChildProcess;
  outputBuffer: string[];
  onOutput?: (line: string) => void;
}

export class ProcessManager extends EventEmitter {
  private processes: Map<number, SpawnedProcess> = new Map();
  private nextId: number = 1;
  private maxOutputLines: number = 100;

  constructor() {
    super();
  }

  /**
   * Spawn a new background process
   */
  spawn(
    command: string,
    options: {
      cwd?: string;
      name?: string;
      onOutput?: (line: string) => void;
    } = {}
  ): ProcessInfo {
    const id = this.nextId++;
    const cwd = options.cwd || process.cwd();
    const name = options.name || command.split(' ')[0];

    // Spawn the process with shell
    const child = spawn('bash', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false, // Keep attached so we can track it
      env: { ...process.env, FORCE_COLOR: '1' }, // Enable colors
    });

    const spawnedProcess: SpawnedProcess = {
      id,
      pid: child.pid!,
      command,
      name,
      cwd,
      startedAt: new Date(),
      status: 'running',
      child,
      outputBuffer: [],
      lastOutput: [],
      onOutput: options.onOutput,
    };

    // Capture stdout
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.addOutput(spawnedProcess, line);
      }
    });

    // Capture stderr
    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        this.addOutput(spawnedProcess, `[stderr] ${line}`);
      }
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      spawnedProcess.status = code === 0 ? 'stopped' : 'error';
      this.addOutput(spawnedProcess, `[Process exited with code ${code}${signal ? `, signal ${signal}` : ''}]`);
      this.emit('exit', id, code, signal);
    });

    // Handle spawn errors
    child.on('error', (err) => {
      spawnedProcess.status = 'error';
      this.addOutput(spawnedProcess, `[Error: ${err.message}]`);
      this.emit('error', id, err);
    });

    this.processes.set(id, spawnedProcess);
    this.emit('spawn', id, spawnedProcess);

    return this.getProcessInfo(spawnedProcess);
  }

  /**
   * Add output to process buffer
   */
  private addOutput(process: SpawnedProcess, line: string): void {
    process.outputBuffer.push(line);
    process.lastOutput.push(line);

    // Keep buffer limited
    if (process.outputBuffer.length > this.maxOutputLines) {
      process.outputBuffer.shift();
    }
    if (process.lastOutput.length > 20) {
      process.lastOutput.shift();
    }

    // Notify callback
    process.onOutput?.(line);
    this.emit('output', process.id, line);
  }

  /**
   * Get process info without the child process object
   */
  private getProcessInfo(process: SpawnedProcess): ProcessInfo {
    return {
      id: process.id,
      pid: process.pid,
      command: process.command,
      name: process.name,
      cwd: process.cwd,
      startedAt: process.startedAt,
      status: process.status,
      lastOutput: [...process.lastOutput],
    };
  }

  /**
   * Kill a process by ID
   */
  kill(id: number): boolean {
    const process = this.processes.get(id);
    if (!process) {
      return false;
    }

    if (process.status !== 'running') {
      return true; // Already stopped
    }

    try {
      // Try graceful shutdown first (SIGTERM)
      process.child.kill('SIGTERM');
      
      // Force kill after 3 seconds if still running
      setTimeout(() => {
        if (process.status === 'running') {
          process.child.kill('SIGKILL');
        }
      }, 3000);

      process.status = 'stopped';
      this.emit('kill', id);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kill all running processes
   */
  killAll(): void {
    for (const [id, process] of this.processes) {
      if (process.status === 'running') {
        this.kill(id);
      }
    }
  }

  /**
   * List all processes
   */
  list(): ProcessInfo[] {
    return Array.from(this.processes.values()).map((p) => this.getProcessInfo(p));
  }

  /**
   * List running processes only
   */
  listRunning(): ProcessInfo[] {
    return this.list().filter((p) => p.status === 'running');
  }

  /**
   * Get a specific process
   */
  get(id: number): ProcessInfo | undefined {
    const process = this.processes.get(id);
    return process ? this.getProcessInfo(process) : undefined;
  }

  /**
   * Get recent output from a process
   */
  getOutput(id: number, lines: number = 20): string[] {
    const process = this.processes.get(id);
    if (!process) {
      return [];
    }
    return process.outputBuffer.slice(-lines);
  }

  /**
   * Check if any processes are running
   */
  hasRunning(): boolean {
    return this.listRunning().length > 0;
  }

  /**
   * Get count of running processes
   */
  runningCount(): number {
    return this.listRunning().length;
  }

  /**
   * Set output callback for a process
   */
  setOutputCallback(id: number, callback: (line: string) => void): void {
    const process = this.processes.get(id);
    if (process) {
      process.onOutput = callback;
    }
  }
}

// Singleton instance for global process management
export const processManager = new ProcessManager();

