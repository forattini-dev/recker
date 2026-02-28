/**
 * Protocol MCP Tools
 *
 * Provides MCP tools for FTP, SFTP, Telnet, and WebSocket protocols.
 */

import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from './registry.js';
import { createFTP } from '../../protocols/ftp.js';
import { createSFTP } from '../../protocols/sftp.js';
import { createTelnet } from '../../protocols/telnet.js';
import { createWebSocket } from '../../websocket/client.js';
import { ProtocolError } from '../../core/errors.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: MCPTool['inputSchema'];
  handler: MCPToolHandler;
}

// ============================================================================
// FTP Tools
// ============================================================================

export const ftpConnectTool: ToolDefinition = {
  name: 'rek_ftp_connect',
  description:
    'Connect to an FTP server and list directory contents. Supports FTPS (implicit TLS).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      host: {
        type: 'string',
        description: 'FTP server hostname or IP address',
      },
      port: {
        type: 'number',
        description: 'FTP server port (default: 21)',
      },
      username: {
        type: 'string',
        description: 'Username for authentication (default: anonymous)',
      },
      password: {
        type: 'string',
        description: 'Password for authentication',
      },
      path: {
        type: 'string',
        description: 'Directory path to list (default: /)',
      },
      secure: {
        type: 'boolean',
        description: 'Use FTPS (TLS) connection',
      },
    },
    required: ['host'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const host = args.host as string;
    const port = (args.port as number) || 21;
    const username = (args.username as string) || 'anonymous';
    const password = (args.password as string) || 'anonymous@';
    const path = (args.path as string) || '/';
    const secure = args.secure as boolean | undefined;
    const ftp = createFTP({
      host,
      port,
      user: username,
      password,
      secure: secure ? 'implicit' : false,
    });

    try {
      await ftp.connect();
      const listResult = await ftp.list(path);
      await ftp.close();

      const entries = listResult.data || [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                host,
                path,
                entries: entries.map((entry) => ({
                  name: entry.name,
                  type: entry.type,
                  size: entry.size,
                  modifiedAt: entry.modifiedAt,
                  permissions: entry.permissions,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const ftpDownloadTool: ToolDefinition = {
  name: 'rek_ftp_download',
  description: 'Download a file from an FTP server and return its contents.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      host: {
        type: 'string',
        description: 'FTP server hostname or IP address',
      },
      port: {
        type: 'number',
        description: 'FTP server port (default: 21)',
      },
      username: {
        type: 'string',
        description: 'Username for authentication (default: anonymous)',
      },
      password: {
        type: 'string',
        description: 'Password for authentication',
      },
      remotePath: {
        type: 'string',
        description: 'Remote file path to download',
      },
      secure: {
        type: 'boolean',
        description: 'Use FTPS (TLS) connection',
      },
    },
    required: ['host', 'remotePath'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const host = args.host as string;
    const port = (args.port as number) || 21;
    const username = (args.username as string) || 'anonymous';
    const password = (args.password as string) || 'anonymous@';
    const remotePath = args.remotePath as string;
    const secure = args.secure as boolean | undefined;

    const ftp = createFTP({
      host,
      port,
      user: username,
      password,
      secure: secure ? 'implicit' : false,
    });

    try {
      await ftp.connect();
      const downloadResult = await ftp.downloadToBuffer(remotePath);
      await ftp.close();

      const content = downloadResult.data;
      if (!content) {
        throw new ProtocolError('Failed to download file', {
          protocol: 'ftp',
          phase: 'download',
        });
      }

      // Try to decode as text, otherwise return base64
      let textContent: string;
      let isText = true;
      try {
        textContent = content.toString('utf-8');
        // Check if it's valid UTF-8 text
        if (textContent.includes('\uFFFD')) {
          isText = false;
          textContent = content.toString('base64');
        }
      } catch {
        isText = false;
        textContent = content.toString('base64');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                host,
                remotePath,
                size: content.length,
                encoding: isText ? 'utf-8' : 'base64',
                content: textContent,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// SFTP Tools
// ============================================================================

export const sftpConnectTool: ToolDefinition = {
  name: 'rek_sftp_connect',
  description:
    'Connect to an SFTP server (SSH File Transfer Protocol) and list directory contents.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      host: {
        type: 'string',
        description: 'SFTP server hostname or IP address',
      },
      port: {
        type: 'number',
        description: 'SFTP server port (default: 22)',
      },
      username: {
        type: 'string',
        description: 'Username for authentication',
      },
      password: {
        type: 'string',
        description: 'Password for authentication',
      },
      privateKey: {
        type: 'string',
        description: 'Private key for authentication (PEM format)',
      },
      path: {
        type: 'string',
        description: 'Directory path to list (default: /)',
      },
    },
    required: ['host', 'username'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const host = args.host as string;
    const port = (args.port as number) || 22;
    const username = args.username as string;
    const password = args.password as string | undefined;
    const privateKey = args.privateKey as string | undefined;
    const path = (args.path as string) || '/';

    const sftp = createSFTP({
      host,
      port,
      username,
      password,
      privateKey,
    });

    try {
      await sftp.connect();
      const listResult = await sftp.list(path);
      await sftp.close();

      const entries = listResult.data || [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                host,
                path,
                entries: entries.map((entry) => ({
                  name: entry.name,
                  type: entry.type,
                  size: entry.size,
                  modifyTime: entry.modifyTime,
                  accessTime: entry.accessTime,
                  rights: entry.rights,
                  owner: entry.owner,
                  group: entry.group,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

export const sftpDownloadTool: ToolDefinition = {
  name: 'rek_sftp_download',
  description: 'Download a file from an SFTP server and return its contents.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      host: {
        type: 'string',
        description: 'SFTP server hostname or IP address',
      },
      port: {
        type: 'number',
        description: 'SFTP server port (default: 22)',
      },
      username: {
        type: 'string',
        description: 'Username for authentication',
      },
      password: {
        type: 'string',
        description: 'Password for authentication',
      },
      privateKey: {
        type: 'string',
        description: 'Private key for authentication (PEM format)',
      },
      remotePath: {
        type: 'string',
        description: 'Remote file path to download',
      },
    },
    required: ['host', 'username', 'remotePath'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const host = args.host as string;
    const port = (args.port as number) || 22;
    const username = args.username as string;
    const password = args.password as string | undefined;
    const privateKey = args.privateKey as string | undefined;
    const remotePath = args.remotePath as string;

    const sftp = createSFTP({
      host,
      port,
      username,
      password,
      privateKey,
    });

    try {
      await sftp.connect();
      const downloadResult = await sftp.downloadToBuffer(remotePath);
      await sftp.close();

      const content = downloadResult.data;
      if (!content) {
        throw new ProtocolError('Failed to download file', {
          protocol: 'sftp',
          phase: 'download',
        });
      }

      // Try to decode as text, otherwise return base64
      let textContent: string;
      let isText = true;
      try {
        textContent = content.toString('utf-8');
        if (textContent.includes('\uFFFD')) {
          isText = false;
          textContent = content.toString('base64');
        }
      } catch {
        isText = false;
        textContent = content.toString('base64');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                host,
                remotePath,
                size: content.length,
                encoding: isText ? 'utf-8' : 'base64',
                content: textContent,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// Telnet Tools
// ============================================================================

export const telnetConnectTool: ToolDefinition = {
  name: 'rek_telnet_connect',
  description:
    'Connect to a Telnet server, send commands, and receive responses. Useful for debugging network services.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      host: {
        type: 'string',
        description: 'Telnet server hostname or IP address',
      },
      port: {
        type: 'number',
        description: 'Telnet server port (default: 23)',
      },
      commands: {
        type: 'array',
        items: { type: 'string' },
        description: 'Commands to send to the server',
      },
      timeout: {
        type: 'number',
        description: 'Connection timeout in milliseconds (default: 10000)',
      },
      username: {
        type: 'string',
        description: 'Username for login (if required)',
      },
      password: {
        type: 'string',
        description: 'Password for login (if required)',
      },
    },
    required: ['host'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const host = args.host as string;
    const port = (args.port as number) || 23;
    const commands = (args.commands as string[]) || [];
    const timeout = (args.timeout as number) || 10000;
    const username = args.username as string | undefined;
    const password = args.password as string | undefined;

    const telnet = createTelnet({
      host,
      port,
      timeout,
      username,
      password,
    });

    try {
      await telnet.connect();

      const responses: string[] = [];

      // Send commands
      for (const cmd of commands) {
        const result = await telnet.send(cmd, { timeout: 5000 });
        if (result.data) {
          responses.push(result.data);
        }
      }

      await telnet.close();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                host,
                port,
                responses,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// WebSocket Tools
// ============================================================================

export const websocketConnectTool: ToolDefinition = {
  name: 'rek_websocket_connect',
  description:
    'Connect to a WebSocket server, send messages, and receive responses.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'WebSocket server URL (ws:// or wss://)',
      },
      messages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Messages to send to the server',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers to send with the connection',
      },
      timeout: {
        type: 'number',
        description: 'Message receive timeout in milliseconds (default: 5000)',
      },
      maxMessages: {
        type: 'number',
        description: 'Maximum number of messages to receive (default: 10)',
      },
    },
    required: ['url'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const messages = (args.messages as string[]) || [];
    const headers = (args.headers as Record<string, string>) || {};
    const timeout = (args.timeout as number) || 5000;
    const maxMessages = (args.maxMessages as number) || 10;

    const ws = createWebSocket(url, {
      headers,
    });

    const receivedMessages: Array<{
      type: string;
      data: unknown;
      timestamp: string;
    }> = [];

    return new Promise((resolve) => {
      let messageCount = 0;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeoutId);
        ws.close();
      };

      const finalize = () => {
        cleanup();
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  url,
                  messagesSent: messages.length,
                  messagesReceived: receivedMessages.length,
                  messages: receivedMessages,
                },
                null,
                2
              ),
            },
          ],
        });
      };

      ws.on('open', () => {
        // Send all messages
        for (const msg of messages) {
          ws.send(msg);
        }

        // Set timeout for receiving messages
        timeoutId = setTimeout(finalize, timeout);
      });

      ws.on('message', (data) => {
        messageCount++;
        receivedMessages.push({
          type: typeof data === 'string' ? 'text' : 'binary',
          data: typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('base64'),
          timestamp: new Date().toISOString(),
        });

        if (messageCount >= maxMessages) {
          finalize();
        }
      });

      ws.on('error', (error) => {
        cleanup();
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
      });

      ws.on('close', () => {
        if (receivedMessages.length > 0 || messages.length === 0) {
          finalize();
        }
      });

      // Connect
      ws.connect();
    });
  },
};

export const websocketPingTool: ToolDefinition = {
  name: 'rek_websocket_ping',
  description:
    'Test WebSocket server connectivity by connecting and measuring response time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'WebSocket server URL (ws:// or wss://)',
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Custom headers to send with the connection',
      },
      timeout: {
        type: 'number',
        description: 'Connection timeout in milliseconds (default: 5000)',
      },
    },
    required: ['url'],
  },
  handler: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const url = args.url as string;
    const headers = (args.headers as Record<string, string>) || {};
    const timeout = (args.timeout as number) || 5000;

    const startTime = Date.now();

    const ws = createWebSocket(url, {
      headers,
    });

    return new Promise((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout>;

      timeoutId = setTimeout(() => {
        ws.close();
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: 'Connection timeout',
                  url,
                  timeout,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
      }, timeout);

      ws.on('open', () => {
        const connectTime = Date.now() - startTime;
        clearTimeout(timeoutId);
        ws.close();

        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  url,
                  connected: true,
                  connectTimeMs: connectTime,
                },
                null,
                2
              ),
            },
          ],
        });
      });

      ws.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  url,
                  error: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
      });

      ws.connect();
    });
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const protocolTools: ToolDefinition[] = [
  ftpConnectTool,
  ftpDownloadTool,
  sftpConnectTool,
  sftpDownloadTool,
  telnetConnectTool,
  websocketConnectTool,
  websocketPingTool,
];
