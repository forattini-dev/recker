/**
 * Mock Telnet Server
 *
 * A lightweight Telnet server for testing Telnet clients.
 * Supports echo mode, custom commands, and banner messages.
 *
 * @example
 * ```typescript
 * import { MockTelnetServer } from 'recker/testing';
 *
 * const server = await MockTelnetServer.create({ port: 2323 });
 *
 * // Add custom commands
 * server.addCommand('hello', 'Hello, World!');
 * server.addCommand('time', () => new Date().toISOString());
 *
 * // Connect: telnet localhost 2323
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import * as net from 'node:net';

// ============================================
// Types
// ============================================

export interface MockTelnetServerOptions {
  /**
   * Port to listen on
   * @default 2323
   */
  port?: number;

  /**
   * Host to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Echo input back to client
   * @default true
   */
  echo?: boolean;

  /**
   * Welcome banner message
   * @default 'Welcome to Mock Telnet Server\n'
   */
  banner?: string;

  /**
   * Command prompt
   * @default '> '
   */
  prompt?: string;

  /**
   * Response delay in ms
   * @default 0
   */
  delay?: number;
}

export type CommandHandler = string | ((args: string[], session: TelnetSession) => string | Promise<string>);

export interface TelnetSession {
  id: string;
  socket: net.Socket;
  connectedAt: Date;
  lastActivity: Date;
  data: Record<string, unknown>;
}

export interface MockTelnetStats {
  connectionsTotal: number;
  connectionsActive: number;
  commandsReceived: number;
  commandLog: Array<{ command: string; sessionId: string; timestamp: number }>;
}

// ============================================
// MockTelnetServer
// ============================================

export class MockTelnetServer extends EventEmitter {
  private options: Required<MockTelnetServerOptions>;
  private server: net.Server | null = null;
  private sessions: Map<string, TelnetSession> = new Map();
  private commands: Map<string, CommandHandler> = new Map();
  private started = false;
  private sessionCounter = 0;
  private stats: MockTelnetStats = {
    connectionsTotal: 0,
    connectionsActive: 0,
    commandsReceived: 0,
    commandLog: [],
  };

  constructor(options: MockTelnetServerOptions = {}) {
    super();

    this.options = {
      port: 2323,
      host: '127.0.0.1',
      echo: true,
      banner: 'Welcome to Recker Mock Telnet Server\r\nType "help" for available commands.\r\n',
      prompt: '> ',
      delay: 0,
      ...options,
    };

    // Add default commands
    this.addDefaultCommands();
  }

  // ============================================
  // Properties
  // ============================================

  get isRunning(): boolean {
    return this.started;
  }

  get port(): number {
    return this.options.port;
  }

  get host(): string {
    return this.options.host;
  }

  get url(): string {
    return `telnet://${this.options.host}:${this.options.port}`;
  }

  get activeSessions(): number {
    return this.sessions.size;
  }

  get statistics(): MockTelnetStats {
    return {
      ...this.stats,
      connectionsActive: this.sessions.size,
    };
  }

  // ============================================
  // Command Management
  // ============================================

  /**
   * Add a command handler
   */
  addCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase(), handler);
  }

  /**
   * Remove a command
   */
  removeCommand(name: string): void {
    this.commands.delete(name.toLowerCase());
  }

  /**
   * Get command handler
   */
  getCommand(name: string): CommandHandler | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Clear all commands
   */
  clearCommands(): void {
    this.commands.clear();
    this.addDefaultCommands();
  }

  private addDefaultCommands(): void {
    // Help command
    this.addCommand('help', () => {
      const cmds = Array.from(this.commands.keys()).sort();
      return `Available commands:\r\n${cmds.map((c) => `  ${c}`).join('\r\n')}\r\n`;
    });

    // Echo command
    this.addCommand('echo', (args) => args.join(' '));

    // Date/time commands
    this.addCommand('date', () => new Date().toDateString());
    this.addCommand('time', () => new Date().toTimeString());
    this.addCommand('datetime', () => new Date().toISOString());

    // System info
    this.addCommand('uptime', () => `${Math.floor(process.uptime())} seconds`);
    this.addCommand('version', () => 'Recker Mock Telnet Server v1.0.0');

    // Session info
    this.addCommand('whoami', (_args, session) => `Session ID: ${session.id}`);
    this.addCommand('sessions', () => `Active sessions: ${this.sessions.size}`);

    // Utility commands
    this.addCommand('clear', () => '\x1b[2J\x1b[H'); // ANSI clear screen
    this.addCommand('quit', (_args, session) => {
      session.socket.end('Goodbye!\r\n');
      return '';
    });
    this.addCommand('exit', (_args, session) => {
      session.socket.end('Goodbye!\r\n');
      return '';
    });

    // Test commands
    this.addCommand('ping', () => 'pong');
    this.addCommand('reverse', (args) => args.join(' ').split('').reverse().join(''));
    this.addCommand('upper', (args) => args.join(' ').toUpperCase());
    this.addCommand('lower', (args) => args.join(' ').toLowerCase());
    this.addCommand('count', (args) => `${args.join(' ').length} characters`);

    // Delay test
    this.addCommand('sleep', async (args) => {
      const ms = parseInt(args[0]) || 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10000)));
      return `Slept for ${ms}ms`;
    });
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * Broadcast message to all sessions
   */
  broadcast(message: string): void {
    for (const session of this.sessions.values()) {
      session.socket.write(`\r\n[BROADCAST] ${message}\r\n${this.options.prompt}`);
    }
  }

  /**
   * Get session by ID
   */
  getSession(id: string): TelnetSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Disconnect a session
   */
  disconnectSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.socket.end('Disconnected by server.\r\n');
      return true;
    }
    return false;
  }

  // ============================================
  // Lifecycle
  // ============================================

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Server already started');
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        if (!this.started) {
          reject(err);
        }
      });

      this.server.listen(this.options.port, this.options.host, () => {
        this.started = true;
        this.emit('start');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.started || !this.server) return;

    // Close all sessions
    for (const session of this.sessions.values()) {
      session.socket.end('Server shutting down.\r\n');
    }
    this.sessions.clear();

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.started = false;
        this.emit('stop');
        resolve();
      });
    });
  }

  reset(): void {
    this.stats = {
      connectionsTotal: 0,
      connectionsActive: 0,
      commandsReceived: 0,
      commandLog: [],
    };
    this.clearCommands();
    this.emit('reset');
  }

  // ============================================
  // Connection Handling
  // ============================================

  private handleConnection(socket: net.Socket): void {
    const sessionId = `session-${++this.sessionCounter}`;
    const session: TelnetSession = {
      id: sessionId,
      socket,
      connectedAt: new Date(),
      lastActivity: new Date(),
      data: {},
    };

    this.sessions.set(sessionId, session);
    this.stats.connectionsTotal++;

    this.emit('connect', session);

    // Send banner and prompt
    socket.write(this.options.banner);
    socket.write(this.options.prompt);

    let inputBuffer = '';

    socket.on('data', async (data) => {
      session.lastActivity = new Date();

      // Handle telnet negotiation bytes (IAC commands)
      const filtered = this.filterTelnetCommands(data);
      const text = filtered.toString('utf8');

      // Echo if enabled
      if (this.options.echo) {
        socket.write(text);
      }

      inputBuffer += text;

      // Process complete lines
      while (inputBuffer.includes('\n') || inputBuffer.includes('\r')) {
        const lineEnd = Math.max(
          inputBuffer.indexOf('\n'),
          inputBuffer.indexOf('\r')
        );

        if (lineEnd === -1) break;

        let line = inputBuffer.substring(0, lineEnd).trim();
        inputBuffer = inputBuffer.substring(lineEnd + 1).replace(/^[\r\n]+/, '');

        // Skip empty lines
        if (!line) {
          socket.write(this.options.prompt);
          continue;
        }

        await this.handleCommand(line, session);
      }
    });

    socket.on('close', () => {
      this.sessions.delete(sessionId);
      this.emit('disconnect', session);
    });

    socket.on('error', (err) => {
      this.emit('error', err, session);
      this.sessions.delete(sessionId);
    });
  }

  private filterTelnetCommands(data: Buffer): Buffer {
    // Filter out IAC (Interpret As Command) sequences
    const filtered: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === 255) {
        // IAC
        if (i + 1 < data.length) {
          const cmd = data[i + 1];
          if (cmd >= 251 && cmd <= 254) {
            // WILL/WONT/DO/DONT - skip 3 bytes
            i += 3;
            continue;
          } else if (cmd === 255) {
            // Escaped 255
            filtered.push(255);
            i += 2;
            continue;
          } else {
            // Other command - skip 2 bytes
            i += 2;
            continue;
          }
        }
      }
      filtered.push(data[i]);
      i++;
    }

    return Buffer.from(filtered);
  }

  private async handleCommand(input: string, session: TelnetSession): Promise<void> {
    this.stats.commandsReceived++;
    this.stats.commandLog.push({
      command: input,
      sessionId: session.id,
      timestamp: Date.now(),
    });

    this.emit('command', input, session);

    // Apply delay
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    // Parse command and args
    const parts = input.trim().split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(cmdName);

    let response: string;
    if (!handler) {
      response = `Unknown command: ${cmdName}\r\nType "help" for available commands.`;
    } else if (typeof handler === 'string') {
      response = handler;
    } else {
      try {
        response = await handler(args, session);
      } catch (err) {
        response = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }

    if (response) {
      session.socket.write(`${response}\r\n`);
    }

    // Send prompt if socket is still open
    if (!session.socket.destroyed) {
      session.socket.write(this.options.prompt);
    }
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockTelnetServerOptions = {}): Promise<MockTelnetServer> {
    const server = new MockTelnetServer(options);
    await server.start();
    return server;
  }
}
