/**
 * Recker Testing Utilities
 *
 * Provides mocking and testing helpers for Recker HTTP client
 *
 * @example
 * ```typescript
 * import { createMockClient, MockTransport } from 'recker/testing';
 * import { createClient } from 'recker';
 *
 * // Option 1: Use createMockClient helper
 * const { mock, transport } = createMockClient();
 * mock.get('/users').reply(200, [{ id: 1 }]);
 *
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 *   transport
 * });
 *
 * // Option 2: Use MockTransport directly
 * const mockTransport = new MockTransport();
 * mockTransport.getMock().get('/data').reply(200, { ok: true });
 *
 * // Option 3: Global mock with undici MockAgent
 * import { installGlobalMock, uninstallGlobalMock } from 'recker/testing';
 *
 * beforeEach(() => {
 *   const agent = installGlobalMock();
 *   agent.get('https://api.example.com').intercept({ path: '/users' }).reply(200, []);
 * });
 *
 * afterEach(() => {
 *   uninstallGlobalMock();
 * });
 * ```
 */

export {
  MockClient,
  MockTransport,
  createMockClient,
  installGlobalMock,
  uninstallGlobalMock,
  MockAgent,
} from './mock.js';

export type {
  MockResponseOptions,
  MockInterceptOptions,
} from './mock.js';

// UDP Testing
export {
  MockUDPServer,
  createMockUDPServer,
} from './mock-udp-server.js';

export type {
  MockUDPServerOptions,
  ReceivedMessage,
} from './mock-udp-server.js';

// HLS Testing
export {
  MockHlsServer,
  createMockHlsVod,
  createMockHlsLive,
  createMockHlsMultiQuality,
} from './mock-hls-server.js';

export type {
  MockHlsServerOptions,
  MockHlsVariant,
  MockHlsSegment,
  MockHlsStats,
} from './mock-hls-server.js';

// WebSocket Testing
export {
  MockWebSocketServer,
  createMockWebSocketServer,
} from './mock-websocket-server.js';

export type {
  MockWebSocketServerOptions,
  MockWebSocketClient,
  MockWebSocketMessage,
  MockWebSocketStats,
} from './mock-websocket-server.js';

// SSE Testing
export {
  MockSSEServer,
  createMockSSEServer,
} from './mock-sse-server.js';

export type {
  MockSSEServerOptions,
  SSEEvent,
  MockSSEClient,
  MockSSEStats,
} from './mock-sse-server.js';

// HTTP Testing
export {
  MockHttpServer,
  createMockHttpServer,
} from './mock-http-server.js';

export type {
  MockHttpServerOptions,
  MockHttpResponse,
  MockHttpRequest,
  MockHttpHandler,
  MockHttpStats,
} from './mock-http-server.js';

// DNS Testing
export {
  MockDnsServer,
} from './mock-dns-server.js';

export type {
  MockDnsServerOptions,
  DnsRecordType,
  DnsRecord,
  DnsMxRecord,
  DnsSoaRecord,
  DnsSrvRecord,
  MockDnsStats,
} from './mock-dns-server.js';

// WHOIS Testing
export {
  MockWhoisServer,
} from './mock-whois-server.js';

export type {
  MockWhoisServerOptions,
  WhoisDomainData,
  MockWhoisStats,
} from './mock-whois-server.js';

// Telnet Testing
export {
  MockTelnetServer,
} from './mock-telnet-server.js';

export type {
  MockTelnetServerOptions,
  CommandHandler,
  TelnetSession,
  MockTelnetStats,
} from './mock-telnet-server.js';

// FTP Testing
export {
  MockFtpServer,
} from './mock-ftp-server.js';

export type {
  MockFtpServerOptions,
  VirtualFile,
  FtpSession,
  MockFtpStats,
} from './mock-ftp-server.js';
