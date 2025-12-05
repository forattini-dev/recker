/**
 * Mock FTP Server
 *
 * A lightweight FTP server for testing FTP clients.
 * Supports basic FTP commands and virtual file system.
 *
 * @example
 * ```typescript
 * import { MockFtpServer } from 'recker/testing';
 *
 * const server = await MockFtpServer.create({ port: 2121 });
 *
 * // Add virtual files
 * server.addFile('/test.txt', 'Hello, World!');
 * server.addFile('/data/config.json', JSON.stringify({ key: 'value' }));
 *
 * // Connect: ftp localhost 2121
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import * as net from 'node:net';

// ============================================
// Types
// ============================================

export interface MockFtpServerOptions {
  /**
   * Port to listen on (control connection)
   * @default 2121
   */
  port?: number;

  /**
   * Host to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Anonymous login allowed
   * @default true
   */
  anonymous?: boolean;

  /**
   * Username for authenticated access
   * @default 'user'
   */
  username?: string;

  /**
   * Password for authenticated access
   * @default 'pass'
   */
  password?: string;

  /**
   * Welcome message
   * @default 'Welcome to Recker Mock FTP Server'
   */
  welcomeMessage?: string;

  /**
   * Response delay in ms
   * @default 0
   */
  delay?: number;
}

export interface VirtualFile {
  content: string | Buffer;
  size: number;
  modified: Date;
  isDirectory: boolean;
}

export interface FtpSession {
  id: string;
  socket: net.Socket;
  authenticated: boolean;
  username: string | null;
  currentDir: string;
  transferMode: 'ASCII' | 'BINARY';
  passiveSocket: net.Server | null;
  connectedAt: Date;
}

export interface MockFtpStats {
  connectionsTotal: number;
  commandsReceived: number;
  filesDownloaded: number;
  filesUploaded: number;
  bytesTransferred: number;
  commandLog: Array<{ command: string; sessionId: string; timestamp: number }>;
}

// ============================================
// MockFtpServer
// ============================================

export class MockFtpServer extends EventEmitter {
  private options: Required<MockFtpServerOptions>;
  private server: net.Server | null = null;
  private sessions: Map<string, FtpSession> = new Map();
  private files: Map<string, VirtualFile> = new Map();
  private started = false;
  private sessionCounter = 0;
  private dataPortCounter = 30000;
  private stats: MockFtpStats = {
    connectionsTotal: 0,
    commandsReceived: 0,
    filesDownloaded: 0,
    filesUploaded: 0,
    bytesTransferred: 0,
    commandLog: [],
  };

  constructor(options: MockFtpServerOptions = {}) {
    super();

    this.options = {
      port: 2121,
      host: '127.0.0.1',
      anonymous: true,
      username: 'user',
      password: 'pass',
      welcomeMessage: 'Welcome to Recker Mock FTP Server',
      delay: 0,
      ...options,
    };

    // Add default directories
    this.addDefaultFiles();
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
    return `ftp://${this.options.host}:${this.options.port}`;
  }

  get statistics(): MockFtpStats {
    return { ...this.stats };
  }

  // ============================================
  // File System Management
  // ============================================

  /**
   * Add a virtual file
   */
  addFile(path: string, content: string | Buffer): void {
    const normalizedPath = this.normalizePath(path);
    const data = typeof content === 'string' ? content : content;
    this.files.set(normalizedPath, {
      content: data,
      size: typeof content === 'string' ? Buffer.byteLength(content) : content.length,
      modified: new Date(),
      isDirectory: false,
    });

    // Ensure parent directories exist
    const parts = normalizedPath.split('/').filter(Boolean);
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += '/' + parts[i];
      if (!this.files.has(currentPath)) {
        this.files.set(currentPath, {
          content: '',
          size: 0,
          modified: new Date(),
          isDirectory: true,
        });
      }
    }
  }

  /**
   * Add a virtual directory
   */
  addDirectory(path: string): void {
    const normalizedPath = this.normalizePath(path);
    this.files.set(normalizedPath, {
      content: '',
      size: 0,
      modified: new Date(),
      isDirectory: true,
    });
  }

  /**
   * Remove a file or directory
   */
  removeFile(path: string): boolean {
    return this.files.delete(this.normalizePath(path));
  }

  /**
   * Get file content
   */
  getFile(path: string): VirtualFile | undefined {
    return this.files.get(this.normalizePath(path));
  }

  /**
   * List directory contents
   */
  listDirectory(path: string): string[] {
    const normalizedPath = this.normalizePath(path);
    const prefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    const entries: string[] = [];

    for (const [filePath] of this.files) {
      if (filePath.startsWith(prefix) && filePath !== normalizedPath) {
        const relative = filePath.substring(prefix.length);
        const firstPart = relative.split('/')[0];
        if (firstPart && !entries.includes(firstPart)) {
          entries.push(firstPart);
        }
      }
    }

    return entries.sort();
  }

  /**
   * Clear all files
   */
  clearFiles(): void {
    this.files.clear();
    this.addDefaultFiles();
  }

  private normalizePath(path: string): string {
    let normalized = path.replace(/\/+/g, '/');
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  private addDefaultFiles(): void {
    // Root directory
    this.addDirectory('/');

    // Sample files
    this.addFile('/welcome.txt', 'Welcome to the FTP server!\nThis is a test file.');
    this.addFile('/readme.md', '# Mock FTP Server\n\nThis is a mock FTP server for testing.');
    this.addDirectory('/data');
    this.addFile('/data/sample.json', JSON.stringify({ message: 'Hello', count: 42 }, null, 2));
    this.addFile('/data/config.txt', 'host=localhost\nport=8080\ndebug=true');
    this.addDirectory('/public');
    this.addFile('/public/index.html', '<html><body><h1>Public Files</h1></body></html>');
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
      session.passiveSocket?.close();
      session.socket.end();
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
      commandsReceived: 0,
      filesDownloaded: 0,
      filesUploaded: 0,
      bytesTransferred: 0,
      commandLog: [],
    };
    this.clearFiles();
    this.emit('reset');
  }

  // ============================================
  // Connection Handling
  // ============================================

  private handleConnection(socket: net.Socket): void {
    const sessionId = `ftp-${++this.sessionCounter}`;
    const session: FtpSession = {
      id: sessionId,
      socket,
      authenticated: false,
      username: null,
      currentDir: '/',
      transferMode: 'BINARY',
      passiveSocket: null,
      connectedAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.stats.connectionsTotal++;

    this.emit('connect', session);

    // Send welcome message
    this.sendResponse(socket, 220, this.options.welcomeMessage);

    let inputBuffer = '';

    socket.on('data', async (data) => {
      inputBuffer += data.toString('utf8');

      // Process complete lines
      while (inputBuffer.includes('\r\n')) {
        const lineEnd = inputBuffer.indexOf('\r\n');
        const line = inputBuffer.substring(0, lineEnd);
        inputBuffer = inputBuffer.substring(lineEnd + 2);

        if (line) {
          await this.handleCommand(line, session);
        }
      }
    });

    socket.on('close', () => {
      session.passiveSocket?.close();
      this.sessions.delete(sessionId);
      this.emit('disconnect', session);
    });

    socket.on('error', (err) => {
      this.emit('error', err, session);
      this.sessions.delete(sessionId);
    });
  }

  private async handleCommand(line: string, session: FtpSession): Promise<void> {
    this.stats.commandsReceived++;

    const spaceIndex = line.indexOf(' ');
    const command = (spaceIndex > 0 ? line.substring(0, spaceIndex) : line).toUpperCase();
    const args = spaceIndex > 0 ? line.substring(spaceIndex + 1) : '';

    this.stats.commandLog.push({
      command: line,
      sessionId: session.id,
      timestamp: Date.now(),
    });

    this.emit('command', command, args, session);

    // Apply delay
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    // Handle commands
    switch (command) {
      case 'USER':
        this.handleUser(args, session);
        break;
      case 'PASS':
        this.handlePass(args, session);
        break;
      case 'SYST':
        this.sendResponse(session.socket, 215, 'UNIX Type: L8');
        break;
      case 'FEAT':
        this.sendMultilineResponse(session.socket, 211, ['Features:', ' PASV', ' SIZE', ' UTF8', 'End']);
        break;
      case 'PWD':
      case 'XPWD':
        this.sendResponse(session.socket, 257, `"${session.currentDir}" is current directory`);
        break;
      case 'CWD':
      case 'XCWD':
        this.handleCwd(args, session);
        break;
      case 'CDUP':
      case 'XCUP':
        this.handleCdup(session);
        break;
      case 'TYPE':
        this.handleType(args, session);
        break;
      case 'PASV':
        await this.handlePasv(session);
        break;
      case 'LIST':
        await this.handleList(args, session);
        break;
      case 'NLST':
        await this.handleNlst(args, session);
        break;
      case 'RETR':
        await this.handleRetr(args, session);
        break;
      case 'STOR':
        await this.handleStor(args, session);
        break;
      case 'SIZE':
        this.handleSize(args, session);
        break;
      case 'MDTM':
        this.handleMdtm(args, session);
        break;
      case 'MKD':
      case 'XMKD':
        this.handleMkd(args, session);
        break;
      case 'RMD':
      case 'XRMD':
        this.handleRmd(args, session);
        break;
      case 'DELE':
        this.handleDele(args, session);
        break;
      case 'NOOP':
        this.sendResponse(session.socket, 200, 'NOOP ok');
        break;
      case 'QUIT':
        this.sendResponse(session.socket, 221, 'Goodbye');
        session.socket.end();
        break;
      default:
        this.sendResponse(session.socket, 502, `Command not implemented: ${command}`);
    }
  }

  // ============================================
  // Command Handlers
  // ============================================

  private handleUser(username: string, session: FtpSession): void {
    session.username = username;
    if (this.options.anonymous && (username.toLowerCase() === 'anonymous' || username.toLowerCase() === 'ftp')) {
      session.authenticated = true;
      this.sendResponse(session.socket, 230, 'Anonymous access granted');
    } else {
      this.sendResponse(session.socket, 331, 'Password required');
    }
  }

  private handlePass(password: string, session: FtpSession): void {
    if (session.authenticated) {
      this.sendResponse(session.socket, 230, 'Already logged in');
      return;
    }

    if (session.username === this.options.username && password === this.options.password) {
      session.authenticated = true;
      this.sendResponse(session.socket, 230, 'Login successful');
    } else if (this.options.anonymous && session.username?.toLowerCase() === 'anonymous') {
      session.authenticated = true;
      this.sendResponse(session.socket, 230, 'Anonymous access granted');
    } else {
      this.sendResponse(session.socket, 530, 'Login incorrect');
    }
  }

  private handleCwd(path: string, session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    const newPath = this.resolvePath(path, session.currentDir);
    const dir = this.files.get(newPath);

    if (dir && dir.isDirectory) {
      session.currentDir = newPath;
      this.sendResponse(session.socket, 250, 'Directory changed');
    } else {
      this.sendResponse(session.socket, 550, 'Directory not found');
    }
  }

  private handleCdup(session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    if (session.currentDir !== '/') {
      const parts = session.currentDir.split('/').filter(Boolean);
      parts.pop();
      session.currentDir = '/' + parts.join('/') || '/';
    }
    this.sendResponse(session.socket, 250, 'Directory changed');
  }

  private handleType(type: string, session: FtpSession): void {
    const mode = type.toUpperCase();
    if (mode === 'A' || mode === 'A N') {
      session.transferMode = 'ASCII';
      this.sendResponse(session.socket, 200, 'Type set to ASCII');
    } else if (mode === 'I' || mode === 'L 8') {
      session.transferMode = 'BINARY';
      this.sendResponse(session.socket, 200, 'Type set to Binary');
    } else {
      this.sendResponse(session.socket, 504, 'Type not supported');
    }
  }

  private async handlePasv(session: FtpSession): Promise<void> {
    if (!this.requireAuth(session)) return;

    // Close existing passive socket
    session.passiveSocket?.close();

    const dataPort = this.dataPortCounter++;
    if (this.dataPortCounter > 32000) this.dataPortCounter = 30000;

    return new Promise((resolve) => {
      session.passiveSocket = net.createServer();
      session.passiveSocket.listen(dataPort, this.options.host, () => {
        const p1 = Math.floor(dataPort / 256);
        const p2 = dataPort % 256;
        const hostParts = this.options.host.split('.');
        this.sendResponse(
          session.socket,
          227,
          `Entering Passive Mode (${hostParts.join(',')},${p1},${p2})`
        );
        resolve();
      });
    });
  }

  private async handleList(path: string, session: FtpSession): Promise<void> {
    if (!this.requireAuth(session)) return;

    const targetPath = path ? this.resolvePath(path, session.currentDir) : session.currentDir;
    const entries = this.listDirectory(targetPath);

    this.sendResponse(session.socket, 150, 'Opening data connection');

    const dataSocket = await this.waitForDataConnection(session);
    if (!dataSocket) {
      this.sendResponse(session.socket, 425, 'No data connection');
      return;
    }

    const lines: string[] = [];
    for (const entry of entries) {
      const entryPath = targetPath === '/' ? `/${entry}` : `${targetPath}/${entry}`;
      const file = this.files.get(entryPath);
      if (file) {
        const type = file.isDirectory ? 'd' : '-';
        const size = file.size.toString().padStart(8);
        const date = file.modified.toISOString().substring(0, 10);
        lines.push(`${type}rw-r--r-- 1 user group ${size} ${date} ${entry}`);
      }
    }

    dataSocket.write(lines.join('\r\n') + '\r\n');
    dataSocket.end();

    this.sendResponse(session.socket, 226, 'Transfer complete');
  }

  private async handleNlst(path: string, session: FtpSession): Promise<void> {
    if (!this.requireAuth(session)) return;

    const targetPath = path ? this.resolvePath(path, session.currentDir) : session.currentDir;
    const entries = this.listDirectory(targetPath);

    this.sendResponse(session.socket, 150, 'Opening data connection');

    const dataSocket = await this.waitForDataConnection(session);
    if (!dataSocket) {
      this.sendResponse(session.socket, 425, 'No data connection');
      return;
    }

    dataSocket.write(entries.join('\r\n') + '\r\n');
    dataSocket.end();

    this.sendResponse(session.socket, 226, 'Transfer complete');
  }

  private async handleRetr(filename: string, session: FtpSession): Promise<void> {
    if (!this.requireAuth(session)) return;

    const filePath = this.resolvePath(filename, session.currentDir);
    const file = this.files.get(filePath);

    if (!file || file.isDirectory) {
      this.sendResponse(session.socket, 550, 'File not found');
      return;
    }

    this.sendResponse(session.socket, 150, 'Opening data connection');

    const dataSocket = await this.waitForDataConnection(session);
    if (!dataSocket) {
      this.sendResponse(session.socket, 425, 'No data connection');
      return;
    }

    const content = typeof file.content === 'string' ? Buffer.from(file.content) : file.content;
    dataSocket.write(content);
    dataSocket.end();

    this.stats.filesDownloaded++;
    this.stats.bytesTransferred += content.length;

    this.sendResponse(session.socket, 226, 'Transfer complete');
  }

  private async handleStor(filename: string, session: FtpSession): Promise<void> {
    if (!this.requireAuth(session)) return;

    const filePath = this.resolvePath(filename, session.currentDir);

    this.sendResponse(session.socket, 150, 'Opening data connection');

    const dataSocket = await this.waitForDataConnection(session);
    if (!dataSocket) {
      this.sendResponse(session.socket, 425, 'No data connection');
      return;
    }

    const chunks: Buffer[] = [];
    dataSocket.on('data', (chunk) => {
      chunks.push(chunk);
    });

    dataSocket.on('end', () => {
      const content = Buffer.concat(chunks);
      this.addFile(filePath, content);
      this.stats.filesUploaded++;
      this.stats.bytesTransferred += content.length;
      this.sendResponse(session.socket, 226, 'Transfer complete');
    });
  }

  private handleSize(filename: string, session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    const filePath = this.resolvePath(filename, session.currentDir);
    const file = this.files.get(filePath);

    if (!file || file.isDirectory) {
      this.sendResponse(session.socket, 550, 'File not found');
    } else {
      this.sendResponse(session.socket, 213, file.size.toString());
    }
  }

  private handleMdtm(filename: string, session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    const filePath = this.resolvePath(filename, session.currentDir);
    const file = this.files.get(filePath);

    if (!file) {
      this.sendResponse(session.socket, 550, 'File not found');
    } else {
      const date = file.modified.toISOString().replace(/[-:T]/g, '').substring(0, 14);
      this.sendResponse(session.socket, 213, date);
    }
  }

  private handleMkd(dirname: string, session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    const dirPath = this.resolvePath(dirname, session.currentDir);
    this.addDirectory(dirPath);
    this.sendResponse(session.socket, 257, `"${dirPath}" created`);
  }

  private handleRmd(dirname: string, session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    const dirPath = this.resolvePath(dirname, session.currentDir);
    if (this.removeFile(dirPath)) {
      this.sendResponse(session.socket, 250, 'Directory removed');
    } else {
      this.sendResponse(session.socket, 550, 'Directory not found');
    }
  }

  private handleDele(filename: string, session: FtpSession): void {
    if (!this.requireAuth(session)) return;

    const filePath = this.resolvePath(filename, session.currentDir);
    if (this.removeFile(filePath)) {
      this.sendResponse(session.socket, 250, 'File deleted');
    } else {
      this.sendResponse(session.socket, 550, 'File not found');
    }
  }

  // ============================================
  // Helpers
  // ============================================

  private requireAuth(session: FtpSession): boolean {
    if (!session.authenticated) {
      this.sendResponse(session.socket, 530, 'Please login first');
      return false;
    }
    return true;
  }

  private resolvePath(path: string, currentDir: string): string {
    if (path.startsWith('/')) {
      return this.normalizePath(path);
    }
    return this.normalizePath(currentDir + '/' + path);
  }

  private sendResponse(socket: net.Socket, code: number, message: string): void {
    socket.write(`${code} ${message}\r\n`);
  }

  private sendMultilineResponse(socket: net.Socket, code: number, lines: string[]): void {
    for (let i = 0; i < lines.length - 1; i++) {
      socket.write(`${code}-${lines[i]}\r\n`);
    }
    socket.write(`${code} ${lines[lines.length - 1]}\r\n`);
  }

  private async waitForDataConnection(session: FtpSession): Promise<net.Socket | null> {
    if (!session.passiveSocket) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        session.passiveSocket?.close();
        resolve(null);
      }, 5000);

      session.passiveSocket!.once('connection', (socket) => {
        clearTimeout(timeout);
        session.passiveSocket!.close();
        session.passiveSocket = null;
        resolve(socket);
      });
    });
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockFtpServerOptions = {}): Promise<MockFtpServer> {
    const server = new MockFtpServer(options);
    await server.start();
    return server;
  }
}
