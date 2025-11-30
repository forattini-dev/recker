/**
 * Native FTP Protocol Implementation
 *
 * Zero external dependencies - uses only Node.js built-in modules.
 * Implements RFC 959 (FTP) with FTPS support (RFC 4217).
 *
 * @module recker/protocols/ftp
 */

import { Socket } from 'node:net';
import { TLSSocket, connect as tlsConnect, type ConnectionOptions } from 'node:tls';
import { Readable, Writable } from 'node:stream';
import { createWriteStream, createReadStream } from 'node:fs';
import { EventEmitter } from 'node:events';

// ============================================================================
// FTP Response Codes (RFC 959)
// ============================================================================

const ResponseCode = {
  // 1xx - Positive Preliminary
  RESTART_MARKER: 110,
  SERVICE_READY_IN: 120,
  DATA_CONNECTION_OPEN: 125,
  FILE_STATUS_OK: 150,

  // 2xx - Positive Completion
  OK: 200,
  SUPERFLUOUS: 202,
  SYSTEM_STATUS: 211,
  DIRECTORY_STATUS: 212,
  FILE_STATUS: 213,
  HELP_MESSAGE: 214,
  SYSTEM_TYPE: 215,
  SERVICE_READY: 220,
  SERVICE_CLOSING: 221,
  DATA_CONNECTION_READY: 225,
  CLOSING_DATA_CONNECTION: 226,
  ENTERING_PASSIVE: 227,
  ENTERING_EXTENDED_PASSIVE: 229,
  USER_LOGGED_IN: 230,
  AUTH_OK: 234,
  FILE_ACTION_OK: 250,
  PATHNAME_CREATED: 257,

  // 3xx - Positive Intermediate
  NEED_PASSWORD: 331,
  NEED_ACCOUNT: 332,
  FILE_ACTION_PENDING: 350,

  // 4xx - Transient Negative
  SERVICE_UNAVAILABLE: 421,
  CANT_OPEN_DATA: 425,
  CONNECTION_CLOSED: 426,
  FILE_BUSY: 450,
  LOCAL_ERROR: 451,
  INSUFFICIENT_SPACE: 452,

  // 5xx - Permanent Negative
  SYNTAX_ERROR: 500,
  SYNTAX_ERROR_PARAMS: 501,
  NOT_IMPLEMENTED: 502,
  BAD_SEQUENCE: 503,
  NOT_IMPLEMENTED_PARAM: 504,
  NOT_LOGGED_IN: 530,
  NEED_ACCOUNT_STORE: 532,
  FILE_NOT_FOUND: 550,
  PAGE_TYPE_UNKNOWN: 551,
  EXCEEDED_ALLOCATION: 552,
  FILE_NAME_NOT_ALLOWED: 553,
} as const;

// ============================================================================
// Types
// ============================================================================

export interface FTPConfig {
  /** Hostname or IP address */
  host: string;
  /** Port number (default: 21, or 990 for implicit FTPS) */
  port?: number;
  /** Username (default: 'anonymous') */
  user?: string;
  /** Password (default: 'anonymous@') */
  password?: string;
  /** Enable FTPS: true for explicit, 'implicit' for implicit */
  secure?: boolean | 'implicit';
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** TLS options for secure connections */
  tlsOptions?: ConnectionOptions;
  /** @internal Socket factory for testing */
  _socketFactory?: () => Socket;
}

export interface FTPListItem {
  name: string;
  type: 'file' | 'directory' | 'link' | 'unknown';
  size: number;
  modifiedAt?: Date;
  permissions?: string;
  rawModifiedAt?: string;
}

export interface FTPTransferProgress {
  bytes: number;
  bytesOverall: number;
  name: string;
  type: 'upload' | 'download' | 'list';
}

export interface FTPResponse<T = void> {
  success: boolean;
  data?: T;
  code?: number;
  message?: string;
}

interface FTPReply {
  code: number;
  message: string;
}

// ============================================================================
// Native FTP Client Implementation
// ============================================================================

/**
 * Native FTP Client
 *
 * Implements the FTP protocol using only Node.js built-in modules.
 * Supports both plain FTP and FTPS (explicit and implicit TLS).
 *
 * @example
 * ```typescript
 * const client = createFTP({
 *   host: 'ftp.example.com',
 *   user: 'admin',
 *   password: 'secret'
 * });
 *
 * await client.connect();
 * const files = await client.list('/pub');
 * await client.download('/pub/file.txt', './file.txt');
 * await client.close();
 * ```
 */
export class FTP extends EventEmitter {
  private controlSocket: Socket | TLSSocket | null = null;
  private config: Required<Omit<FTPConfig, 'tlsOptions' | '_socketFactory'>> & { tlsOptions?: ConnectionOptions };
  private connected = false;
  private secureConnection = false;
  private responseBuffer = '';
  private onProgress?: (progress: FTPTransferProgress) => void;
  private currentTransferBytes = 0;
  private socketFactory: (() => Socket) | null = null;

  constructor(config: FTPConfig) {
    super();

    const isImplicit = config.secure === 'implicit';
    const defaultPort = isImplicit ? 990 : 21;

    this.config = {
      host: config.host,
      port: config.port ?? defaultPort,
      user: config.user ?? 'anonymous',
      password: config.password ?? 'anonymous@',
      secure: config.secure ?? false,
      timeout: config.timeout ?? 30000,
      verbose: config.verbose ?? false,
      tlsOptions: config.tlsOptions,
    };

    // Store socket factory for testing
    this.socketFactory = config._socketFactory ?? null;
  }

  /**
   * Create a new socket (uses factory if provided for testing)
   */
  private createSocket(): Socket {
    return this.socketFactory ? this.socketFactory() : new Socket();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Connect to the FTP server
   */
  async connect(): Promise<FTPResponse> {
    try {
      // Create control connection
      if (this.config.secure === 'implicit') {
        // Implicit FTPS - TLS from the start
        await this.connectImplicitTLS();
      } else {
        // Plain connection first
        await this.connectPlain();

        // If explicit TLS requested, upgrade connection
        if (this.config.secure === true) {
          await this.upgradeToTLS();
        }
      }

      // Wait for welcome message
      const welcome = await this.readResponse();
      this.debug('Welcome: %s', welcome.message);

      if (welcome.code !== ResponseCode.SERVICE_READY) {
        throw new Error(`Server not ready: ${welcome.message}`);
      }

      // Authenticate
      await this.authenticate();

      // Set binary mode
      await this.sendCommand('TYPE I');

      this.connected = true;

      return {
        success: true,
        message: 'Connected successfully'
      };
    } catch (error) {
      this.cleanup();
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Check if connected to FTP server
   */
  isConnected(): boolean {
    return this.connected && this.controlSocket !== null && !this.controlSocket.destroyed;
  }

  /**
   * List files in a directory
   */
  async list(path: string = '/'): Promise<FTPResponse<FTPListItem[]>> {
    this.ensureConnected();

    try {
      // Open data connection
      const dataSocket = await this.openDataConnection();

      // Send LIST command
      await this.sendCommand(`LIST ${path}`);

      // Read data
      const data = await this.readDataConnection(dataSocket);

      // Parse directory listing
      const items = this.parseDirectoryListing(data);

      return {
        success: true,
        data: items
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'List failed'
      };
    }
  }

  /**
   * Download a file from the FTP server
   */
  async download(remotePath: string, localPath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      const writeStream = createWriteStream(localPath);
      const result = await this.downloadToStream(remotePath, writeStream);
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Download failed'
      };
    }
  }

  /**
   * Download a file to a stream
   */
  async downloadToStream(remotePath: string, stream: Writable): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      // Get file size for progress
      const sizeResult = await this.size(remotePath);
      const totalSize = sizeResult.data ?? 0;

      // Open data connection
      const dataSocket = await this.openDataConnection();

      // Send RETR command
      await this.sendCommand(`RETR ${remotePath}`);

      // Stream data
      this.currentTransferBytes = 0;
      const fileName = remotePath.split('/').pop() || remotePath;

      await new Promise<void>((resolve, reject) => {
        dataSocket.on('data', (chunk: Buffer) => {
          this.currentTransferBytes += chunk.length;
          stream.write(chunk);

          if (this.onProgress) {
            this.onProgress({
              bytes: chunk.length,
              bytesOverall: this.currentTransferBytes,
              name: fileName,
              type: 'download'
            });
          }
        });

        dataSocket.on('end', () => {
          stream.end();
          resolve();
        });

        dataSocket.on('error', reject);
      });

      // Wait for transfer complete response
      const response = await this.readResponse();
      if (response.code !== ResponseCode.CLOSING_DATA_CONNECTION &&
          response.code !== ResponseCode.FILE_ACTION_OK) {
        throw new Error(response.message);
      }

      return {
        success: true,
        message: `Downloaded ${remotePath}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Download failed'
      };
    }
  }

  /**
   * Download file content as Buffer
   */
  async downloadToBuffer(remotePath: string): Promise<FTPResponse<Buffer>> {
    this.ensureConnected();

    try {
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        }
      });

      const result = await this.downloadToStream(remotePath, stream);
      if (!result.success) {
        return {
          success: false,
          message: result.message
        };
      }

      return {
        success: true,
        data: Buffer.concat(chunks)
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Download failed'
      };
    }
  }

  /**
   * Upload a file to the FTP server
   */
  async upload(localPath: string, remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      const readStream = createReadStream(localPath);
      return await this.uploadFromStream(readStream, remotePath);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload from a stream
   */
  async uploadFromStream(stream: Readable, remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      // Open data connection
      const dataSocket = await this.openDataConnection();

      // Send STOR command
      await this.sendCommand(`STOR ${remotePath}`);

      // Stream data
      this.currentTransferBytes = 0;
      const fileName = remotePath.split('/').pop() || remotePath;

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          this.currentTransferBytes += chunk.length;
          dataSocket.write(chunk);

          if (this.onProgress) {
            this.onProgress({
              bytes: chunk.length,
              bytesOverall: this.currentTransferBytes,
              name: fileName,
              type: 'upload'
            });
          }
        });

        stream.on('end', () => {
          dataSocket.end();
          resolve();
        });

        stream.on('error', reject);
        dataSocket.on('error', reject);
      });

      // Wait for transfer complete response
      const response = await this.readResponse();
      if (response.code !== ResponseCode.CLOSING_DATA_CONNECTION &&
          response.code !== ResponseCode.FILE_ACTION_OK) {
        throw new Error(response.message);
      }

      return {
        success: true,
        message: `Uploaded to ${remotePath}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload from Buffer or string
   */
  async uploadFromBuffer(data: Buffer | string, remotePath: string): Promise<FTPResponse> {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    const stream = Readable.from(buffer);
    return this.uploadFromStream(stream, remotePath);
  }

  /**
   * Delete a file
   */
  async delete(remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      const response = await this.sendCommand(`DELE ${remotePath}`);
      return {
        success: response.code === ResponseCode.FILE_ACTION_OK,
        code: response.code,
        message: response.code === ResponseCode.FILE_ACTION_OK
          ? `Deleted ${remotePath}`
          : response.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Delete failed'
      };
    }
  }

  /**
   * Create a directory
   */
  async mkdir(remotePath: string, recursive: boolean = true): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      if (recursive) {
        const parts = remotePath.split('/').filter(Boolean);
        let currentPath = '';

        for (const part of parts) {
          currentPath += '/' + part;
          try {
            await this.sendCommand(`MKD ${currentPath}`);
          } catch {
            // Directory might already exist, continue
          }
        }

        return {
          success: true,
          message: `Created directory ${remotePath}`
        };
      }

      const response = await this.sendCommand(`MKD ${remotePath}`);
      return {
        success: response.code === ResponseCode.PATHNAME_CREATED,
        code: response.code,
        message: response.code === ResponseCode.PATHNAME_CREATED
          ? `Created directory ${remotePath}`
          : response.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Mkdir failed'
      };
    }
  }

  /**
   * Remove a directory
   */
  async rmdir(remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      const response = await this.sendCommand(`RMD ${remotePath}`);
      return {
        success: response.code === ResponseCode.FILE_ACTION_OK,
        code: response.code,
        message: response.code === ResponseCode.FILE_ACTION_OK
          ? `Removed directory ${remotePath}`
          : response.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Rmdir failed'
      };
    }
  }

  /**
   * Rename/move a file
   */
  async rename(oldPath: string, newPath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      // RNFR - Rename From
      const rnfrResponse = await this.sendCommand(`RNFR ${oldPath}`);
      if (rnfrResponse.code !== ResponseCode.FILE_ACTION_PENDING) {
        throw new Error(rnfrResponse.message);
      }

      // RNTO - Rename To
      const rntoResponse = await this.sendCommand(`RNTO ${newPath}`);
      return {
        success: rntoResponse.code === ResponseCode.FILE_ACTION_OK,
        code: rntoResponse.code,
        message: rntoResponse.code === ResponseCode.FILE_ACTION_OK
          ? `Renamed ${oldPath} to ${newPath}`
          : rntoResponse.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Rename failed'
      };
    }
  }

  /**
   * Get current working directory
   */
  async pwd(): Promise<FTPResponse<string>> {
    this.ensureConnected();

    try {
      const response = await this.sendCommand('PWD');

      // Parse path from response like: 257 "/home/user" is the current directory
      const match = response.message.match(/"([^"]+)"/);
      const path = match ? match[1] : '/';

      return {
        success: true,
        data: path
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'PWD failed'
      };
    }
  }

  /**
   * Change directory
   */
  async cd(remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      const response = await this.sendCommand(`CWD ${remotePath}`);
      return {
        success: response.code === ResponseCode.FILE_ACTION_OK,
        code: response.code,
        message: response.code === ResponseCode.FILE_ACTION_OK
          ? `Changed to ${remotePath}`
          : response.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'CD failed'
      };
    }
  }

  /**
   * Get file size
   */
  async size(remotePath: string): Promise<FTPResponse<number>> {
    this.ensureConnected();

    try {
      const response = await this.sendCommand(`SIZE ${remotePath}`);
      const size = parseInt(response.message.split(' ').pop() || '0', 10);

      return {
        success: response.code === ResponseCode.FILE_STATUS,
        data: size
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Size failed'
      };
    }
  }

  /**
   * Check if file/directory exists
   */
  async exists(remotePath: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const parentPath = remotePath.split('/').slice(0, -1).join('/') || '/';
      const fileName = remotePath.split('/').pop() || '';

      const result = await this.list(parentPath);
      if (!result.success || !result.data) return false;

      return result.data.some((f) => f.name === fileName);
    } catch {
      return false;
    }
  }

  /**
   * Set progress callback
   */
  progress(callback: (progress: FTPTransferProgress) => void): this {
    this.onProgress = callback;
    return this;
  }

  /**
   * Close the FTP connection
   */
  async close(): Promise<void> {
    this.connected = false;

    if (this.controlSocket) {
      try {
        await this.sendCommand('QUIT');
      } catch {
        // Ignore errors during quit
      }
      this.cleanup();
    }
  }

  /**
   * Get the underlying socket for advanced operations
   */
  getSocket(): Socket | TLSSocket {
    if (!this.controlSocket) {
      throw new Error('Not connected. Call connect() first.');
    }
    return this.controlSocket;
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  private async connectPlain(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.createSocket();
      socket.setTimeout(this.config.timeout);

      socket.on('connect', () => {
        this.controlSocket = socket;
        resolve();
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.connect(this.config.port, this.config.host);
    });
  }

  private async connectImplicitTLS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: ConnectionOptions = {
        host: this.config.host,
        port: this.config.port,
        timeout: this.config.timeout,
        rejectUnauthorized: false,
        ...this.config.tlsOptions,
      };

      const socket = tlsConnect(options, () => {
        this.controlSocket = socket;
        this.secureConnection = true;
        resolve();
      });

      socket.on('error', reject);
      socket.setTimeout(this.config.timeout);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  private async upgradeToTLS(): Promise<void> {
    // Send AUTH TLS command
    const authResponse = await this.sendCommand('AUTH TLS');
    if (authResponse.code !== ResponseCode.AUTH_OK) {
      throw new Error(`AUTH TLS failed: ${authResponse.message}`);
    }

    // Upgrade socket to TLS
    return new Promise((resolve, reject) => {
      const options: ConnectionOptions = {
        socket: this.controlSocket as Socket,
        rejectUnauthorized: false,
        ...this.config.tlsOptions,
      };

      const tlsSocket = tlsConnect(options, () => {
        this.controlSocket = tlsSocket;
        this.secureConnection = true;
        resolve();
      });

      tlsSocket.on('error', reject);
    });
  }

  private async authenticate(): Promise<void> {
    // Send USER
    const userResponse = await this.sendCommand(`USER ${this.config.user}`);

    if (userResponse.code === ResponseCode.USER_LOGGED_IN) {
      // No password needed
      return;
    }

    if (userResponse.code !== ResponseCode.NEED_PASSWORD) {
      throw new Error(`Authentication failed: ${userResponse.message}`);
    }

    // Send PASS
    const passResponse = await this.sendCommand(`PASS ${this.config.password}`);

    if (passResponse.code !== ResponseCode.USER_LOGGED_IN) {
      throw new Error(`Authentication failed: ${passResponse.message}`);
    }

    // Enable protection if using TLS
    if (this.secureConnection) {
      await this.sendCommand('PBSZ 0');
      await this.sendCommand('PROT P');
    }
  }

  // ==========================================================================
  // Data Connection (Passive Mode)
  // ==========================================================================

  private async openDataConnection(): Promise<Socket | TLSSocket> {
    // Send PASV command
    const pasvResponse = await this.sendCommand('PASV');

    if (pasvResponse.code !== ResponseCode.ENTERING_PASSIVE) {
      throw new Error(`PASV failed: ${pasvResponse.message}`);
    }

    // Parse PASV response: 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
    const match = pasvResponse.message.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!match) {
      throw new Error('Failed to parse PASV response');
    }

    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5], 10) * 256 + parseInt(match[6], 10);

    this.debug('PASV: %s:%d', host, port);

    // Connect to data port
    return new Promise((resolve, reject) => {
      if (this.secureConnection) {
        const options: ConnectionOptions = {
          host,
          port,
          rejectUnauthorized: false,
          ...this.config.tlsOptions,
        };

        const socket = tlsConnect(options, () => {
          resolve(socket);
        });

        socket.on('error', reject);
      } else {
        const socket = this.createSocket();
        socket.on('connect', () => resolve(socket));
        socket.on('error', reject);
        socket.connect(port, host);
      }
    });
  }

  private async readDataConnection(socket: Socket | TLSSocket): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      socket.on('end', async () => {
        const data = Buffer.concat(chunks).toString('utf8');

        // Wait for transfer complete response
        try {
          const response = await this.readResponse();
          if (response.code !== ResponseCode.CLOSING_DATA_CONNECTION &&
              response.code !== ResponseCode.FILE_ACTION_OK) {
            reject(new Error(response.message));
          } else {
            resolve(data);
          }
        } catch (err) {
          reject(err);
        }
      });

      socket.on('error', reject);
    });
  }

  // ==========================================================================
  // Command/Response Handling
  // ==========================================================================

  private async sendCommand(command: string): Promise<FTPReply> {
    if (!this.controlSocket) {
      throw new Error('Not connected');
    }

    const displayCommand = command.startsWith('PASS ')
      ? 'PASS ****'
      : command;
    this.debug('>>> %s', displayCommand);

    return new Promise((resolve, reject) => {
      this.controlSocket!.write(command + '\r\n', 'utf8', async (err) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const response = await this.readResponse();

          // Check for error responses
          if (response.code >= 400) {
            reject(new Error(response.message));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async readResponse(): Promise<FTPReply> {
    return new Promise((resolve, reject) => {
      const onData = (data: Buffer) => {
        this.responseBuffer += data.toString('utf8');

        // Check for complete response
        const lines = this.responseBuffer.split('\r\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];

          // Check for final response line (3 digits + space)
          const match = line.match(/^(\d{3})([ -])(.*)/);
          if (match) {
            const code = parseInt(match[1], 10);
            const isFinal = match[2] === ' ';
            const message = match[3];

            if (isFinal) {
              // Remove processed lines from buffer
              this.responseBuffer = lines.slice(i + 1).join('\r\n');
              this.controlSocket!.removeListener('data', onData);
              this.controlSocket!.removeListener('error', onError);

              this.debug('<<< %d %s', code, message);
              resolve({ code, message: `${code} ${message}` });
              return;
            }
          }
        }
      };

      const onError = (err: Error) => {
        this.controlSocket!.removeListener('data', onData);
        reject(err);
      };

      this.controlSocket!.on('data', onData);
      this.controlSocket!.on('error', onError);

      // Check if we already have a complete response in buffer
      onData(Buffer.alloc(0));
    });
  }

  // ==========================================================================
  // Directory Listing Parser
  // ==========================================================================

  private parseDirectoryListing(data: string): FTPListItem[] {
    const lines = data.split('\r\n').filter(Boolean);
    const items: FTPListItem[] = [];

    for (const line of lines) {
      const item = this.parseListLine(line);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  private parseListLine(line: string): FTPListItem | null {
    // Try Unix format: drwxr-xr-x 2 user group 4096 Jan 1 12:00 filename
    const unixMatch = line.match(
      /^([d\-l])([rwx\-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.+)$/
    );

    if (unixMatch) {
      const typeChar = unixMatch[1];
      const permissions = unixMatch[2];
      const size = parseInt(unixMatch[3], 10);
      const rawDate = unixMatch[4];
      const name = unixMatch[5];

      return {
        name,
        type: this.mapFileType(typeChar),
        size,
        permissions,
        rawModifiedAt: rawDate,
        modifiedAt: this.parseDate(rawDate)
      };
    }

    // Try DOS format: 01-01-24 12:00PM 12345 filename
    const dosMatch = line.match(
      /^(\d{2}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}[AP]M)\s+(<DIR>|\d+)\s+(.+)$/i
    );

    if (dosMatch) {
      const date = dosMatch[1];
      const time = dosMatch[2];
      const sizeOrDir = dosMatch[3];
      const name = dosMatch[4];

      const isDir = sizeOrDir.toUpperCase() === '<DIR>';

      return {
        name,
        type: isDir ? 'directory' : 'file',
        size: isDir ? 0 : parseInt(sizeOrDir, 10),
        rawModifiedAt: `${date} ${time}`,
        modifiedAt: this.parseDosDate(date, time)
      };
    }

    // Try simple format: just filename
    if (line.trim() && !line.includes(' ')) {
      return {
        name: line.trim(),
        type: 'unknown',
        size: 0
      };
    }

    return null;
  }

  private mapFileType(typeChar: string): 'file' | 'directory' | 'link' | 'unknown' {
    switch (typeChar) {
      case '-': return 'file';
      case 'd': return 'directory';
      case 'l': return 'link';
      default: return 'unknown';
    }
  }

  private parseDate(rawDate: string): Date | undefined {
    try {
      // Format: "Jan 1 12:00" or "Jan 1 2024"
      const now = new Date();
      const parts = rawDate.trim().split(/\s+/);

      if (parts.length >= 3) {
        const month = parts[0];
        const day = parseInt(parts[1], 10);
        const timeOrYear = parts[2];

        if (timeOrYear.includes(':')) {
          // Time format - use current year
          const [hours, minutes] = timeOrYear.split(':').map(Number);
          const date = new Date(`${month} ${day} ${now.getFullYear()} ${hours}:${minutes}`);

          // If date is in future, use last year
          if (date > now) {
            date.setFullYear(date.getFullYear() - 1);
          }
          return date;
        } else {
          // Year format
          return new Date(`${month} ${day} ${timeOrYear}`);
        }
      }
    } catch {
      // Ignore parse errors
    }
    return undefined;
  }

  private parseDosDate(date: string, time: string): Date | undefined {
    try {
      const [month, day, year] = date.split('-').map(Number);
      const fullYear = year < 70 ? 2000 + year : 1900 + year;

      const timeMatch = time.match(/(\d{1,2}):(\d{2})([AP]M)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const isPM = timeMatch[3].toUpperCase() === 'PM';

        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;

        return new Date(fullYear, month - 1, day, hours, minutes);
      }
    } catch {
      // Ignore parse errors
    }
    return undefined;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private ensureConnected(): void {
    if (!this.connected || !this.controlSocket || this.controlSocket.destroyed) {
      throw new Error('Not connected to FTP server. Call connect() first.');
    }
  }

  private cleanup(): void {
    if (this.controlSocket) {
      this.controlSocket.destroy();
      this.controlSocket = null;
    }
    this.connected = false;
    this.secureConnection = false;
    this.responseBuffer = '';
  }

  private debug(format: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      console.log(`[FTP] ${format}`, ...args);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an FTP client instance
 *
 * @example
 * ```typescript
 * const client = createFTP({ host: 'ftp.example.com' });
 * await client.connect();
 * const files = await client.list();
 * await client.close();
 * ```
 */
export function createFTP(config: FTPConfig): FTP {
  return new FTP(config);
}

/**
 * Perform a one-shot FTP operation with automatic connection management
 *
 * @example
 * ```typescript
 * // Download a file
 * await ftp({ host: 'ftp.example.com' }, async (client) => {
 *   await client.download('/pub/file.txt', './file.txt');
 * });
 *
 * // List files
 * const files = await ftp({ host: 'ftp.example.com' }, async (client) => {
 *   return await client.list('/pub');
 * });
 * ```
 */
export async function ftp<T>(
  config: FTPConfig,
  operation: (client: FTP) => Promise<T>
): Promise<T> {
  const client = createFTP(config);

  try {
    const result = await client.connect();
    if (!result.success) {
      throw new Error(result.message || 'Failed to connect to FTP server');
    }

    return await operation(client);
  } finally {
    await client.close();
  }
}
