/**
 * SFTP Protocol Utility
 * Provides a simple async interface for SFTP operations using SSH
 *
 * Requires: pnpm add ssh2-sftp-client
 */

import { Readable, Writable } from 'node:stream';
import { requireOptional } from '../utils/optional-require.js';

// Type-only imports for TypeScript (these don't require the module at runtime)
import type SFTPClient from 'ssh2-sftp-client';
import type { ConnectOptions, FileInfo, FileStats } from 'ssh2-sftp-client';

/**
 * Load ssh2-sftp-client module dynamically
 */
async function loadSFTP(): Promise<typeof import('ssh2-sftp-client')> {
  return requireOptional<typeof import('ssh2-sftp-client')>(
    'ssh2-sftp-client',
    'recker/protocols/sftp'
  );
}

export interface SFTPConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  readyTimeout?: number;
  retries?: number;
  retry_factor?: number;
  retry_minTimeout?: number;
}

export interface SFTPListItem {
  name: string;
  type: 'file' | 'directory' | 'link' | 'unknown';
  size: number;
  modifyTime: number;
  accessTime: number;
  rights: {
    user: string;
    group: string;
    other: string;
  };
  owner: number;
  group: number;
}

export interface SFTPResponse<T = void> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * SFTP Client wrapper with async/await interface
 *
 * @example
 * ```typescript
 * const sftpClient = createSFTP({
 *   host: 'sftp.example.com',
 *   username: 'user',
 *   privateKey: fs.readFileSync('/path/to/key')
 * });
 *
 * await sftpClient.connect();
 * const files = await sftpClient.list('/home/user');
 * await sftpClient.download('/remote/file.txt', './local-file.txt');
 * await sftpClient.close();
 * ```
 */
export class SFTP {
  private client!: SFTPClient;
  private config: SFTPConfig;
  private connected: boolean = false;
  private initialized = false;

  constructor(config: SFTPConfig) {
    this.config = config;
  }

  /**
   * Initialize the SFTP client (lazy load ssh2-sftp-client)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const SFTPClientClass = await loadSFTP();
    this.client = new (SFTPClientClass as any).default();
    this.initialized = true;
  }

  /**
   * Connect to the SFTP server
   */
  async connect(): Promise<SFTPResponse> {
    await this.ensureInitialized();

    try {
      const options: ConnectOptions = {
        host: this.config.host,
        port: this.config.port ?? 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.privateKey,
        passphrase: this.config.passphrase,
        readyTimeout: this.config.readyTimeout ?? 20000,
        retries: this.config.retries ?? 1,
        retry_factor: this.config.retry_factor ?? 2,
        retry_minTimeout: this.config.retry_minTimeout ?? 2000,
      };

      await this.client.connect(options);
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
   * Check if connected to SFTP server
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * List files in a directory
   */
  async list(remotePath: string = '/'): Promise<SFTPResponse<SFTPListItem[]>> {
    this.ensureConnected();

    try {
      const files: FileInfo[] = await this.client.list(remotePath);

      const items: SFTPListItem[] = files.map((file) => ({
        name: file.name,
        type: this.mapFileType(file.type),
        size: file.size,
        modifyTime: file.modifyTime,
        accessTime: file.accessTime,
        rights: file.rights,
        owner: file.owner,
        group: file.group
      }));

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
   * Check if a path exists
   */
  async exists(remotePath: string): Promise<boolean | string> {
    this.ensureConnected();

    try {
      return await this.client.exists(remotePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async stat(remotePath: string): Promise<SFTPResponse<FileStats>> {
    this.ensureConnected();

    try {
      const stats = await this.client.stat(remotePath);
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Stat failed'
      };
    }
  }

  /**
   * Download a file from the SFTP server
   */
  async download(remotePath: string, localPath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.fastGet(remotePath, localPath);

      return {
        success: true,
        message: `Downloaded ${remotePath} to ${localPath}`
      };
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
  async downloadToStream(remotePath: string, stream: Writable): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.get(remotePath, stream);

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
  async downloadToBuffer(remotePath: string): Promise<SFTPResponse<Buffer>> {
    this.ensureConnected();

    try {
      const data = await this.client.get(remotePath);

      if (Buffer.isBuffer(data)) {
        return {
          success: true,
          data
        };
      }

      // If it's a string, convert to Buffer
      return {
        success: true,
        data: Buffer.from(data as string)
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Download failed'
      };
    }
  }

  /**
   * Upload a file to the SFTP server
   */
  async upload(localPath: string, remotePath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.fastPut(localPath, remotePath);

      return {
        success: true,
        message: `Uploaded ${localPath} to ${remotePath}`
      };
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
  async uploadFromStream(stream: Readable, remotePath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.put(stream, remotePath);

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
  async uploadFromBuffer(data: Buffer | string, remotePath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.put(Buffer.from(data), remotePath);

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
   * Delete a file
   */
  async delete(remotePath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.delete(remotePath);
      return {
        success: true,
        message: `Deleted ${remotePath}`
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
  async mkdir(remotePath: string, recursive: boolean = true): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.mkdir(remotePath, recursive);
      return {
        success: true,
        message: `Created directory ${remotePath}`
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
  async rmdir(remotePath: string, recursive: boolean = false): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.rmdir(remotePath, recursive);
      return {
        success: true,
        message: `Removed directory ${remotePath}`
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
  async rename(oldPath: string, newPath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.rename(oldPath, newPath);
      return {
        success: true,
        message: `Renamed ${oldPath} to ${newPath}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Rename failed'
      };
    }
  }

  /**
   * Change file permissions
   */
  async chmod(remotePath: string, mode: string | number): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.chmod(remotePath, mode);
      return {
        success: true,
        message: `Changed permissions of ${remotePath}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Chmod failed'
      };
    }
  }

  /**
   * Get current working directory
   */
  async pwd(): Promise<SFTPResponse<string>> {
    this.ensureConnected();

    try {
      const dir = await this.client.cwd();
      return {
        success: true,
        data: dir
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'PWD failed'
      };
    }
  }

  /**
   * Append data to a remote file
   */
  async append(data: Buffer | string, remotePath: string): Promise<SFTPResponse> {
    this.ensureConnected();

    try {
      await this.client.append(Buffer.from(data), remotePath);
      return {
        success: true,
        message: `Appended to ${remotePath}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Append failed'
      };
    }
  }

  /**
   * Close the SFTP connection
   */
  async close(): Promise<void> {
    this.connected = false;
    await this.client.end();
  }

  /**
   * Get the underlying ssh2-sftp-client for advanced operations
   * Note: Only available after connect() is called
   */
  getClient(): SFTPClient {
    if (!this.initialized) {
      throw new Error('Client not initialized. Call connect() first.');
    }
    return this.client;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to SFTP server. Call connect() first.');
    }
  }

  private mapFileType(type: string): 'file' | 'directory' | 'link' | 'unknown' {
    switch (type) {
      case '-':
        return 'file';
      case 'd':
        return 'directory';
      case 'l':
        return 'link';
      default:
        return 'unknown';
    }
  }
}

/**
 * Create an SFTP client instance
 *
 * @example
 * ```typescript
 * const sftpClient = createSFTP({ host: 'sftp.example.com', username: 'user' });
 * await sftpClient.connect();
 * const files = await sftpClient.list();
 * await sftpClient.close();
 * ```
 */
export function createSFTP(config: SFTPConfig): SFTP {
  return new SFTP(config);
}

/**
 * Perform a one-shot SFTP operation with automatic connection management
 *
 * @example
 * ```typescript
 * // Download a file
 * await sftp({ host: 'sftp.example.com', username: 'user', password: 'pass' }, async (client) => {
 *   await client.download('/remote/file.txt', './file.txt');
 * });
 *
 * // List files
 * const files = await sftp({ host: 'sftp.example.com', username: 'user' }, async (client) => {
 *   return await client.list('/home/user');
 * });
 * ```
 */
export async function sftp<T>(
  config: SFTPConfig,
  operation: (client: SFTP) => Promise<T>
): Promise<T> {
  const client = createSFTP(config);

  try {
    const result = await client.connect();
    if (!result.success) {
      throw new Error(result.message || 'Failed to connect to SFTP server');
    }

    return await operation(client);
  } finally {
    await client.close();
  }
}
