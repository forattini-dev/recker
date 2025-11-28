/**
 * Telnet Protocol Utility
 * Provides a simple async interface for Telnet operations
 */

import { Telnet as TelnetClient } from 'telnet-client';

export interface TelnetConfig {
  host: string;
  port?: number;
  timeout?: number;
  shellPrompt?: string | RegExp;
  loginPrompt?: string | RegExp;
  passwordPrompt?: string | RegExp;
  username?: string;
  password?: string;
  initialLFCR?: boolean;
  pageSeparator?: string | RegExp;
  negotiationMandatory?: boolean;
  execTimeout?: number;
  sendTimeout?: number;
  maxBufferLength?: number;
  debug?: boolean;
}

export interface TelnetResponse<T = void> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface TelnetExecOptions {
  shellPrompt?: string | RegExp;
  timeout?: number;
  sendTimeout?: number;
}

/**
 * Telnet Client wrapper with async/await interface
 *
 * @example
 * ```typescript
 * const client = createTelnet({
 *   host: 'telnet.example.com',
 *   port: 23,
 *   shellPrompt: /[$#>]/,
 *   username: 'admin',
 *   password: 'secret'
 * });
 *
 * await client.connect();
 * const result = await client.exec('ls -la');
 * console.log(result.data);
 * await client.close();
 * ```
 */
export class Telnet {
  private client: TelnetClient;
  private config: TelnetConfig;
  private connected: boolean = false;

  constructor(config: TelnetConfig) {
    this.config = config;
    this.client = new TelnetClient();
  }

  /**
   * Connect to the Telnet server
   */
  async connect(): Promise<TelnetResponse> {
    try {
      const params: Record<string, unknown> = {
        host: this.config.host,
        port: this.config.port ?? 23,
        timeout: this.config.timeout ?? 10000,
        shellPrompt: this.config.shellPrompt ?? /[$#>]\s*$/,
        loginPrompt: this.config.loginPrompt ?? /login[: ]*$/i,
        passwordPrompt: this.config.passwordPrompt ?? /password[: ]*$/i,
        username: this.config.username,
        password: this.config.password,
        initialLFCR: this.config.initialLFCR ?? true,
        pageSeparator: this.config.pageSeparator,
        negotiationMandatory: this.config.negotiationMandatory ?? false,
        execTimeout: this.config.execTimeout ?? 5000,
        sendTimeout: this.config.sendTimeout ?? 2000,
        maxBufferLength: this.config.maxBufferLength ?? 1024 * 1024,
        debug: this.config.debug ?? false,
      };

      await this.client.connect(params);
      this.connected = true;

      return {
        success: true,
        message: 'Connected successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Check if connected to Telnet server
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Execute a command and return the output
   */
  async exec(command: string, options?: TelnetExecOptions): Promise<TelnetResponse<string>> {
    this.ensureConnected();

    try {
      const execOptions: Record<string, unknown> = {};

      if (options?.shellPrompt) {
        execOptions.shellPrompt = options.shellPrompt;
      }
      if (options?.timeout) {
        execOptions.timeout = options.timeout;
      }
      if (options?.sendTimeout) {
        execOptions.sendTimeout = options.sendTimeout;
      }

      const result = await this.client.exec(command, execOptions);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Exec failed'
      };
    }
  }

  /**
   * Send data without waiting for response
   */
  async send(data: string, options?: { timeout?: number; waitFor?: string | RegExp }): Promise<TelnetResponse<string>> {
    this.ensureConnected();

    try {
      const result = await this.client.send(data, options);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Send failed'
      };
    }
  }

  /**
   * Send shell command (equivalent to exec)
   */
  async shell(command: string): Promise<TelnetResponse<string>> {
    return this.exec(command);
  }

  /**
   * Wait for a specific string/regex in the output
   */
  async waitFor(pattern: string | RegExp, timeout?: number): Promise<TelnetResponse<string>> {
    this.ensureConnected();

    try {
      const result = await this.client.send('', { waitFor: pattern, timeout });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'WaitFor failed'
      };
    }
  }

  /**
   * Get the underlying telnet socket for advanced operations
   */
  getClient(): TelnetClient {
    return this.client;
  }

  /**
   * Close the Telnet connection
   */
  async close(): Promise<void> {
    this.connected = false;
    await this.client.end();
  }

  /**
   * Destroy the connection immediately
   */
  destroy(): void {
    this.connected = false;
    this.client.destroy();
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to Telnet server. Call connect() first.');
    }
  }
}

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
 * const output = await telnet({ host: 'router.local', username: 'admin', password: 'admin' }, async (client) => {
 *   return await client.exec('show version');
 * });
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
      throw new Error(result.message || 'Failed to connect to Telnet server');
    }

    return await operation(client);
  } finally {
    await client.close();
  }
}
