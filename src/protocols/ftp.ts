/**
 * FTP Protocol Utility
 * Provides a simple async interface for FTP operations
 */

import { Client as FTPClient, AccessOptions, FileInfo } from 'basic-ftp';
import { Readable, Writable } from 'node:stream';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export interface FTPConfig {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean | 'implicit';
  timeout?: number;
  verbose?: boolean;
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

/**
 * FTP Client wrapper with async/await interface
 *
 * @example
 * ```typescript
 * const ftp = createFTP({
 *   host: 'ftp.example.com',
 *   user: 'anonymous',
 *   password: 'anonymous@'
 * });
 *
 * await ftp.connect();
 * const files = await ftp.list('/pub');
 * await ftp.download('/pub/file.txt', './local-file.txt');
 * await ftp.close();
 * ```
 */
export class FTP {
  private client: FTPClient;
  private config: FTPConfig;
  private connected: boolean = false;
  private onProgress?: (progress: FTPTransferProgress) => void;

  constructor(config: FTPConfig) {
    this.config = config;
    this.client = new FTPClient(config.timeout ?? 30000);

    if (config.verbose) {
      this.client.ftp.verbose = true;
    }
  }

  /**
   * Connect to the FTP server
   */
  async connect(): Promise<FTPResponse> {
    try {
      const accessOptions: AccessOptions = {
        host: this.config.host,
        port: this.config.port ?? 21,
        user: this.config.user ?? 'anonymous',
        password: this.config.password ?? 'anonymous@',
        secure: this.config.secure ?? false,
      };

      await this.client.access(accessOptions);
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
   * Check if connected to FTP server
   */
  isConnected(): boolean {
    return this.connected && !this.client.closed;
  }

  /**
   * List files in a directory
   */
  async list(path: string = '/'): Promise<FTPResponse<FTPListItem[]>> {
    this.ensureConnected();

    try {
      const files: FileInfo[] = await this.client.list(path);

      const items: FTPListItem[] = files.map((file) => ({
        name: file.name,
        type: this.mapFileType(file.type),
        size: file.size,
        modifiedAt: file.modifiedAt,
        permissions: file.permissions?.toString(),
        rawModifiedAt: file.rawModifiedAt
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
   * Download a file from the FTP server
   */
  async download(remotePath: string, localPath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      if (this.onProgress) {
        this.client.trackProgress((info) => {
          this.onProgress?.({
            bytes: info.bytes,
            bytesOverall: info.bytesOverall,
            name: info.name,
            type: 'download'
          });
        });
      }

      await this.client.downloadTo(localPath, remotePath);
      this.client.trackProgress(); // Stop tracking

      return {
        success: true,
        message: `Downloaded ${remotePath} to ${localPath}`
      };
    } catch (error) {
      this.client.trackProgress(); // Stop tracking
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
      if (this.onProgress) {
        this.client.trackProgress((info) => {
          this.onProgress?.({
            bytes: info.bytes,
            bytesOverall: info.bytesOverall,
            name: info.name,
            type: 'download'
          });
        });
      }

      await this.client.downloadTo(stream, remotePath);
      this.client.trackProgress();

      return {
        success: true,
        message: `Downloaded ${remotePath}`
      };
    } catch (error) {
      this.client.trackProgress();
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

      await this.client.downloadTo(stream, remotePath);

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
      if (this.onProgress) {
        this.client.trackProgress((info) => {
          this.onProgress?.({
            bytes: info.bytes,
            bytesOverall: info.bytesOverall,
            name: info.name,
            type: 'upload'
          });
        });
      }

      await this.client.uploadFrom(localPath, remotePath);
      this.client.trackProgress();

      return {
        success: true,
        message: `Uploaded ${localPath} to ${remotePath}`
      };
    } catch (error) {
      this.client.trackProgress();
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
      if (this.onProgress) {
        this.client.trackProgress((info) => {
          this.onProgress?.({
            bytes: info.bytes,
            bytesOverall: info.bytesOverall,
            name: info.name,
            type: 'upload'
          });
        });
      }

      await this.client.uploadFrom(stream, remotePath);
      this.client.trackProgress();

      return {
        success: true,
        message: `Uploaded to ${remotePath}`
      };
    } catch (error) {
      this.client.trackProgress();
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
    this.ensureConnected();

    try {
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;
      const stream = Readable.from(buffer);

      await this.client.uploadFrom(stream, remotePath);

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
  async delete(remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      await this.client.remove(remotePath);
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
  async mkdir(remotePath: string, recursive: boolean = true): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      await this.client.ensureDir(remotePath);
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
  async rmdir(remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      await this.client.removeDir(remotePath);
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
  async rename(oldPath: string, newPath: string): Promise<FTPResponse> {
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
   * Get current working directory
   */
  async pwd(): Promise<FTPResponse<string>> {
    this.ensureConnected();

    try {
      const dir = await this.client.pwd();
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
   * Change directory
   */
  async cd(remotePath: string): Promise<FTPResponse> {
    this.ensureConnected();

    try {
      await this.client.cd(remotePath);
      return {
        success: true,
        message: `Changed to ${remotePath}`
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
      const size = await this.client.size(remotePath);
      return {
        success: true,
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

      const files = await this.client.list(parentPath);
      return files.some((f) => f.name === fileName);
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
    this.client.close();
  }

  /**
   * Get the underlying basic-ftp client for advanced operations
   */
  getClient(): FTPClient {
    return this.client;
  }

  private ensureConnected(): void {
    if (!this.connected || this.client.closed) {
      throw new Error('Not connected to FTP server. Call connect() first.');
    }
  }

  private mapFileType(type: number): 'file' | 'directory' | 'link' | 'unknown' {
    switch (type) {
      case 0:
        return 'unknown';
      case 1:
        return 'file';
      case 2:
        return 'directory';
      case 3:
        return 'link';
      default:
        return 'unknown';
    }
  }
}

/**
 * Create an FTP client instance
 *
 * @example
 * ```typescript
 * const ftp = createFTP({ host: 'ftp.example.com' });
 * await ftp.connect();
 * const files = await ftp.list();
 * await ftp.close();
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
