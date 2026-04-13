import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type AddressInfo, type Server } from 'node:net';

import {
  UnsupportedError,
  createClient,
  createRedDbClient,
  recker,
} from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

const MSG_QUERY = 0x01;
const MSG_RESULT = 0x02;
const MSG_ERROR = 0x03;
const MSG_BULK_INSERT = 0x04;
const MSG_BULK_OK = 0x05;

function encodeFrame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt32LE(1 + payload.length, 0);
  header[4] = type;
  return Buffer.concat([header, payload]);
}

async function createMockWireServer(options: {
  onQuery?: (sql: string) => unknown;
  onBulkInsert?: (collection: string, payloads: string[]) => number;
} = {}) {
  const queries: string[] = [];
  const bulkInserts: Array<{ collection: string; payloads: string[] }> = [];

  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 5) {
        const totalLength = buffer.readUInt32LE(0);
        const frameSize = 4 + totalLength;
        if (buffer.length < frameSize) {
          return;
        }

        const type = buffer[4]!;
        const payload = buffer.slice(5, frameSize);
        buffer = buffer.slice(frameSize);

        if (type === MSG_QUERY) {
          const sql = payload.toString('utf8');
          queries.push(sql);
          const body = options.onQuery
            ? options.onQuery(sql)
            : {
                ok: true,
                record_count: 1,
                result: {
                  columns: ['value'],
                  records: [{ value: sql }],
                  stats: {
                    rows_scanned: 1,
                    exec_time_us: 11,
                  },
                },
              };
          socket.write(encodeFrame(MSG_RESULT, Buffer.from(JSON.stringify(body), 'utf8')));
          continue;
        }

        if (type === MSG_BULK_INSERT) {
          let offset = 0;
          const collectionLength = payload.readUInt16LE(offset);
          offset += 2;
          const collection = payload.slice(offset, offset + collectionLength).toString('utf8');
          offset += collectionLength;
          const count = payload.readUInt32LE(offset);
          offset += 4;
          const payloads: string[] = [];

          for (let index = 0; index < count; index++) {
            const jsonLength = payload.readUInt32LE(offset);
            offset += 4;
            payloads.push(payload.slice(offset, offset + jsonLength).toString('utf8'));
            offset += jsonLength;
          }

          bulkInserts.push({ collection, payloads });
          const inserted = options.onBulkInsert ? options.onBulkInsert(collection, payloads) : payloads.length;
          const reply = Buffer.alloc(8);
          reply.writeBigUInt64LE(BigInt(inserted), 0);
          socket.write(encodeFrame(MSG_BULK_OK, reply));
          continue;
        }

        socket.write(encodeFrame(MSG_ERROR, Buffer.from(`unsupported mock wire type ${type}`, 'utf8')));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    address: `127.0.0.1:${address.port}`,
    queries,
    bulkInserts,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

describe('RedDB protocol client', () => {
  let mockTransport: MockTransport;
  let wireServer: Awaited<ReturnType<typeof createMockWireServer>> | null;

  beforeEach(() => {
    mockTransport = new MockTransport();
    wireServer = null;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (wireServer) {
      await wireServer.close();
    }
    recker.reset();
  });

  it('exposes the factory through the unified namespace', () => {
    expect(typeof recker.reddb).toBe('function');
  });

  it('reports configured capabilities', () => {
    const client = createRedDbClient({
      baseUrl: 'http://127.0.0.1:8080',
      wireAddress: '127.0.0.1:5050',
      transport: 'auto',
    });

    expect(client.getCapabilities()).toEqual({
      requestedTransport: 'auto',
      allowTransportFallback: true,
      availableTransports: {
        http: true,
        wire: true,
        grpc: false,
      },
      native: {
        query: true,
        batchQuery: false,
        scan: true,
        bulkInsertRows: true,
        bulkInsertBinary: false,
        stats: true,
        ensureCollection: true,
        ensureIndex: true,
        warmupIndex: true,
      },
      emulated: {
        batchQuery: true,
        bulkInsertBinary: true,
      },
    });
  });

  it('runs HTTP queries and exposes parsed metrics', async () => {
    mockTransport.setMockResponse('POST', '/query', 200, {
      ok: true,
      record_count: 1,
      affected_rows: 0,
      result: {
        columns: ['name'],
        records: [{ name: 'alice' }],
        stats: {
          rows_scanned: 2,
          exec_time_us: 44,
        },
      },
    });

    const httpClient = createClient({
      baseUrl: 'https://reddb.example.com',
      transport: mockTransport,
    });

    const client = createRedDbClient({
      client: httpClient,
      transport: 'http',
    });

    const result = await client.query('SELECT name FROM users');

    expect(result.transport).toBe('http');
    expect(result.degradedFromRequestedTransport).toBe(false);
    expect(result.data.record_count).toBe(1);
    expect(result.metrics.rowsScanned).toBe(2);
    expect(result.metrics.execTimeUs).toBe(44);
  });

  it('falls back from grpc to http explicitly when grpc is requested', async () => {
    mockTransport.setMockResponse('POST', '/query', 200, {
      ok: true,
      record_count: 1,
      result: {
        columns: ['value'],
        records: [{ value: 1 }],
        stats: {
          rows_scanned: 1,
          exec_time_us: 10,
        },
      },
    });

    const httpClient = createClient({
      baseUrl: 'https://reddb.example.com',
      transport: mockTransport,
    });

    const client = createRedDbClient({
      client: httpClient,
      transport: 'grpc',
    });

    const result = await client.query('SELECT 1');

    expect(result.transport).toBe('http');
    expect(result.degradedFromRequestedTransport).toBe(true);
    expect(result.requestedTransport).toBe('grpc');
  });

  it('falls back from wire to http for scan operations', async () => {
    mockTransport.setMockResponse('GET', '/collections/users/scan?offset=0&limit=20', 200, {
      collection: 'users',
      total: 1,
      next_offset: null,
      items: [{ id: 1, kind: 'TableRow', collection: 'users', json: '{"name":"alice"}' }],
    });

    const httpClient = createClient({
      baseUrl: 'https://reddb.example.com',
      transport: mockTransport,
    });

    const client = createRedDbClient({
      client: httpClient,
      wireAddress: '127.0.0.1:5050',
      transport: 'wire',
    });

    const result = await client.scan({
      collection: 'users',
      limit: 20,
    });

    expect(result.transport).toBe('http');
    expect(result.degradedFromRequestedTransport).toBe(true);
    expect(result.data.total).toBe(1);
  });

  it('executes wire queries when the wire transport is available', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
    });

    const result = await client.query('SELECT * FROM users WHERE id = 1');

    expect(result.transport).toBe('wire');
    expect(result.data.record_count).toBe(1);
    expect(wireServer.queries).toEqual(['SELECT * FROM users WHERE id = 1']);
    await client.close();
  });

  it('uses wire bulk insert when the wire transport is available', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
    });

    const result = await client.bulkInsertRows({
      collection: 'users',
      items: [
        { fields: { id: 1, name: 'alice' } },
        { fields: { id: 2, name: 'bob' } },
      ],
    });

    expect(result.transport).toBe('wire');
    expect(result.data.count).toBe(2);
    expect(wireServer.bulkInserts).toHaveLength(1);
    expect(wireServer.bulkInserts[0]!.collection).toBe('users');
    await client.close();
  });

  it('emulates batchQuery over the selected transport and marks the envelope', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
      batchConcurrency: 2,
    });

    const result = await client.batchQuery([
      'SELECT 1',
      'SELECT 2',
      'SELECT 3',
    ]);

    expect(result.transport).toBe('wire');
    expect(result.emulated).toBe(true);
    expect(result.data.results).toHaveLength(3);
    expect(result.metrics.operation).toBe('batchQuery');
    await client.close();
  });

  it('builds an IF NOT EXISTS index query through ensureIndex', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
    });

    await client.ensureIndex({
      name: 'idx_users_email',
      collection: 'users',
      columns: ['email'],
      unique: true,
      method: 'HASH',
    });

    expect(wireServer.queries[0]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(wireServer.queries[0]).toContain('"idx_users_email"');
    expect(wireServer.queries[0]).toContain('"users"');
    expect(wireServer.queries[0]).toContain('USING HASH');
    await client.close();
  });

  it('emulates bulkInsertBinary with scalar rows when no native binary transport exists', async () => {
    mockTransport.setMockResponse('POST', '/collections/events/bulk/rows', 200, {
      ok: true,
      count: 2,
      first_id: 10,
    });

    const httpClient = createClient({
      baseUrl: 'https://reddb.example.com',
      transport: mockTransport,
    });

    const client = createRedDbClient({
      client: httpClient,
      transport: 'http',
    });

    const result = await client.bulkInsertBinary({
      collection: 'events',
      fieldNames: ['host', 'score', 'active'],
      rows: [
        ['srv-1', 0.8, true],
        ['srv-2', 0.4, false],
      ],
    });

    expect(result.transport).toBe('http');
    expect(result.emulated).toBe(true);
    expect(result.metrics.operation).toBe('bulkInsertBinary');
    expect(result.data.count).toBe(2);
  });

  it('rejects lossy byte-value emulation for bulkInsertBinary', async () => {
    const client = createRedDbClient({
      baseUrl: 'http://127.0.0.1:8080',
      transport: 'http',
    });

    await expect(
      client.bulkInsertBinary({
        collection: 'events',
        fieldNames: ['payload'],
        rows: [[Buffer.from('abc')]],
      })
    ).rejects.toThrow(UnsupportedError);
  });
});
