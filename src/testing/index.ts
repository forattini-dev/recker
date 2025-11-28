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
