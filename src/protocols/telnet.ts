/**
 * Native Telnet Protocol Implementation
 *
 * Zero external dependencies - uses only Node.js built-in modules.
 * Implements RFC 854 (Telnet Protocol) and RFC 855 (Telnet Options).
 *
 * @module recker/protocols/telnet
 */

import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { StateError, TimeoutError, ConnectionError } from '../core/errors.js';

// ============================================================================
// Telnet Protocol Constants (RFC 854/855)
// ============================================================================

/** Interpret As Command - escape byte for telnet commands */
const IAC = 255;

/** Telnet Commands */
const CMD = {
  /** End of subnegotiation parameters */
  SE: 240,
  /** No operation */
  NOP: 241,
  /** Data Mark */
  DM: 242,
  /** Break */
  BRK: 243,
  /** Interrupt Process */
  IP: 244,
  /** Abort Output */
  AO: 245,
  /** Are You There */
  AYT: 246,
  /** Erase Character */
  EC: 247,
  /** Erase Line */
  EL: 248,
  /** Go Ahead */
  GA: 249,
  /** Subnegotiation Begin */
  SB: 250,
  /** Will perform option */
  WILL: 251,
  /** Won't perform option */
  WONT: 252,
  /** Do perform option */
  DO: 253,
  /** Don't perform option */
  DONT: 254,
  /** IAC itself */
  IAC: 255,
} as const;

/** Telnet Options */
const OPT = {
  /** Binary Transmission */
  BINARY: 0,
  /** Echo */
  ECHO: 1,
  /** Reconnection */
  RCP: 2,
  /** Suppress Go Ahead */
  SGA: 3,
  /** Approx Message Size Negotiation */
  NAMS: 4,
  /** Status */
  STATUS: 5,
  /** Timing Mark */
  TM: 6,
  /** Remote Controlled Trans and Echo */
  RCTE: 7,
  /** Output Line Width */
  NAOL: 8,
  /** Output Page Size */
  NAOP: 9,
  /** Output Carriage-Return Disposition */
  NAOCRD: 10,
  /** Output Horizontal Tab Stops */
  NAOHTS: 11,
  /** Output Horizontal Tab Disposition */
  NAOHTD: 12,
  /** Output Formfeed Disposition */
  NAOFFD: 13,
  /** Output Vertical Tabstops */
  NAOVTS: 14,
  /** Output Vertical Tab Disposition */
  NAOVTD: 15,
  /** Output Linefeed Disposition */
  NAOLFD: 16,
  /** Extended ASCII */
  XASCII: 17,
  /** Logout */
  LOGOUT: 18,
  /** Byte Macro */
  BM: 19,
  /** Data Entry Terminal */
  DET: 20,
  /** SUPDUP */
  SUPDUP: 21,
  /** SUPDUP Output */
  SUPDUPOUTPUT: 22,
  /** Send Location */
  SNDLOC: 23,
  /** Terminal Type */
  TTYPE: 24,
  /** End of Record */
  EOR: 25,
  /** TACACS User Identification */
  TUID: 26,
  /** Output Marking */
  OUTMRK: 27,
  /** Terminal Location Number */
  TTYLOC: 28,
  /** Telnet 3270 Regime */
  OPT3270REGIME: 29,
  /** X.3 PAD */
  X3PAD: 30,
  /** Negotiate About Window Size */
  NAWS: 31,
  /** Terminal Speed */
  TSPEED: 32,
  /** Remote Flow Control */
  LFLOW: 33,
  /** Linemode */
  LINEMODE: 34,
  /** X Display Location */
  XDISPLOC: 35,
  /** Environment Option (old) */
  OLD_ENVIRON: 36,
  /** Authentication */
  AUTHENTICATION: 37,
  /** Encryption */
  ENCRYPT: 38,
  /** New Environment Option */
  NEW_ENVIRON: 39,
  /** Extended-Options-List */
  EXOPL: 255,
} as const;

// ============================================================================
// Types
// ============================================================================

export interface TelnetConfig {
  /** Hostname or IP address */
  host: string;
  /** Port number (default: 23) */
  port?: number;
  /** Connection timeout in ms (default: 10000) */
  timeout?: number;
  /** Shell prompt pattern to detect command completion */
  shellPrompt?: string | RegExp;
  /** Login prompt pattern (default: /login[: ]*$/i) */
  loginPrompt?: string | RegExp;
  /** Password prompt pattern (default: /password[: ]*$/i) */
  passwordPrompt?: string | RegExp;
  /** Username for auto-login */
  username?: string;
  /** Password for auto-login */
  password?: string;
  /** Send initial LF+CR on connect (default: true) */
  initialLFCR?: boolean;
  /** Page separator pattern for pagination handling */
  pageSeparator?: string | RegExp;
  /** Command execution timeout in ms (default: 5000) */
  execTimeout?: number;
  /** Send timeout in ms (default: 2000) */
  sendTimeout?: number;
  /** Maximum buffer size in bytes (default: 1MB) */
  maxBufferLength?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Terminal type to report (default: 'xterm-256color') */
  terminalType?: string;
  /** Window size [width, height] for NAWS */
  windowSize?: [number, number];
}

export interface TelnetResponse<T = void> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface TelnetExecOptions {
  /** Override shell prompt for this command */
  shellPrompt?: string | RegExp;
  /** Command timeout in ms */
  timeout?: number;
  /** Send timeout in ms */
  sendTimeout?: number;
}

export interface TelnetEvents {
  connect: [];
  close: [];
  error: [Error];
  data: [Buffer];
  command: [number, number]; // [command, option]
}

// ============================================================================
// Native Telnet Client Implementation
// ============================================================================

/**
 * Native Telnet Client
 *
 * Implements the Telnet protocol using only Node.js built-in modules.
 * Handles IAC command negotiation, login automation, and command execution.
 *
 * @example
 * ```typescript
 * const client = createTelnet({
 *   host: 'router.local',
 *   port: 23,
 *   username: 'admin',
 *   password: 'secret',
 *   shellPrompt: /[$#>]\s*$/
 * });
 *
 * await client.connect();
 * const result = await client.exec('show version');
 * console.log(result.data);
 * await client.close();
 * ```
 */
export class Telnet extends EventEmitter {
  private socket: Socket | null = null;
  private config: Required<TelnetConfig>;
  private connected = false;
  private buffer = Buffer.alloc(0);
  private dataBuffer = '';
  private loginState: 'pending' | 'username' | 'password' | 'authenticated' = 'pending';

  // Option state tracking
  private localOptions = new Set<number>();
  private remoteOptions = new Set<number>();

  constructor(config: TelnetConfig) {
    super();

    // Apply defaults
    this.config = {
      host: config.host,
      port: config.port ?? 23,
      timeout: config.timeout ?? 10000,
      shellPrompt: config.shellPrompt ?? /[$#>]\s*$/,
      loginPrompt: config.loginPrompt ?? /login[: ]*$/i,
      passwordPrompt: config.passwordPrompt ?? /password[: ]*$/i,
      username: config.username ?? '',
      password: config.password ?? '',
      initialLFCR: config.initialLFCR ?? true,
      pageSeparator: config.pageSeparator ?? '',
      execTimeout: config.execTimeout ?? 5000,
      sendTimeout: config.sendTimeout ?? 2000,
      maxBufferLength: config.maxBufferLength ?? 1024 * 1024,
      debug: config.debug ?? false,
      terminalType: config.terminalType ?? 'xterm-256color',
      windowSize: config.windowSize ?? [80, 24],
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Connect to the Telnet server
   */
  async connect(): Promise<TelnetResponse> {
    return new Promise((resolve) => {
      this.socket = new Socket();
      this.socket.setTimeout(this.config.timeout);

      // Set up event handlers
      this.socket.on('connect', () => {
        this.debug('Connected to %s:%d', this.config.host, this.config.port);
        this.connected = true;

        if (this.config.initialLFCR) {
          this.socket?.write(Buffer.from([13, 10])); // CR LF
        }
      });

      this.socket.on('data', (data) => this.handleData(data));

      this.socket.on('close', () => {
        this.debug('Connection closed');
        this.connected = false;
        this.emit('close');
      });

      this.socket.on('error', (err) => {
        this.debug('Socket error: %s', err.message);
        this.emit('error', err);
        resolve({
          success: false,
          message: err.message
        });
      });

      this.socket.on('timeout', () => {
        this.debug('Connection timeout');
        this.socket?.destroy();
        resolve({
          success: false,
          message: 'Connection timeout'
        });
      });

      // Connect
      this.socket.connect(this.config.port, this.config.host);

      // Wait for shell prompt or auth completion
      this.waitForPromptOrAuth()
        .then(() => {
          resolve({
            success: true,
            message: 'Connected successfully'
          });
        })
        .catch((err) => {
          resolve({
            success: false,
            message: err.message
          });
        });
    });
  }

  /**
   * Check if connected to the server
   */
  isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  /**
   * Execute a command and wait for the shell prompt
   */
  async exec(command: string, options?: TelnetExecOptions): Promise<TelnetResponse<string>> {
    this.ensureConnected();

    const prompt = options?.shellPrompt ?? this.config.shellPrompt;
    const timeout = options?.timeout ?? this.config.execTimeout;

    try {
      // Clear buffer before sending command
      this.dataBuffer = '';

      // Send command
      this.write(command + '\r\n');

      // Wait for prompt
      const output = await this.waitForPattern(prompt, timeout);

      // Clean up output (remove command echo and prompt)
      const cleaned = this.cleanOutput(output, command, prompt);

      return {
        success: true,
        data: cleaned
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Exec failed'
      };
    }
  }

  /**
   * Send data and optionally wait for a pattern
   */
  async send(data: string, options?: { timeout?: number; waitFor?: string | RegExp }): Promise<TelnetResponse<string>> {
    this.ensureConnected();

    try {
      this.write(data);

      if (options?.waitFor) {
        const output = await this.waitForPattern(options.waitFor, options.timeout ?? this.config.sendTimeout);
        return {
          success: true,
          data: output
        };
      }

      return {
        success: true,
        data: ''
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Send failed'
      };
    }
  }

  /**
   * Execute a shell command (alias for exec)
   */
  async shell(command: string): Promise<TelnetResponse<string>> {
    return this.exec(command);
  }

  /**
   * Wait for a specific pattern in the output
   */
  async waitFor(pattern: string | RegExp, timeout?: number): Promise<TelnetResponse<string>> {
    this.ensureConnected();

    try {
      const output = await this.waitForPattern(pattern, timeout ?? this.config.execTimeout);
      return {
        success: true,
        data: output
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'WaitFor failed'
      };
    }
  }

  /**
   * Get the underlying socket for advanced operations
   */
  getSocket(): Socket {
    if (!this.socket) {
      throw new StateError('Not connected. Call connect() first.', {
        expectedState: 'connected',
        actualState: 'disconnected',
      });
    }
    return this.socket;
  }

  /**
   * Close the connection gracefully
   */
  async close(): Promise<void> {
    this.connected = false;
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Destroy the connection immediately
   */
  destroy(): void {
    this.connected = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  // ==========================================================================
  // Protocol Implementation
  // ==========================================================================

  /**
   * Handle incoming data from the socket
   */
  private handleData(data: Buffer): void {
    this.debug('Received %d bytes', data.length);

    // Append to buffer
    this.buffer = Buffer.concat([this.buffer, data]);

    // Enforce max buffer size
    if (this.buffer.length > this.config.maxBufferLength) {
      this.buffer = this.buffer.slice(-this.config.maxBufferLength);
    }

    // Process IAC commands and extract text
    const text = this.processBuffer();

    if (text.length > 0) {
      this.dataBuffer += text;
      this.emit('data', Buffer.from(text));

      // Handle login automation
      this.handleLoginPrompts();
    }
  }

  /**
   * Process buffer for IAC commands, return text content
   */
  private processBuffer(): string {
    const textChunks: Buffer[] = [];
    let i = 0;

    while (i < this.buffer.length) {
      if (this.buffer[i] === IAC) {
        if (i + 1 >= this.buffer.length) {
          // Incomplete IAC sequence, wait for more data
          break;
        }

        const cmd = this.buffer[i + 1];

        if (cmd === IAC) {
          // Escaped IAC (0xFF 0xFF -> 0xFF)
          textChunks.push(Buffer.from([IAC]));
          i += 2;
        } else if (cmd === CMD.SB) {
          // Subnegotiation - find SE
          const seIndex = this.findSubnegotiationEnd(i + 2);
          if (seIndex === -1) {
            // Incomplete subnegotiation, wait for more data
            break;
          }
          this.handleSubnegotiation(this.buffer.slice(i + 2, seIndex));
          i = seIndex + 2; // Skip IAC SE
        } else if (cmd >= CMD.WILL && cmd <= CMD.DONT) {
          // Option negotiation
          if (i + 2 >= this.buffer.length) {
            break;
          }
          const option = this.buffer[i + 2];
          this.handleNegotiation(cmd, option);
          i += 3;
        } else {
          // Other IAC command
          this.debug('IAC command: %d', cmd);
          i += 2;
        }
      } else {
        // Regular data byte
        textChunks.push(Buffer.from([this.buffer[i]]));
        i++;
      }
    }

    // Remove processed bytes from buffer
    this.buffer = this.buffer.slice(i);

    // Combine text chunks and convert to string
    if (textChunks.length === 0) return '';

    const combined = Buffer.concat(textChunks);
    // Strip NUL bytes and convert to string
    return combined.toString('utf8').replace(/\x00/g, '');
  }

  /**
   * Find the end of a subnegotiation sequence
   */
  private findSubnegotiationEnd(start: number): number {
    for (let i = start; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === IAC && this.buffer[i + 1] === CMD.SE) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Handle option negotiation (WILL/WONT/DO/DONT)
   */
  private handleNegotiation(command: number, option: number): void {
    this.debug('Negotiation: %s %d', this.cmdName(command), option);
    this.emit('command', command, option);

    switch (command) {
      case CMD.DO:
        // Server requests we enable an option
        if (this.shouldEnableOption(option)) {
          this.sendCommand(CMD.WILL, option);
          this.localOptions.add(option);
        } else {
          this.sendCommand(CMD.WONT, option);
        }
        break;

      case CMD.DONT:
        // Server requests we disable an option
        this.sendCommand(CMD.WONT, option);
        this.localOptions.delete(option);
        break;

      case CMD.WILL:
        // Server offers to enable an option
        if (this.shouldAcceptOption(option)) {
          this.sendCommand(CMD.DO, option);
          this.remoteOptions.add(option);
        } else {
          this.sendCommand(CMD.DONT, option);
        }
        break;

      case CMD.WONT:
        // Server refuses/disables an option
        this.sendCommand(CMD.DONT, option);
        this.remoteOptions.delete(option);
        break;
    }
  }

  /**
   * Determine if we should enable a requested option
   */
  private shouldEnableOption(option: number): boolean {
    // Options we're willing to enable
    switch (option) {
      case OPT.TTYPE:    // Terminal Type
      case OPT.NAWS:     // Window Size
      case OPT.SGA:      // Suppress Go Ahead
        return true;
      default:
        return false;
    }
  }

  /**
   * Determine if we should accept a server option
   */
  private shouldAcceptOption(option: number): boolean {
    // Options we want the server to enable
    switch (option) {
      case OPT.ECHO:     // Server echoes our input
      case OPT.SGA:      // Suppress Go Ahead
      case OPT.BINARY:   // Binary transmission
        return true;
      default:
        return false;
    }
  }

  /**
   * Handle subnegotiation
   */
  private handleSubnegotiation(data: Buffer): void {
    if (data.length < 1) return;

    const option = data[0];
    this.debug('Subnegotiation for option %d', option);

    switch (option) {
      case OPT.TTYPE:
        // Terminal Type subnegotiation
        if (data.length >= 2 && data[1] === 1) {
          // SEND request - respond with terminal type
          this.sendSubnegotiation(OPT.TTYPE, Buffer.from([0, ...Buffer.from(this.config.terminalType)]));
        }
        break;

      case OPT.NAWS:
        // Window size - server wants our window size
        // We send it proactively when enabled
        break;
    }
  }

  /**
   * Send a telnet command
   */
  private sendCommand(command: number, option: number): void {
    this.debug('Sending: %s %d', this.cmdName(command), option);
    this.socket?.write(Buffer.from([IAC, command, option]));
  }

  /**
   * Send subnegotiation data
   */
  private sendSubnegotiation(option: number, data: Buffer): void {
    const packet = Buffer.concat([
      Buffer.from([IAC, CMD.SB, option]),
      data,
      Buffer.from([IAC, CMD.SE])
    ]);
    this.socket?.write(packet);
  }

  /**
   * Send NAWS (window size) subnegotiation
   */
  private sendWindowSize(): void {
    const [width, height] = this.config.windowSize;
    const data = Buffer.alloc(4);
    data.writeUInt16BE(width, 0);
    data.writeUInt16BE(height, 2);
    this.sendSubnegotiation(OPT.NAWS, data);
  }

  // ==========================================================================
  // Login Automation
  // ==========================================================================

  /**
   * Handle login prompt detection and auto-login
   */
  private handleLoginPrompts(): void {
    if (this.loginState === 'authenticated') return;
    if (!this.config.username && !this.config.password) {
      this.loginState = 'authenticated';
      return;
    }

    const text = this.dataBuffer;

    // Check for login prompt
    if (this.loginState === 'pending' || this.loginState === 'username') {
      if (this.matchPattern(text, this.config.loginPrompt)) {
        if (this.config.username) {
          this.debug('Detected login prompt, sending username');
          this.write(this.config.username + '\r\n');
          this.loginState = 'password';
          this.dataBuffer = '';
        }
      }
    }

    // Check for password prompt
    if (this.loginState === 'password') {
      if (this.matchPattern(text, this.config.passwordPrompt)) {
        if (this.config.password) {
          this.debug('Detected password prompt, sending password');
          this.write(this.config.password + '\r\n');
          this.loginState = 'authenticated';
          this.dataBuffer = '';
        }
      }
    }
  }

  /**
   * Wait for shell prompt or authentication to complete
   */
  private async waitForPromptOrAuth(): Promise<void> {
    const timeout = this.config.timeout;
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - start > timeout) {
          reject(new TimeoutError(undefined, {
            phase: 'response',
            timeout,
          }));
          return;
        }

        // Check if we got shell prompt
        if (this.matchPattern(this.dataBuffer, this.config.shellPrompt)) {
          this.loginState = 'authenticated';
          resolve();
          return;
        }

        // Keep checking
        setTimeout(check, 100);
      };

      check();
    });
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Write data to the socket
   */
  private write(data: string | Buffer): void {
    if (!this.socket || !this.connected) {
      throw new StateError('Not connected', {
        expectedState: 'connected',
        actualState: 'disconnected',
      });
    }

    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.debug('Sending: %s', buffer.toString().replace(/\r\n/g, '\\r\\n'));
    this.socket.write(buffer);
  }

  /**
   * Wait for a pattern to appear in the output
   */
  private waitForPattern(pattern: string | RegExp, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const startBuffer = this.dataBuffer;

      const check = () => {
        if (Date.now() - start > timeout) {
          reject(new TimeoutError(undefined, {
            phase: 'response',
            timeout,
          }));
          return;
        }

        if (this.matchPattern(this.dataBuffer, pattern)) {
          resolve(this.dataBuffer);
          return;
        }

        setTimeout(check, 50);
      };

      check();
    });
  }

  /**
   * Match a pattern against text
   */
  private matchPattern(text: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return text.includes(pattern);
    }
    return pattern.test(text);
  }

  /**
   * Clean command output (remove echo and prompt)
   */
  private cleanOutput(output: string, command: string, prompt: string | RegExp): string {
    let cleaned = output;

    // Remove command echo (first line usually)
    const lines = cleaned.split(/\r?\n/);
    if (lines.length > 0 && lines[0].includes(command)) {
      lines.shift();
    }

    cleaned = lines.join('\n');

    // Remove trailing prompt
    if (typeof prompt === 'string') {
      const idx = cleaned.lastIndexOf(prompt);
      if (idx !== -1) {
        cleaned = cleaned.substring(0, idx);
      }
    } else {
      cleaned = cleaned.replace(prompt, '');
    }

    return cleaned.trim();
  }

  /**
   * Ensure we're connected
   */
  private ensureConnected(): void {
    if (!this.connected || !this.socket) {
      throw new StateError('Not connected to Telnet server. Call connect() first.', {
        expectedState: 'connected',
        actualState: 'disconnected',
      });
    }
  }

  /**
   * Get command name for debugging
   */
  private cmdName(cmd: number): string {
    switch (cmd) {
      case CMD.WILL: return 'WILL';
      case CMD.WONT: return 'WONT';
      case CMD.DO: return 'DO';
      case CMD.DONT: return 'DONT';
      default: return `CMD(${cmd})`;
    }
  }

  /**
   * Debug logging
   */
  private debug(format: string, ...args: unknown[]): void {
    if (this.config.debug) {
      console.log(`[Telnet] ${format}`, ...args);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Telnet client instance
 *
 * @example
 * ```typescript
 * const client = createTelnet({ host: 'switch.local', port: 23 });
 * await client.connect();
 * const result = await client.exec('show interfaces');
 * await client.close();
 * ```
 */
export function createTelnet(config: TelnetConfig): Telnet {
  return new Telnet(config);
}

/**
 * Perform a one-shot Telnet operation with automatic connection management
 *
 * @example
 * ```typescript
 * // Execute a command
 * const output = await telnet(
 *   { host: 'router.local', username: 'admin', password: 'admin' },
 *   async (client) => {
 *     return await client.exec('show version');
 *   }
 * );
 *
 * // Run multiple commands
 * await telnet({ host: 'switch.local' }, async (client) => {
 *   await client.exec('enable');
 *   await client.exec('show running-config');
 * });
 * ```
 */
export async function telnet<T>(
  config: TelnetConfig,
  operation: (client: Telnet) => Promise<T>
): Promise<T> {
  const client = createTelnet(config);

  try {
    const result = await client.connect();
    if (!result.success) {
      throw new ConnectionError(result.message || 'Failed to connect to Telnet server', {
        host: config.host,
        port: config.port,
      });
    }

    return await operation(client);
  } finally {
    await client.close();
  }
}
