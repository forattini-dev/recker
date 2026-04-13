import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type AddressInfo } from 'node:net';

import * as grpc from '@grpc/grpc-js';
import protobuf from 'protobufjs';

import {
  UnsupportedError,
  createClient,
  createRedDbClient,
  recker,
} from '../../src/index.js';
import { REDDB_PROTO } from '../../src/clients/reddb-proto.js';
import { MockTransport } from '../helpers/mock-transport.js';

const MSG_QUERY = 0x01;
const MSG_RESULT = 0x02;
const MSG_ERROR = 0x03;
const MSG_BULK_INSERT = 0x04;
const MSG_BULK_OK = 0x05;
const MSG_BULK_INSERT_BINARY = 0x06;

const WIRE_VAL_NULL = 0;
const WIRE_VAL_I64 = 1;
const WIRE_VAL_F64 = 2;
const WIRE_VAL_TEXT = 3;
const WIRE_VAL_BOOL = 4;
const WIRE_VAL_U64 = 5;

function encodeFrame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt32LE(1 + payload.length, 0);
  header[4] = type;
  return Buffer.concat([header, payload]);
}

function decodeWireValue(payload: Buffer, offset: number): { value: unknown; offset: number } {
  const tag = payload[offset]!;
  let next = offset + 1;

  if (tag === WIRE_VAL_NULL) {
    return { value: null, offset: next };
  }
  if (tag === WIRE_VAL_I64) {
    return { value: Number(payload.readBigInt64LE(next)), offset: next + 8 };
  }
  if (tag === WIRE_VAL_U64) {
    return { value: Number(payload.readBigUInt64LE(next)), offset: next + 8 };
  }
  if (tag === WIRE_VAL_F64) {
    return { value: payload.readDoubleLE(next), offset: next + 8 };
  }
  if (tag === WIRE_VAL_BOOL) {
    return { value: payload[next] === 1, offset: next + 1 };
  }
  if (tag === WIRE_VAL_TEXT) {
    const length = payload.readUInt32LE(next);
    next += 4;
    return {
      value: payload.slice(next, next + length).toString('utf8'),
      offset: next + length,
    };
  }

  throw new Error(`unsupported wire tag ${tag}`);
}

async function createMockWireServer(options: {
  onQuery?: (sql: string) => unknown;
  onBulkInsert?: (collection: string, payloads: string[]) => number;
  onBinaryBulkInsert?: (collection: string, fieldNames: string[], rows: unknown[][]) => number;
} = {}) {
  const queries: string[] = [];
  const bulkInserts: Array<{ collection: string; payloads: string[] }> = [];
  const binaryBulkInserts: Array<{ collection: string; fieldNames: string[]; rows: unknown[][] }> = [];
  let connectionCount = 0;

  const server = createServer((socket) => {
    connectionCount += 1;
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

        if (type === MSG_BULK_INSERT_BINARY) {
          let offset = 0;
          const collectionLength = payload.readUInt16LE(offset);
          offset += 2;
          const collection = payload.slice(offset, offset + collectionLength).toString('utf8');
          offset += collectionLength;
          const fieldCount = payload.readUInt16LE(offset);
          offset += 2;
          const fieldNames: string[] = [];

          for (let index = 0; index < fieldCount; index++) {
            const nameLength = payload.readUInt16LE(offset);
            offset += 2;
            fieldNames.push(payload.slice(offset, offset + nameLength).toString('utf8'));
            offset += nameLength;
          }

          const rowCount = payload.readUInt32LE(offset);
          offset += 4;
          const rows: unknown[][] = [];

          for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            const row: unknown[] = [];
            for (let columnIndex = 0; columnIndex < fieldCount; columnIndex++) {
              const decoded = decodeWireValue(payload, offset);
              row.push(decoded.value);
              offset = decoded.offset;
            }
            rows.push(row);
          }

          binaryBulkInserts.push({ collection, fieldNames, rows });
          const inserted = options.onBinaryBulkInsert
            ? options.onBinaryBulkInsert(collection, fieldNames, rows)
            : rows.length;
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
    binaryBulkInserts,
    getConnectionCount: () => connectionCount,
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

function buildGrpcDefinition(): grpc.ServiceDefinition {
  const parsed = protobuf.parse(REDDB_PROTO, { keepCase: true });
  const root = parsed.root.resolveAll();
  const service = root.lookupService('reddb.v1.RedDb') as unknown as {
    fullName: string;
    methodsArray: Array<{
      name: string;
      resolvedRequestType: {
        encode: (value: unknown) => { finish(): Uint8Array };
        fromObject: (value: unknown) => unknown;
        decode: (buffer: Uint8Array) => unknown;
        toObject: (value: unknown, options: object) => unknown;
      };
      resolvedResponseType: {
        encode: (value: unknown) => { finish(): Uint8Array };
        fromObject: (value: unknown) => unknown;
        decode: (buffer: Uint8Array) => unknown;
        toObject: (value: unknown, options: object) => unknown;
      };
    }>;
  };

  const definition: Record<string, grpc.MethodDefinition<unknown, unknown>> = {};
  for (const method of service.methodsArray) {
    definition[method.name] = {
      path: `/${service.fullName.replace(/^\./, '')}/${method.name}`,
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: unknown) =>
        Buffer.from(method.resolvedRequestType.encode(method.resolvedRequestType.fromObject(value)).finish()),
      requestDeserialize: (value: Buffer) =>
        method.resolvedRequestType.toObject(method.resolvedRequestType.decode(value), {
          longs: Number,
          enums: String,
          defaults: false,
          arrays: true,
          objects: true,
          oneofs: true,
        }),
      responseSerialize: (value: unknown) =>
        Buffer.from(method.resolvedResponseType.encode(method.resolvedResponseType.fromObject(value)).finish()),
      responseDeserialize: (value: Buffer) =>
        method.resolvedResponseType.toObject(method.resolvedResponseType.decode(value), {
          longs: Number,
          enums: String,
          defaults: false,
          arrays: true,
          objects: true,
          oneofs: true,
        }),
    };
  }

  return definition as grpc.ServiceDefinition;
}

async function createMockGrpcServer(implementation: grpc.UntypedServiceImplementation = {}) {
  const server = new grpc.Server();
  server.addService(buildGrpcDefinition(), implementation);

  const address = await new Promise<string>((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`127.0.0.1:${port}`);
    });
  });

  return {
    address,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.tryShutdown((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

describe('RedDB client v2', () => {
  let mockTransport: MockTransport;
  let wireServer: Awaited<ReturnType<typeof createMockWireServer>> | null;
  let grpcServer: Awaited<ReturnType<typeof createMockGrpcServer>> | null;

  beforeEach(() => {
    mockTransport = new MockTransport();
    wireServer = null;
    grpcServer = null;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (grpcServer) {
      await grpcServer.close();
    }
    if (wireServer) {
      await wireServer.close();
    }
    recker.reset();
  });

  it('exposes the factory through the unified namespace and returns V2 namespaces', () => {
    expect(typeof recker.reddb).toBe('function');

    const client = createRedDbClient({
      baseUrl: 'http://127.0.0.1:8080',
      wireAddress: '127.0.0.1:5050',
      grpcAddress: '127.0.0.1:50051',
    });

    expect(typeof client.system.health).toBe('function');
    expect(typeof client.sql.query).toBe('function');
    expect(typeof client.collections.list).toBe('function');
    expect(typeof client.indexes.create).toBe('function');
    expect(typeof client.rows.bulkCreate).toBe('function');
    expect(typeof client.vectors.bulkInsertBinary).toBe('function');
    expect(typeof client.kv.list).toBe('function');

    expect(client.getCapabilities()).toMatchObject({
      availableTransports: {
        http: true,
        grpc: true,
        wire: true,
      },
      features: {
        grpcNative: true,
        wireBinaryBulkScalars: true,
      },
    });
  });

  it('runs HTTP query and kv list flows through the V2 namespaces', async () => {
    mockTransport.setMockResponse('POST', '/query', 200, {
      ok: true,
      record_count: 2,
      result: {
        columns: ['id', 'key', 'value'],
        records: [
          { id: 1, key: 'app.theme', value: 'dark' },
          { id: 2, key: 'app.locale', value: 'pt-BR' },
        ],
        stats: {
          rows_scanned: 2,
          exec_time_us: 33,
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

    const query = await client.sql.query('SELECT id, key, value FROM settings');
    const kvs = await client.kv.list({
      collection: 'settings',
      prefix: 'app.',
    });

    expect(query.transport).toBe('http');
    expect(query.data.record_count).toBe(2);
    expect(query.metrics.rowsScanned).toBe(2);
    expect(kvs.transport).toBe('http');
    expect(kvs.data.items).toHaveLength(2);
    expect(kvs.data.items[0]!.key).toBe('app.theme');
    expect(kvs.data.query.record_count).toBe(2);
    expect(mockTransport.getCallCount('POST', '/query')).toBe(2);
  });

  it('falls back from wire to http for row scans', async () => {
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

    const result = await client.rows.scan({
      collection: 'users',
      limit: 20,
    });

    expect(result.transport).toBe('http');
    expect(result.degradedFromRequestedTransport).toBe(true);
    expect(result.data.total).toBe(1);
  });

  it('executes SQL and row bulk creation over the wire protocol', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
    });

    const query = await client.sql.query('SELECT * FROM users WHERE id = 1');
    const bulk = await client.rows.bulkCreate({
      collection: 'users',
      items: [
        { fields: { id: 1, name: 'alice' } },
        { fields: { id: 2, name: 'bob' } },
      ],
    });

    expect(query.transport).toBe('wire');
    expect(query.data.record_count).toBe(1);
    expect(wireServer.queries).toEqual(['SELECT * FROM users WHERE id = 1']);

    expect(bulk.transport).toBe('wire');
    expect(bulk.data.count).toBe(2);
    expect(wireServer.bulkInserts).toHaveLength(1);
    expect(wireServer.bulkInserts[0]!.collection).toBe('users');

    await client.close();
  });

  it('uses the wire binary fast path for scalar bulkInsertBinary workloads', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
    });

    const result = await client.vectors.bulkInsertBinary({
      collection: 'events',
      fieldNames: ['host', 'score', 'active'],
      rows: [
        ['srv-1', 0.8, true],
        ['srv-2', 0.4, false],
      ],
    });

    expect(result.transport).toBe('wire');
    expect(result.emulated).toBe(false);
    expect(result.data.count).toBe(2);
    expect(wireServer.binaryBulkInserts).toHaveLength(1);
    expect(wireServer.binaryBulkInserts[0]!.rows).toEqual([
      ['srv-1', 0.8, true],
      ['srv-2', 0.4, false],
    ]);

    await client.close();
  });

  it('uses multiple wire connections when wirePoolSize is configured', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      wirePoolSize: 2,
      transport: 'wire',
    });

    await client.sql.query('SELECT 1');
    await client.sql.query('SELECT 2');

    expect(wireServer.getConnectionCount()).toBe(2);

    await client.close();
  });

  it('executes gRPC query, collection list, row create, and byte bulkInsertBinary natively', async () => {
    const queries: string[] = [];
    const bulkRequests: Array<{ collection: string; field_names: string[]; rows: unknown[] }> = [];

    grpcServer = await createMockGrpcServer({
      Query(call, callback) {
        queries.push(String(call.request.query));
        callback(null, {
          ok: true,
          mode: 'sql',
          statement: 'SELECT 1',
          engine: 'query',
          columns: ['value'],
          record_count: 1,
          result_json: JSON.stringify({
            columns: ['value'],
            records: [{ value: 1 }],
            stats: { rows_scanned: 1, exec_time_us: 9 },
          }),
        });
      },
      Collections(_call, callback) {
        callback(null, {
          collections: ['users', 'events'],
        });
      },
      CreateRow(call, callback) {
        callback(null, {
          ok: true,
          id: 42,
          entity_json: call.request.payload_json,
        });
      },
      BulkInsertBinary(call, callback) {
        bulkRequests.push({
          collection: String(call.request.collection),
          field_names: Array.isArray(call.request.field_names) ? [...call.request.field_names] : [],
          rows: Array.isArray(call.request.rows) ? [...call.request.rows] : [],
        });
        callback(null, {
          ok: true,
          count: 1,
          first_id: 900,
        });
      },
    });

    const client = createRedDbClient({
      grpcAddress: grpcServer.address,
      transport: 'grpc',
    });

    const query = await client.sql.query('SELECT 1');
    const collections = await client.collections.list();
    const created = await client.rows.create({
      collection: 'users',
      payload: {
        fields: {
          name: 'alice',
        },
      },
    });
    const inserted = await client.vectors.bulkInsertBinary({
      collection: 'events',
      fieldNames: ['payload'],
      rows: [[Buffer.from('abc')]],
    });

    expect(query.transport).toBe('grpc');
    expect(query.data.record_count).toBe(1);
    expect(query.metrics.execTimeUs).toBe(9);
    expect(queries).toEqual(['SELECT 1']);

    expect(collections.transport).toBe('grpc');
    expect(collections.data.collections).toEqual(['users', 'events']);

    expect(created.transport).toBe('grpc');
    expect(created.data.id).toBe(42);
    expect(created.data.entity).toEqual({
      fields: {
        name: 'alice',
      },
    });

    expect(inserted.transport).toBe('grpc');
    expect(inserted.data.count).toBe(1);
    expect(bulkRequests[0]!.collection).toBe('events');
    expect(bulkRequests[0]!.field_names).toEqual(['payload']);

    await client.close();
  });

  it('builds CREATE INDEX SQL through the V2 index namespace', async () => {
    wireServer = await createMockWireServer();
    const client = createRedDbClient({
      wireAddress: wireServer.address,
      transport: 'wire',
    });

    await client.indexes.create({
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

  it('emulates scalar bulkInsertBinary over HTTP when no native binary transport is available', async () => {
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

    const result = await client.vectors.bulkInsertBinary({
      collection: 'events',
      fieldNames: ['host', 'score', 'active'],
      rows: [
        ['srv-1', 0.8, true],
        ['srv-2', 0.4, false],
      ],
    });

    expect(result.transport).toBe('http');
    expect(result.emulated).toBe(true);
    expect(result.metrics.operation).toBe('vectors.bulkInsertBinary');
    expect(result.data.count).toBe(2);
  });

  it('applies operationTimeouts defaults when the call does not override timeout', async () => {
    mockTransport.setMockResponse('GET', '/health', 200, { healthy: true }, undefined, { delay: 30 });

    const httpClient = createClient({
      baseUrl: 'https://reddb.example.com',
      transport: mockTransport,
    });

    const client = createRedDbClient({
      client: httpClient,
      operationTimeouts: {
        system: 5,
      },
      timeout: 1000,
      transport: 'http',
    });

    await expect(client.system.health()).rejects.toThrow();
  });

  it('rejects byte bulkInsertBinary when gRPC is unavailable', async () => {
    const client = createRedDbClient({
      wireAddress: '127.0.0.1:5050',
      transport: 'wire',
    });

    await expect(
      client.vectors.bulkInsertBinary({
        collection: 'events',
        fieldNames: ['payload'],
        rows: [[Buffer.from('abc')]],
      })
    ).rejects.toThrow(UnsupportedError);
  });
});
