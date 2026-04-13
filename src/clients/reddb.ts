/**
 * RedDB protocol client for Recker.
 *
 * Provides a single API over RedDB's HTTP surface and binary wire protocol.
 * gRPC is modeled in the transport selector, but currently degrades to the
 * best available implemented transport.
 */

import { performance } from 'node:perf_hooks';
import { connect as connectTcp, Socket } from 'node:net';
import { connect as connectTls, TLSSocket } from 'node:tls';

import { createClient, type Client as ReckerClient, type ExtendedClientOptions } from '../core/client.js';
import {
  AuthenticationError,
  ConfigurationError,
  ConnectionError,
  NotFoundError,
  ParseError,
  ProtocolError,
  UnsupportedError,
  ValidationError,
} from '../core/errors.js';

export type RedDbTransportMode = 'auto' | 'http' | 'grpc' | 'wire';
export type RedDbResolvedTransport = 'http' | 'wire';

export interface RedDbQueryStats {
  nodes_scanned?: number;
  edges_scanned?: number;
  rows_scanned?: number;
  exec_time_us?: number;
  [key: string]: unknown;
}

export interface RedDbQueryData {
  ok?: boolean;
  query?: string;
  mode?: string;
  capability?: string;
  statement?: string;
  engine?: string;
  record_count?: number;
  affected_rows?: number;
  statement_type?: string;
  result?: {
    columns?: string[];
    records?: Array<Record<string, unknown>>;
    stats?: RedDbQueryStats;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RedDbBatchQueryData {
  results: RedDbQueryData[];
}

export interface RedDbScanEntity {
  id: number;
  kind: string;
  collection: string;
  json: string;
}

export interface RedDbScanData {
  collection: string;
  total: number;
  next_offset?: number | null;
  items: RedDbScanEntity[];
  [key: string]: unknown;
}

export interface RedDbBulkInsertData {
  ok?: boolean;
  count?: number;
  first_id?: number;
  [key: string]: unknown;
}

export interface RedDbCapabilities {
  requestedTransport: RedDbTransportMode;
  allowTransportFallback: boolean;
  availableTransports: {
    http: boolean;
    wire: boolean;
    grpc: boolean;
  };
  native: {
    query: boolean;
    batchQuery: boolean;
    scan: boolean;
    bulkInsertRows: boolean;
    bulkInsertBinary: boolean;
    stats: boolean;
    ensureCollection: boolean;
    ensureIndex: boolean;
    warmupIndex: boolean;
  };
  emulated: {
    batchQuery: boolean;
    bulkInsertBinary: boolean;
  };
}

export interface RedDbOperationMetrics {
  operation: string;
  requestedTransport: RedDbTransportMode;
  transport: RedDbResolvedTransport;
  degradedFromRequestedTransport: boolean;
  emulated: boolean;
  startedAt: number;
  durationMs: number;
  recordCount?: number;
  affectedRows?: number;
  rowsScanned?: number;
  execTimeUs?: number;
}

export interface RedDbOperationEnvelope<T> {
  data: T;
  transport: RedDbResolvedTransport;
  requestedTransport: RedDbTransportMode;
  degradedFromRequestedTransport: boolean;
  emulated: boolean;
  metrics: RedDbOperationMetrics;
}

export interface RedDbQueryOptions {
  entityTypes?: string[];
  capabilities?: string[];
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbScanRequest {
  collection: string;
  offset?: number;
  limit?: number;
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbBulkInsertRowsRequest {
  collection: string;
  items: Array<{ fields: Record<string, unknown> }>;
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export type RedDbBinaryValue = string | number | boolean | Buffer | Uint8Array | null;

export interface RedDbBulkInsertBinaryRequest {
  collection: string;
  fieldNames: string[];
  rows: RedDbBinaryValue[][];
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbEnsureCollectionOptions {
  name: string;
  ttl?: string | number;
  ttlMs?: number;
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbEnsureIndexOptions {
  name: string;
  collection: string;
  columns: string[];
  unique?: boolean;
  method?: 'BTREE' | 'HASH' | 'BITMAP' | 'RTREE';
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbWarmupIndexOptions {
  name: string;
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbStatsOptions {
  transport?: RedDbTransportMode;
  signal?: AbortSignal;
  timeout?: number;
}

export interface RedDbWireTlsOptions {
  enabled?: boolean;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  servername?: string;
}

export interface RedDbClientOptions {
  /**
   * Base URL for RedDB's HTTP API, for example `http://127.0.0.1:8080`.
   */
  baseUrl?: string;
  /**
   * Existing Recker client to reuse for HTTP operations.
   */
  client?: ReckerClient;
  /**
   * Default transport preference.
   */
  transport?: RedDbTransportMode;
  /**
   * When the requested transport cannot satisfy an operation, degrade to the
   * best implemented transport and mark the result envelope.
   *
   * @default true
   */
  allowTransportFallback?: boolean;
  /**
   * Bearer token used for HTTP operations when auth is enabled on RedDB.
   */
  authToken?: string;
  /**
   * Optional write token header carried through as `x-write-token`.
   */
  writeToken?: string;
  /**
   * Additional default HTTP headers.
   */
  headers?: Record<string, string>;
  /**
   * Default request timeout in milliseconds.
   *
   * @default 30000
   */
  timeout?: number;
  /**
   * Enable HTTP/2 on the internal Recker client.
   *
   * @default true
   */
  http2?: boolean;
  /**
   * Additional options for the internal Recker HTTP client.
   */
  httpClientOptions?: Omit<ExtendedClientOptions, 'baseUrl' | 'headers' | 'timeout' | 'http2'>;
  /**
   * RedDB wire address in `host:port` form.
   */
  wireAddress?: string;
  /**
   * TLS settings for the wire protocol.
   */
  wireTls?: boolean | RedDbWireTlsOptions;
  /**
   * Concurrency used by emulated batch operations.
   *
   * @default 8
   */
  batchConcurrency?: number;
}

interface TransportResolution {
  transport: RedDbResolvedTransport;
  requestedTransport: RedDbTransportMode;
  degradedFromRequestedTransport: boolean;
  emulated: boolean;
}

interface WireEndpoint {
  host: string;
  port: number;
}

interface PendingWireRequest {
  resolve: (value: { type: number; payload: Buffer }) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

const WIRE_MSG_QUERY = 0x01;
const WIRE_MSG_RESULT = 0x02;
const WIRE_MSG_ERROR = 0x03;
const WIRE_MSG_BULK_INSERT = 0x04;
const WIRE_MSG_BULK_OK = 0x05;

function isBufferLike(value: unknown): value is Buffer | Uint8Array {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function parseWireAddress(address: string): WireEndpoint {
  if (!address || !address.trim()) {
    throw new ConfigurationError('wireAddress must be a non-empty host:port string', {
      configKey: 'wireAddress',
    });
  }

  const trimmed = address.trim();
  if (trimmed.includes('://')) {
    const url = new URL(trimmed);
    const port = Number(url.port);
    if (!url.hostname || !Number.isInteger(port) || port <= 0) {
      throw new ConfigurationError(`Invalid wireAddress: ${address}`, {
        configKey: 'wireAddress',
      });
    }
    return { host: url.hostname, port };
  }

  const ipv6 = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  if (ipv6) {
    return {
      host: ipv6[1]!,
      port: Number(ipv6[2]!),
    };
  }

  const separator = trimmed.lastIndexOf(':');
  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new ConfigurationError(`Invalid wireAddress: ${address}`, {
      configKey: 'wireAddress',
    });
  }

  const host = trimmed.slice(0, separator);
  const port = Number(trimmed.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port <= 0) {
    throw new ConfigurationError(`Invalid wireAddress: ${address}`, {
      configKey: 'wireAddress',
    });
  }

  return { host, port };
}

function escapeSqlIdentifier(value: string): string {
  if (!value || !value.trim()) {
    throw new ValidationError('SQL identifier cannot be empty', {
      field: 'identifier',
      value,
    });
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function buildQueryStats(data: unknown): Pick<RedDbOperationMetrics, 'recordCount' | 'affectedRows' | 'rowsScanned' | 'execTimeUs'> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const queryData = data as RedDbQueryData;
  const stats = queryData.result?.stats;
  return {
    recordCount: typeof queryData.record_count === 'number' ? queryData.record_count : undefined,
    affectedRows: typeof queryData.affected_rows === 'number' ? queryData.affected_rows : undefined,
    rowsScanned: typeof stats?.rows_scanned === 'number' ? stats.rows_scanned : undefined,
    execTimeUs: typeof stats?.exec_time_us === 'number' ? stats.exec_time_us : undefined,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency || 1, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function run(): Promise<void> {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) {
        return;
      }
      results[current] = await worker(items[current]!, current);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => run()));
  return results;
}

class RedDbWireSocket {
  private readonly endpoint: WireEndpoint;
  private readonly tlsOptions: RedDbWireTlsOptions;
  private readonly timeout: number;
  private socket: Socket | TLSSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending: PendingWireRequest[] = [];
  private buffer = Buffer.alloc(0);

  constructor(address: string, tlsOptions: boolean | RedDbWireTlsOptions | undefined, timeout: number) {
    this.endpoint = parseWireAddress(address);
    this.timeout = timeout;
    this.tlsOptions = typeof tlsOptions === 'boolean'
      ? { enabled: tlsOptions }
      : { enabled: tlsOptions?.enabled ?? false, ...tlsOptions };
  }

  get available(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async query(sql: string, timeout?: number): Promise<unknown> {
    const response = await this.send(WIRE_MSG_QUERY, Buffer.from(sql, 'utf8'), timeout);
    if (response.type !== WIRE_MSG_RESULT) {
      throw new ProtocolError(`Unexpected wire response type: ${response.type}`, {
        protocol: 'reddb',
        code: response.type,
        phase: 'query',
      });
    }

    try {
      return JSON.parse(response.payload.toString('utf8'));
    } catch (error) {
      throw new ParseError(
        `Failed to parse RedDB wire query payload: ${error instanceof Error ? error.message : String(error)}`,
        { format: 'json' }
      );
    }
  }

  async bulkInsert(collection: string, payloads: string[], timeout?: number): Promise<number> {
    const collectionBuffer = Buffer.from(collection, 'utf8');
    const header = Buffer.alloc(2 + collectionBuffer.length + 4);
    header.writeUInt16LE(collectionBuffer.length, 0);
    collectionBuffer.copy(header, 2);
    header.writeUInt32LE(payloads.length, 2 + collectionBuffer.length);

    const parts: Buffer[] = [header];
    for (const payload of payloads) {
      const jsonBuffer = Buffer.from(payload, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
      parts.push(lengthBuffer, jsonBuffer);
    }

    const response = await this.send(WIRE_MSG_BULK_INSERT, Buffer.concat(parts), timeout);
    if (response.type !== WIRE_MSG_BULK_OK) {
      throw new ProtocolError(`Unexpected wire bulk response type: ${response.type}`, {
        protocol: 'reddb',
        code: response.type,
        phase: 'bulkInsert',
      });
    }

    if (response.payload.length >= 8) {
      return Number(response.payload.readBigUInt64LE(0));
    }
    return 0;
  }

  async close(): Promise<void> {
    this.destroy();
  }

  private async connect(): Promise<void> {
    if (this.available) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const connectPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup();
        this.destroy(error);
        reject(new ConnectionError(error.message, {
          host: this.endpoint.host,
          port: this.endpoint.port,
          code: (error as NodeJS.ErrnoException).code,
        }));
      };

      const onConnect = () => {
        cleanup();
        if (!socket.destroyed) {
          socket.setNoDelay(true);
        }
        this.socket = socket;
        socket.on('data', (chunk: Buffer) => this.onData(chunk));
        socket.on('error', (error) => this.destroy(error instanceof Error ? error : new Error(String(error))));
        socket.on('close', () => this.destroy());
        resolve();
      };

      const cleanup = () => {
        socket.removeListener('error', onError);
        socket.removeListener('connect', onConnect);
      };

      const socket = this.tlsOptions.enabled
        ? connectTls({
            host: this.endpoint.host,
            port: this.endpoint.port,
            rejectUnauthorized: this.tlsOptions.rejectUnauthorized ?? true,
            ca: this.tlsOptions.ca,
            servername: this.tlsOptions.servername || this.endpoint.host,
          }, onConnect)
        : connectTcp({
            host: this.endpoint.host,
            port: this.endpoint.port,
          }, onConnect);

      socket.setTimeout(this.timeout, () => {
        onError(new Error(`RedDB wire connection to ${this.endpoint.host}:${this.endpoint.port} timed out`));
      });
      socket.once('error', onError);
    }).finally(() => {
      this.connectPromise = null;
    });

    this.connectPromise = connectPromise;
    return connectPromise;
  }

  private async send(messageType: number, payload: Buffer, timeout?: number): Promise<{ type: number; payload: Buffer }> {
    await this.connect();

    if (!this.socket || this.socket.destroyed) {
      throw new ConnectionError('RedDB wire socket is not connected', {
        host: this.endpoint.host,
        port: this.endpoint.port,
      });
    }

    return new Promise((resolve, reject) => {
      const frameLength = 1 + payload.length;
      const header = Buffer.alloc(5);
      header.writeUInt32LE(frameLength, 0);
      header[4] = messageType;

      const pending: PendingWireRequest = {
        resolve: (value) => {
          if (pending.timer) {
            clearTimeout(pending.timer);
          }
          resolve(value);
        },
        reject: (error) => {
          if (pending.timer) {
            clearTimeout(pending.timer);
          }
          reject(error);
        },
      };

      const timeoutMs = timeout ?? this.timeout;
      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        pending.timer = setTimeout(() => {
          const error = new ProtocolError(`RedDB wire request timed out after ${timeoutMs}ms`, {
            protocol: 'reddb',
            phase: 'wire-timeout',
            retriable: true,
          });
          this.destroy(error);
        }, timeoutMs);
      }

      this.pending.push(pending);

      this.socket!.write(header);
      this.socket!.write(payload);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.tryResolvePending();
  }

  private tryResolvePending(): void {
    while (this.buffer.length >= 5 && this.pending.length > 0) {
      const totalLength = this.buffer.readUInt32LE(0);
      const frameSize = 4 + totalLength;
      if (this.buffer.length < frameSize) {
        return;
      }

      const type = this.buffer[4]!;
      const payload = this.buffer.slice(5, frameSize);
      this.buffer = this.buffer.slice(frameSize);

      const current = this.pending.shift();
      if (!current) {
        return;
      }

      if (type === WIRE_MSG_ERROR) {
        current.reject(new ProtocolError(payload.toString('utf8'), {
          protocol: 'reddb',
          code: type,
          phase: 'wire-response',
        }));
      } else {
        current.resolve({ type, payload });
      }
    }
  }

  private destroy(error?: Error): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.buffer = Buffer.alloc(0);
    const pending = this.pending.splice(0);
    for (const request of pending) {
      request.reject(error || new ConnectionError('RedDB wire socket closed', {
        host: this.endpoint.host,
        port: this.endpoint.port,
      }));
    }
  }
}

/**
 * RedDB client with transport-aware execution over HTTP and the native wire
 * protocol. Results always include transport metadata and operation metrics.
 */
export class RedDbClient {
  private readonly baseUrl?: string;
  private readonly httpClient: ReckerClient | null;
  private readonly defaultTransport: RedDbTransportMode;
  private readonly allowTransportFallback: boolean;
  private readonly timeout: number;
  private readonly batchConcurrency: number;
  private readonly wireClient: RedDbWireSocket | null;

  constructor(options: RedDbClientOptions = {}) {
    this.baseUrl = options.baseUrl;
    this.defaultTransport = options.transport ?? 'auto';
    this.allowTransportFallback = options.allowTransportFallback ?? true;
    this.timeout = options.timeout ?? 30000;
    this.batchConcurrency = Math.max(1, options.batchConcurrency ?? 8);

    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.authToken) {
      headers.Authorization = `Bearer ${options.authToken}`;
    }
    if (options.writeToken) {
      headers['x-write-token'] = options.writeToken;
    }

    if (options.client) {
      this.httpClient = options.client;
    } else if (this.baseUrl) {
      this.httpClient = createClient({
        baseUrl: this.baseUrl,
        headers,
        timeout: this.timeout,
        http2: options.http2 ?? true,
        ...(options.httpClientOptions || {}),
      });
    } else {
      this.httpClient = null;
    }

    this.wireClient = options.wireAddress
      ? new RedDbWireSocket(options.wireAddress, options.wireTls, this.timeout)
      : null;
  }

  getCapabilities(): RedDbCapabilities {
    const hasHttp = this.httpClient !== null;
    const hasWire = this.wireClient !== null;

    return {
      requestedTransport: this.defaultTransport,
      allowTransportFallback: this.allowTransportFallback,
      availableTransports: {
        http: hasHttp,
        wire: hasWire,
        grpc: false,
      },
      native: {
        query: hasHttp || hasWire,
        batchQuery: false,
        scan: hasHttp,
        bulkInsertRows: hasHttp || hasWire,
        bulkInsertBinary: false,
        stats: hasHttp,
        ensureCollection: hasHttp,
        ensureIndex: hasHttp || hasWire,
        warmupIndex: hasHttp,
      },
      emulated: {
        batchQuery: hasHttp || hasWire,
        bulkInsertBinary: hasHttp || hasWire,
      },
    };
  }

  async query(
    query: string,
    options: RedDbQueryOptions = {}
  ): Promise<RedDbOperationEnvelope<RedDbQueryData>> {
    if (!query || !query.trim()) {
      throw new ValidationError('Query must be a non-empty string', {
        field: 'query',
        value: query,
      });
    }

    const resolution = this.resolveTransport('query', options.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const data: RedDbQueryData = resolution.transport === 'wire'
      ? await this.runWireQuery(query, options)
      : await this.runHttpQuery<RedDbQueryData>('/query', {
          query,
          entity_types: options.entityTypes,
          capabilities: options.capabilities,
        }, options);

    return this.buildEnvelope('query', data, resolution, startedAt, started);
  }

  async explainQuery(
    query: string,
    options: RedDbQueryOptions = {}
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    if (!query || !query.trim()) {
      throw new ValidationError('Query must be a non-empty string', {
        field: 'query',
        value: query,
      });
    }

    const resolution = this.resolveTransport('explainQuery', options.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const data = resolution.transport === 'wire'
      ? await this.runWireQuery(`EXPLAIN ${query}`, options)
      : await this.runHttpQuery('/query/explain', { query }, options);

    return this.buildEnvelope('explainQuery', data as Record<string, unknown>, resolution, startedAt, started);
  }

  async mutateQuery(
    query: string,
    options: RedDbQueryOptions = {}
  ): Promise<RedDbOperationEnvelope<RedDbQueryData>> {
    return this.query(query, options);
  }

  async batchQuery(
    queries: string[],
    options: RedDbQueryOptions = {}
  ): Promise<RedDbOperationEnvelope<RedDbBatchQueryData>> {
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new ValidationError('batchQuery requires a non-empty array of queries', {
        field: 'queries',
        value: queries,
      });
    }

    const resolution = this.resolveTransport('batchQuery', options.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const results = await mapWithConcurrency<string, RedDbQueryData>(queries, this.batchConcurrency, async (query) => {
      if (resolution.transport === 'wire') {
        return this.runWireQuery(query, options);
      }
      return this.runHttpQuery<RedDbQueryData>('/query', {
        query,
        entity_types: options.entityTypes,
        capabilities: options.capabilities,
      }, options);
    });

    return this.buildEnvelope(
      'batchQuery',
      { results },
      { ...resolution, emulated: true },
      startedAt,
      started
    );
  }

  async scan(
    params: RedDbScanRequest
  ): Promise<RedDbOperationEnvelope<RedDbScanData>> {
    if (!params.collection || !params.collection.trim()) {
      throw new ValidationError('scan requires a collection name', {
        field: 'collection',
        value: params.collection,
      });
    }

    const resolution = this.resolveTransport('scan', params.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const query = new URLSearchParams();
    query.set('offset', String(Math.max(0, params.offset ?? 0)));
    query.set('limit', String(Math.max(1, params.limit ?? 100)));

    const data = await this.runHttpGet<RedDbScanData>(
      `/collections/${encodeURIComponent(params.collection)}/scan?${query.toString()}`,
      params
    );

    return this.buildEnvelope('scan', data, resolution, startedAt, started);
  }

  async bulkInsertRows(
    params: RedDbBulkInsertRowsRequest
  ): Promise<RedDbOperationEnvelope<RedDbBulkInsertData>> {
    if (!params.collection || !params.collection.trim()) {
      throw new ValidationError('bulkInsertRows requires a collection name', {
        field: 'collection',
        value: params.collection,
      });
    }
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new ValidationError('bulkInsertRows requires a non-empty items array', {
        field: 'items',
        value: params.items,
      });
    }

    const resolution = this.resolveTransport('bulkInsertRows', params.transport);
    const startedAt = Date.now();
    const started = performance.now();

    let data: RedDbBulkInsertData;
    if (resolution.transport === 'wire') {
      const payloads = params.items.map((item) => JSON.stringify(item));
      const count = await this.runWireBulkInsert(params.collection, payloads, params);
      data = { ok: true, count };
    } else {
      data = await this.runHttpQuery(
        `/collections/${encodeURIComponent(params.collection)}/bulk/rows`,
        { items: params.items },
        params
      ) as RedDbBulkInsertData;
    }

    return this.buildEnvelope('bulkInsertRows', data, resolution, startedAt, started);
  }

  async bulkInsertBinary(
    params: RedDbBulkInsertBinaryRequest
  ): Promise<RedDbOperationEnvelope<RedDbBulkInsertData>> {
    if (!params.collection || !params.collection.trim()) {
      throw new ValidationError('bulkInsertBinary requires a collection name', {
        field: 'collection',
        value: params.collection,
      });
    }
    if (!Array.isArray(params.fieldNames) || params.fieldNames.length === 0) {
      throw new ValidationError('bulkInsertBinary requires fieldNames', {
        field: 'fieldNames',
        value: params.fieldNames,
      });
    }
    if (!Array.isArray(params.rows) || params.rows.length === 0) {
      throw new ValidationError('bulkInsertBinary requires rows', {
        field: 'rows',
        value: params.rows,
      });
    }

    const hasTrueBinaryValues = params.rows.some((row) => row.some((value) => isBufferLike(value)));
    if (hasTrueBinaryValues) {
      throw new UnsupportedError(
        'bulkInsertBinary byte values require native gRPC support, which is not implemented yet',
        { feature: 'reddb.bulkInsertBinary.bytes' }
      );
    }

    const items = params.rows.map((row) => ({
      fields: this.binaryRowToFields(params.fieldNames, row),
    }));

    const envelope = await this.bulkInsertRows({
      collection: params.collection,
      items,
      transport: params.transport,
      signal: params.signal,
      timeout: params.timeout,
    });

    return {
      ...envelope,
      emulated: true,
      metrics: {
        ...envelope.metrics,
        operation: 'bulkInsertBinary',
        emulated: true,
      },
    };
  }

  async stats(
    options: RedDbStatsOptions = {}
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    const resolution = this.resolveTransport('stats', options.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const data = await this.runHttpGet<Record<string, unknown>>('/stats', options);

    return this.buildEnvelope('stats', data, resolution, startedAt, started);
  }

  async ensureCollection(
    options: RedDbEnsureCollectionOptions
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    if (!options.name || !options.name.trim()) {
      throw new ValidationError('ensureCollection requires a collection name', {
        field: 'name',
        value: options.name,
      });
    }

    const resolution = this.resolveTransport('ensureCollection', options.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const payload: Record<string, unknown> = { name: options.name };
    if (options.ttl !== undefined) payload.ttl = options.ttl;
    if (options.ttlMs !== undefined) payload.ttl_ms = options.ttlMs;

    const data = await this.runHttpQuery<Record<string, unknown>>('/collections', payload, options);
    return this.buildEnvelope('ensureCollection', data, resolution, startedAt, started);
  }

  async ensureIndex(
    options: RedDbEnsureIndexOptions
  ): Promise<RedDbOperationEnvelope<RedDbQueryData>> {
    if (!options.name || !options.name.trim()) {
      throw new ValidationError('ensureIndex requires an index name', {
        field: 'name',
        value: options.name,
      });
    }
    if (!options.collection || !options.collection.trim()) {
      throw new ValidationError('ensureIndex requires a collection name', {
        field: 'collection',
        value: options.collection,
      });
    }
    if (!Array.isArray(options.columns) || options.columns.length === 0) {
      throw new ValidationError('ensureIndex requires at least one column', {
        field: 'columns',
        value: options.columns,
      });
    }

    const unique = options.unique ? 'UNIQUE ' : '';
    const method = options.method ? ` USING ${options.method}` : '';
    const columns = options.columns.map(escapeSqlIdentifier).join(', ');
    const query = `CREATE ${unique}INDEX IF NOT EXISTS ${escapeSqlIdentifier(options.name)} ON ${escapeSqlIdentifier(options.collection)} (${columns})${method}`;
    return this.query(query, options);
  }

  async warmupIndex(
    options: RedDbWarmupIndexOptions
  ): Promise<RedDbOperationEnvelope<Record<string, unknown>>> {
    if (!options.name || !options.name.trim()) {
      throw new ValidationError('warmupIndex requires an index name', {
        field: 'name',
        value: options.name,
      });
    }

    const resolution = this.resolveTransport('warmupIndex', options.transport);
    const startedAt = Date.now();
    const started = performance.now();
    const data = await this.runHttpQuery<Record<string, unknown>>(
      `/indexes/${encodeURIComponent(options.name)}/warmup`,
      {},
      options
    );

    return this.buildEnvelope('warmupIndex', data, resolution, startedAt, started);
  }

  async close(): Promise<void> {
    if (this.wireClient) {
      await this.wireClient.close();
    }
  }

  private binaryRowToFields(fieldNames: string[], row: RedDbBinaryValue[]): Record<string, unknown> {
    if (row.length !== fieldNames.length) {
      throw new ValidationError(
        `bulkInsertBinary row length ${row.length} does not match fieldNames length ${fieldNames.length}`,
        { field: 'rows', value: row }
      );
    }

    const fields: Record<string, unknown> = {};
    for (let index = 0; index < fieldNames.length; index++) {
      const fieldName = fieldNames[index]!;
      const value = row[index];

      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        fields[fieldName] = value;
        continue;
      }

      if (isBufferLike(value)) {
        throw new UnsupportedError(
          'bulkInsertBinary emulation cannot safely serialize byte values without native gRPC support',
          { feature: 'reddb.bulkInsertBinary.bytes' }
        );
      }

      throw new ValidationError(`Unsupported binary row value for field ${fieldName}`, {
        field: fieldName,
        value,
      });
    }

    return fields;
  }

  private async runHttpQuery<T>(
    path: string,
    payload: unknown,
    options: { signal?: AbortSignal; timeout?: number }
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.post(path, {
      json: payload,
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async runHttpGet<T>(
    path: string,
    options: { signal?: AbortSignal; timeout?: number }
  ): Promise<T> {
    if (!this.httpClient) {
      throw new UnsupportedError('HTTP transport is not configured for this RedDB client', {
        feature: 'reddb.http',
      });
    }

    const response = await this.httpClient.get(path, {
      signal: options.signal,
      timeout: options.timeout ?? this.timeout,
      throwHttpErrors: false,
    });

    return this.parseHttpResponse<T>(response, path);
  }

  private async parseHttpResponse<T>(
    response: Awaited<ReturnType<ReckerClient['get']>>,
    path: string
  ): Promise<T> {
    if (response.status === 401) {
      throw new AuthenticationError(`RedDB request unauthorized for ${path}`, {
        authType: 'bearer',
      });
    }

    if (response.status === 404) {
      throw new NotFoundError(`RedDB resource not found: ${path}`, {
        resource: path,
      });
    }

    if (!response.ok) {
      const message = await response.text().catch(() => `HTTP ${response.status}`);
      throw new ProtocolError(`RedDB HTTP request failed for ${path}: ${message}`, {
        protocol: 'reddb',
        code: response.status,
        phase: 'http',
        retriable: response.status >= 500,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return await response.json<T>();
    } catch (error) {
      throw new ParseError(
        `Failed to parse RedDB HTTP response for ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { format: 'json' }
      );
    }
  }

  private async runWireQuery(
    query: string,
    options: { signal?: AbortSignal; timeout?: number }
  ): Promise<RedDbQueryData> {
    if (options.signal) {
      throw new UnsupportedError('AbortSignal is not supported for RedDB wire operations', {
        feature: 'reddb.wire.signal',
      });
    }
    if (!this.wireClient) {
      throw new UnsupportedError('Wire transport is not configured for this RedDB client', {
        feature: 'reddb.wire',
      });
    }
    return await this.wireClient.query(query, options.timeout ?? this.timeout) as RedDbQueryData;
  }

  private async runWireBulkInsert(
    collection: string,
    payloads: string[],
    options: { signal?: AbortSignal; timeout?: number }
  ): Promise<number> {
    if (options.signal) {
      throw new UnsupportedError('AbortSignal is not supported for RedDB wire operations', {
        feature: 'reddb.wire.signal',
      });
    }
    if (!this.wireClient) {
      throw new UnsupportedError('Wire transport is not configured for this RedDB client', {
        feature: 'reddb.wire',
      });
    }
    return await this.wireClient.bulkInsert(collection, payloads, options.timeout ?? this.timeout);
  }

  private resolveTransport(operation: string, requestedTransport?: RedDbTransportMode): TransportResolution {
    const requested = requestedTransport ?? this.defaultTransport;
    const hasHttp = this.httpClient !== null;
    const hasWire = this.wireClient !== null;

    const requireHttp = () => {
      if (hasHttp) {
        return {
          transport: 'http' as const,
          requestedTransport: requested,
          degradedFromRequestedTransport: requested !== 'auto' && requested !== 'http',
          emulated: false,
        };
      }
      throw new UnsupportedError(`Operation ${operation} requires the RedDB HTTP API`, {
        feature: `reddb.${operation}.http`,
      });
    };

    const preferWireThenHttp = (): TransportResolution => {
      if (hasWire) {
        return {
          transport: 'wire',
          requestedTransport: requested,
          degradedFromRequestedTransport: requested === 'grpc' || requested === 'http',
          emulated: false,
        };
      }
      if (hasHttp) {
        return {
          transport: 'http',
          requestedTransport: requested,
          degradedFromRequestedTransport: requested === 'grpc' || requested === 'wire',
          emulated: false,
        };
      }
      throw new UnsupportedError(`No RedDB transport is configured for ${operation}`, {
        feature: `reddb.${operation}`,
      });
    };

    const preferHttpThenWire = (): TransportResolution => {
      if (hasHttp) {
        return {
          transport: 'http',
          requestedTransport: requested,
          degradedFromRequestedTransport: requested === 'grpc' || requested === 'wire',
          emulated: false,
        };
      }
      if (hasWire) {
        return {
          transport: 'wire',
          requestedTransport: requested,
          degradedFromRequestedTransport: requested === 'grpc' || requested === 'http',
          emulated: false,
        };
      }
      throw new UnsupportedError(`No RedDB transport is configured for ${operation}`, {
        feature: `reddb.${operation}`,
      });
    };

    const requiresHttp = new Set(['scan', 'stats', 'ensureCollection', 'warmupIndex']);
    const prefersWire = new Set(['query', 'mutateQuery', 'explainQuery', 'batchQuery', 'bulkInsertRows', 'bulkInsertBinary', 'ensureIndex']);

    if (requested === 'auto') {
      return prefersWire.has(operation) ? preferWireThenHttp() : requireHttp();
    }

    if (requested === 'http') {
      if (requiresHttp.has(operation)) {
        return requireHttp();
      }
      if (hasHttp) {
        return {
          transport: 'http',
          requestedTransport: requested,
          degradedFromRequestedTransport: false,
          emulated: false,
        };
      }
      if (this.allowTransportFallback && hasWire) {
        return {
          transport: 'wire',
          requestedTransport: requested,
          degradedFromRequestedTransport: true,
          emulated: false,
        };
      }
      throw new UnsupportedError(`HTTP transport is unavailable for ${operation}`, {
        feature: `reddb.${operation}.http`,
      });
    }

    if (requested === 'wire') {
      if (hasWire && !requiresHttp.has(operation)) {
        return {
          transport: 'wire',
          requestedTransport: requested,
          degradedFromRequestedTransport: false,
          emulated: false,
        };
      }
      if (this.allowTransportFallback && hasHttp) {
        return {
          transport: 'http',
          requestedTransport: requested,
          degradedFromRequestedTransport: true,
          emulated: false,
        };
      }
      throw new UnsupportedError(`Wire transport cannot satisfy ${operation}`, {
        feature: `reddb.${operation}.wire`,
      });
    }

    if (!this.allowTransportFallback) {
      throw new UnsupportedError(`gRPC transport is not implemented for ${operation}`, {
        feature: `reddb.${operation}.grpc`,
      });
    }

    return requiresHttp.has(operation) ? preferHttpThenWire() : preferWireThenHttp();
  }

  private buildEnvelope<T>(
    operation: string,
    data: T,
    resolution: TransportResolution,
    startedAt: number,
    started: number
  ): RedDbOperationEnvelope<T> {
    const queryStats = buildQueryStats(data);

    return {
      data,
      transport: resolution.transport,
      requestedTransport: resolution.requestedTransport,
      degradedFromRequestedTransport: resolution.degradedFromRequestedTransport,
      emulated: resolution.emulated,
      metrics: {
        operation,
        requestedTransport: resolution.requestedTransport,
        transport: resolution.transport,
        degradedFromRequestedTransport: resolution.degradedFromRequestedTransport,
        emulated: resolution.emulated,
        startedAt,
        durationMs: Number((performance.now() - started).toFixed(3)),
        ...queryStats,
      },
    };
  }
}

export function createRedDbClient(options: RedDbClientOptions = {}): RedDbClient {
  return new RedDbClient(options);
}

export function reddb(options: RedDbClientOptions = {}): RedDbClient {
  return createRedDbClient(options);
}
